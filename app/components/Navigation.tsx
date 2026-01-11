"use client";

import Link from "next/link";
import Image from "next/image";

export default function Navigation() {


    return (
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
                <Image
                    src="/testbed-icon-v2.png"
                    alt="Flower Testbed"
                    width={70}
                    height={70}
                />
                <h1 className="text-2xl font-bold text-gray-900">Flower Testbed</h1>
            </div>

            <div className="flex items-center gap-2">
                <Link
                    href="/testbed/dashboard"
                    className="bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition shadow-sm hover:shadow"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Home</span>
                </Link>
            </div>
        </div>
    );
}