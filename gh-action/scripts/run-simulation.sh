#!/usr/bin/env bash
# run-simulation.sh — Triggers a Flower federated learning simulation on a testbed instance.
#
# Environment variables (set by action.yml):
#   TESTBED_URL, TESTBED_USERNAME, TESTBED_PASSWORD
#   SIMULATION_FOLDER, EXPERIMENT_NAME, FRAMEWORK
#   NUM_CLIENTS, NUM_ROUNDS, CLIENT_FRACTION, LOCAL_EPOCHS, LEARNING_RATE
#   WAIT_FOR_COMPLETION, TIMEOUT_MINUTES
#   GITHUB_REPOSITORY, GITHUB_SHA

set -euo pipefail

# ─── Helpers ────────────────────────────────────────────────────────────────

log()  { echo "::notice::$*"; }
info() { echo "[flower-testbed] $*"; }
fail() { echo "::error::$*"; exit 1; }

require_cmd() { command -v "$1" &>/dev/null || fail "Required command not found: $1"; }

# ─── Prerequisites ───────────────────────────────────────────────────────────

require_cmd curl
require_cmd jq

# ─── Configuration ───────────────────────────────────────────────────────────

TESTBED_URL="${TESTBED_URL%/}"   # strip trailing slash

# Enforce HTTPS to prevent credentials being sent in cleartext
# TODO after development uncomment
#if [[ "$TESTBED_URL" != https://* ]]; then
#  fail "TESTBED_URL must use HTTPS (got: ${TESTBED_URL}). Refusing to send credentials over an unencrypted connection."
#fi
SIMULATION_FOLDER="${SIMULATION_FOLDER:-flower-simulation}"
FRAMEWORK="${FRAMEWORK:-pytorch}"
NUM_CLIENTS="${NUM_CLIENTS:-10}"
NUM_ROUNDS="${NUM_ROUNDS:-3}"
CLIENT_FRACTION="${CLIENT_FRACTION:-0.5}"
LOCAL_EPOCHS="${LOCAL_EPOCHS:-1}"
LEARNING_RATE="${LEARNING_RATE:-0.01}"
WAIT_FOR_COMPLETION="${WAIT_FOR_COMPLETION:-false}"
TIMEOUT_MINUTES="${TIMEOUT_MINUTES:-60}"

# Derive experiment name
if [ -z "${EXPERIMENT_NAME:-}" ]; then
  SHORT_SHA="${GITHUB_SHA:0:7}"
  REPO_NAME="${GITHUB_REPOSITORY##*/}"
  EXPERIMENT_NAME="${REPO_NAME}@${SHORT_SHA}"
fi

# Temp file for session cookie
COOKIE_JAR="$(mktemp /tmp/flower-testbed-cookies.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# ─── Step 1: Validate testbed is reachable ───────────────────────────────────

info "Checking testbed at ${TESTBED_URL} ..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${TESTBED_URL}/api/auth/csrf" || true)
if [ "$HTTP_STATUS" != "200" ]; then
  fail "Testbed not reachable at ${TESTBED_URL} (HTTP ${HTTP_STATUS}). Check TESTBED_URL."
fi

# ─── Step 2: Authenticate with NextAuth ─────────────────────────────────────

info "Authenticating ..."

# 2a. Fetch CSRF token
CSRF_RESPONSE=$(curl -s --cookie-jar "$COOKIE_JAR" \
  "${TESTBED_URL}/api/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | jq -r '.csrfToken // empty')
[ -n "$CSRF_TOKEN" ] || fail "Could not retrieve CSRF token from testbed."

# 2b. Sign in with credentials
SIGNIN_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  --cookie "$COOKIE_JAR" --cookie-jar "$COOKIE_JAR" \
  -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=${CSRF_TOKEN}" \
  --data-urlencode "username=${TESTBED_USERNAME}" \
  --data-urlencode "password=${TESTBED_PASSWORD}" \
  --data-urlencode "redirect=false" \
  --data-urlencode "callbackUrl=${TESTBED_URL}" \
  --data-urlencode "json=true" \
  "${TESTBED_URL}/api/auth/callback/credentials")

# NextAuth returns 200 or 302 on success
if [ "$SIGNIN_HTTP" != "200" ] && [ "$SIGNIN_HTTP" != "302" ]; then
  fail "Authentication failed (HTTP ${SIGNIN_HTTP}). Check TESTBED_USERNAME and TESTBED_PASSWORD."
fi

# Verify we actually got a session (a quick check against a protected endpoint)
SESSION_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  --cookie "$COOKIE_JAR" \
  "${TESTBED_URL}/api/experiments")
if [ "$SESSION_CHECK" = "401" ]; then
  fail "Authentication failed: credentials were rejected by the testbed."
fi

info "Authenticated successfully."

# ─── Step 3: Scan simulation folder and upload files ────────────────────────

