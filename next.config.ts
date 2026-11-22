import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function git(cmd: string): string | undefined {
    try {
        return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
    } catch {
        return undefined;
    }
}

// Resolved once at build time. Docker builds have no .git (see .dockerignore),
// so CI passes APP_VERSION / GIT_COMMIT as build args; local builds fall back to git.
// A release tag wins; otherwise (dev/staging) the short commit hash is shown.
const version = process.env.APP_VERSION || git("describe --tags --exact-match HEAD");
const commit = (process.env.GIT_COMMIT || git("rev-parse HEAD"))?.slice(0, 7);

const nextConfig: NextConfig = {
    output: "standalone",
    env: {
        NEXT_PUBLIC_APP_VERSION: version ?? "",
        NEXT_PUBLIC_GIT_COMMIT: commit ?? "",
    },
};

export default nextConfig;
