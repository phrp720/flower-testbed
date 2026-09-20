import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';

/**
 * AES-256-GCM for provider API keys at rest.
 *
 * Stored format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *
 * The key never lives in the database. It comes from AGENT_SECRET_KEY, falling
 * back to NEXTAUTH_SECRET so development does not gain a hard new required env.
 * Rotating the key makes every stored secret undecryptable by design -- callers
 * must surface that as "re-enter your API key", not as a 500.
 */

const VERSION = 'v1';
const SALT = 'flower-testbed-agent';
const IV_BYTES = 12;

export class SecretKeyMissingError extends Error {
  constructor() {
    super(
      'No encryption key configured. Set AGENT_SECRET_KEY in your environment ' +
        '(generate one with: openssl rand -base64 32) before saving an API key.'
    );
    this.name = 'SecretKeyMissingError';
  }
}

export class SecretDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretDecryptionError';
  }
}

let cachedKey: Buffer | null = null;
let cachedSource: string | null = null;
let warnedAboutFallback = false;

function getKeyMaterial(): string | null {
  const explicit = process.env.AGENT_SECRET_KEY;
  if (explicit && explicit.length > 0) return explicit;

  const fallback = process.env.NEXTAUTH_SECRET;
  if (fallback && fallback.length > 0) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        '[secrets] AGENT_SECRET_KEY is not set; deriving the encryption key from ' +
          'NEXTAUTH_SECRET. Set AGENT_SECRET_KEY so rotating your auth secret does ' +
          'not invalidate stored API keys.'
      );
    }
    return fallback;
  }

  return null;
}

/** scrypt is deliberately slow, so the derived key is cached per key material. */
function getKey(): Buffer {
  const material = getKeyMaterial();
  if (!material) throw new SecretKeyMissingError();

  if (cachedKey && cachedSource === material) return cachedKey;

  cachedKey = scryptSync(material, SALT, 32);
  cachedSource = material;
  return cachedKey;
}

export function isSecretKeyConfigured(): boolean {
  return getKeyMaterial() !== null;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretDecryptionError(`Unrecognised secret format (expected ${VERSION}:iv:tag:ciphertext).`);
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Almost always a rotated key. Never echo the ciphertext or the cause.
    throw new SecretDecryptionError(
      'Stored secret could not be decrypted. The encryption key has most likely ' +
        'changed -- re-enter your API key in Settings.'
    );
  }
}

/** Last 4 characters, for display. Never round-trips the secret itself. */
export function secretHint(plaintext: string): string {
  return plaintext.length <= 4 ? '****' : plaintext.slice(-4);
}

/** Opaque, comparable digest for API tokens. Tokens are never stored in the clear. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): { token: string; prefix: string; hash: string } {
  const token = `ftb_${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 12), hash: hashToken(token) };
}