# Resolve to an absolute path and confirm it stays inside the workspace
SIMULATION_FOLDER="$(realpath -m "$SIMULATION_FOLDER")"
WORKSPACE="$(realpath "${GITHUB_WORKSPACE:-.}")"
if [[ "$SIMULATION_FOLDER" != "$WORKSPACE"* ]]; then
  fail "simulation_folder must be inside the repository workspace. Got: ${SIMULATION_FOLDER}"
fi
[ -d "$SIMULATION_FOLDER" ] || fail "Simulation folder not found: ${SIMULATION_FOLDER}"

ALGORITHM_PATH=""
MODEL_PATH=""
CONFIG_PATH=""
DATASET_PATH=""

upload_file() {
  local filepath="$1"
  local file_type="$2"
  local filename
  filename="$(basename "$filepath")"

  info "Uploading ${file_type}: ${filename} ..."

  UPLOAD_RESPONSE=$(curl -s \
    --cookie "$COOKIE_JAR" \
    -X POST \
    -F "file=@${filepath};filename=${filename}" \
    -F "type=${file_type}" \
    "${TESTBED_URL}/api/upload")

  local success
  success=$(echo "$UPLOAD_RESPONSE" | jq -r '.success // false')
  if [ "$success" != "true" ]; then
    local err
    err=$(echo "$UPLOAD_RESPONSE" | jq -r '.error // "unknown error"')
    fail "Failed to upload ${file_type} file '${filename}': ${err}"
  fi

  echo "$UPLOAD_RESPONSE" | jq -r '.path'
}

# Scan folder for files matching naming conventions
while IFS= read -r -d '' filepath; do
  filename="$(basename "$filepath")"
  ext="${filename##*.}"
  name_lower="${filename,,}"

  case "$name_lower" in
    algorithm*.py)
      if [ -z "$ALGORITHM_PATH" ]; then
        ALGORITHM_PATH="$(upload_file "$filepath" algorithm)"
      else
        info "Skipping extra algorithm file: ${filename}"
      fi
      ;;
    model*.py|model*.pt|model*.pth)
      if [ -z "$MODEL_PATH" ]; then
        MODEL_PATH="$(upload_file "$filepath" model)"
      else
        info "Skipping extra model file: ${filename}"
      fi
      ;;
    config*.py|config*.json|config*.yaml|config*.yml)
      if [ -z "$CONFIG_PATH" ]; then
        CONFIG_PATH="$(upload_file "$filepath" config)"
      else
        info "Skipping extra config file: ${filename}"
      fi
      ;;
    dataset*.py)
      if [ -z "$DATASET_PATH" ]; then
        DATASET_PATH="$(upload_file "$filepath" dataset)"
      else
        info "Skipping extra dataset file: ${filename}"
      fi
      ;;
  esac
done < <(find "$SIMULATION_FOLDER" -maxdepth 1 -type f -print0 | sort -z)

missing=()
[ -z "$ALGORITHM_PATH" ] && missing+=("algorithm*.py")
[ -z "$MODEL_PATH" ]     && missing+=("model*.py/pt/pth")
[ -z "$CONFIG_PATH" ]    && missing+=("config*.py/json/yaml")
[ -z "$DATASET_PATH" ]   && missing+=("dataset*.py")

if [ "${#missing[@]}" -gt 0 ]; then
  log "Skipping simulation: missing required files in '${SIMULATION_FOLDER}': ${missing[*]}"
  exit 0
fi

# ─── Step 4: Create experiment ───────────────────────────────────────────────

info "Creating experiment '${EXPERIMENT_NAME}' ..."

# Build JSON payload (null values are omitted by jq)
PAYLOAD=$(jq -n \
  --arg name          "$EXPERIMENT_NAME" \
  --arg framework     "$FRAMEWORK" \
  --arg algorithmPath "$ALGORITHM_PATH" \
  --arg modelPath     "$MODEL_PATH" \
  --arg configPath    "$CONFIG_PATH" \
  --arg datasetPath   "$DATASET_PATH" \
  --argjson numClients    "$NUM_CLIENTS" \
  --argjson numRounds     "$NUM_ROUNDS" \
  --argjson clientFraction "$CLIENT_FRACTION" \
  --argjson localEpochs   "$LOCAL_EPOCHS" \
  --argjson learningRate  "$LEARNING_RATE" \
  '{
    name: $name,
    framework: $framework,
    numClients: $numClients,
    numRounds: $numRounds,
    clientFraction: $clientFraction,
    localEpochs: $localEpochs,
    learningRate: $learningRate
  }
  + (if $algorithmPath != "" then {algorithmPath: $algorithmPath} else {} end)
  + (if $modelPath     != "" then {modelPath: $modelPath}         else {} end)
  + (if $configPath    != "" then {configPath: $configPath}       else {} end)
  + (if $datasetPath   != "" then {datasetPath: $datasetPath}     else {} end)
  ')

