"use client";

import Link from "next/link";
import Image from "next/image";

export default function Navigation() {
    return (
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-200">
            <Link href="/testbed/dashboard" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition">
                <Image
                    src="/testbed-icon-v2.png"
                    alt="Flower Testbed"
                    width={70}
                    height={70}
                />
                <h1 className="text-2xl font-bold text-gray-900">Flower Testbed</h1>
            </Link>
        </div>
    );
}