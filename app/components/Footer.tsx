"use client";

export default function Footer() {
    return (
        <footer className="mt-12 pt-6 border-t border-gray-200">
            <div className="text-center">
                <p className="text-sm text-gray-600">
                    Powered by{" "}
                    <a
                        href="https://github.com/phrp720"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                        phrp720
                    </a>
                </p>
            </div>
        </footer>
    );
}