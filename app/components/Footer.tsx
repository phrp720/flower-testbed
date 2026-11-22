const REPO_URL = "https://github.com/phrp720/flower-testbed";

const version = process.env.NEXT_PUBLIC_APP_VERSION;
const commit = process.env.NEXT_PUBLIC_GIT_COMMIT;

// Release builds show the tag (e.g. v0.2.2); dev/staging builds show the commit hash.
const build = version
    ? { label: version, href: `${REPO_URL}/releases/tag/${version}` }
    : commit
      ? { label: commit, href: `${REPO_URL}/commit/${commit}` }
      : null;

export default function Footer() {
    return (
        <footer className="mt-auto border-t border-line">
            <div className="max-w-7xl mx-auto px-6 py-4">
                <p className="text-xs text-ink-subtle">
                    Flower Testbed ·{" "}
                    {build && (
                        <>
                            <a
                                href={build.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono hover:text-ink-muted transition-colors"
                            >
                                {build.label}
                            </a>
                            {" · "}
                        </>
                    )}
                    <a
                        href="https://github.com/phrp720"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-ink-muted transition-colors"
                    >
                        phrp720
                    </a>
                </p>
            </div>
        </footer>
    );
}
