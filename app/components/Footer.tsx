"use client";

export default function Footer() {
    return (
        <footer className="mt-8 pt-3 pb-2">
            <div className="text-center">
                <p className="text-xs text-gray-400">
                    Powered by{" "}
                    <a
                        href="https://github.com/phrp720"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-blue-600 transition"
                    >
                        phrp720
                    </a>
                </p>
            </div>
        </footer>
    );
}