CREATE_RESPONSE=$(curl -s \
  --cookie "$COOKIE_JAR" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "${TESTBED_URL}/api/experiments")

EXPERIMENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.experiment.id // empty')
[ -n "$EXPERIMENT_ID" ] || fail "Failed to create experiment: $(echo "$CREATE_RESPONSE" | jq -r '.error // "unknown error"')"

EXPERIMENT_URL="${TESTBED_URL}/testbed/experiments/${EXPERIMENT_ID}"
info "Experiment created: ID=${EXPERIMENT_ID}  URL=${EXPERIMENT_URL}"

# ─── Step 5: Start experiment ────────────────────────────────────────────────

info "Starting experiment ${EXPERIMENT_ID} ..."

START_RESPONSE=$(curl -s \
  --cookie "$COOKIE_JAR" \
  -X POST \
  "${TESTBED_URL}/api/experiments/${EXPERIMENT_ID}/start")

START_SUCCESS=$(echo "$START_RESPONSE" | jq -r '.success // false')
if [ "$START_SUCCESS" != "true" ]; then
  fail "Failed to start experiment: $(echo "$START_RESPONSE" | jq -r '.error // "unknown error"')"
fi

info "Experiment started. View progress at: ${EXPERIMENT_URL}"

# ─── Step 6: Optionally wait for completion ──────────────────────────────────

FINAL_STATUS="running"
FINAL_ACCURACY=""
FINAL_LOSS=""

if [ "${WAIT_FOR_COMPLETION,,}" = "true" ]; then
  info "Waiting for experiment to complete (timeout: ${TIMEOUT_MINUTES} min) ..."

  TIMEOUT_SECS=$(( TIMEOUT_MINUTES * 60 ))
  ELAPSED=0
  POLL_INTERVAL=15

  while [ "$ELAPSED" -lt "$TIMEOUT_SECS" ]; do
    sleep "$POLL_INTERVAL"
    ELAPSED=$(( ELAPSED + POLL_INTERVAL ))

    POLL_RESPONSE=$(curl -s \
      --cookie "$COOKIE_JAR" \
      "${TESTBED_URL}/api/experiments/${EXPERIMENT_ID}")

    FINAL_STATUS=$(echo "$POLL_RESPONSE" | jq -r '.experiment.status // "unknown"')
    CURRENT_ROUND=$(echo "$POLL_RESPONSE" | jq -r '.experiment.numRounds // 0')
    TOTAL_ROUNDS=$(echo "$POLL_RESPONSE"  | jq -r '.experiment.numRounds // 0')

    # Get latest round metrics if available
    LATEST_ROUND=$(echo "$POLL_RESPONSE" | jq -r '(.metrics // []) | last | .round // 0')

    info "Status: ${FINAL_STATUS} | Round: ${LATEST_ROUND}/${TOTAL_ROUNDS} | Elapsed: ${ELAPSED}s"

    if [ "$FINAL_STATUS" = "completed" ] || [ "$FINAL_STATUS" = "failed" ]; then
      FINAL_ACCURACY=$(echo "$POLL_RESPONSE" | jq -r '.experiment.finalAccuracy // ""')
      FINAL_LOSS=$(echo "$POLL_RESPONSE"     | jq -r '.experiment.finalLoss // ""')
      break
    fi
  done

  if [ "$FINAL_STATUS" = "completed" ]; then
    info "Experiment completed successfully."
    [ -n "$FINAL_ACCURACY" ] && info "Final accuracy: ${FINAL_ACCURACY}"
    [ -n "$FINAL_LOSS" ]     && info "Final loss:     ${FINAL_LOSS}"
  elif [ "$FINAL_STATUS" = "failed" ]; then
    ERROR_MSG=$(curl -s --cookie "$COOKIE_JAR" \
      "${TESTBED_URL}/api/experiments/${EXPERIMENT_ID}" | \
      jq -r '.experiment.errorMessage // "unknown error"')
    fail "Experiment failed: ${ERROR_MSG}"
  else
    fail "Experiment timed out after ${TIMEOUT_MINUTES} minutes (status: ${FINAL_STATUS})."
  fi
fi

# ─── Step 7: Set GitHub Action outputs ──────────────────────────────────────
# Strip newlines from all values before writing to $GITHUB_OUTPUT to prevent
# output variable injection via a compromised testbed response.

sanitize() { echo "${1//$'\n'/}" | tr -d '\r'; }

{
  echo "experiment_id=$(sanitize "$EXPERIMENT_ID")"
  echo "experiment_url=$(sanitize "$EXPERIMENT_URL")"
  echo "status=$(sanitize "$FINAL_STATUS")"
  echo "final_accuracy=$(sanitize "$FINAL_ACCURACY")"
  echo "final_loss=$(sanitize "$FINAL_LOSS")"
} >> "$GITHUB_OUTPUT"
