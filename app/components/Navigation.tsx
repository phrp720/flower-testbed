"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FlaskConical, Plus, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function Navigation() {
    const pathname = usePathname();

    const handleLogout = () => {
        signOut({ callbackUrl: "/login" });
    };

    const navItems = [
        { href: "/testbed/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/testbed/experiments", label: "Experiments", icon: FlaskConical },
        { href: "/testbed/experiments/new", label: "New Experiment", icon: Plus },
    ];

    return (
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-200">
            <Link href="/testbed/dashboard" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition">
                <Image
                    src="/testbed-icon-v2.png"
                    alt="Flower Testbed"
                    width={50}
                    height={50}
                />
                <h1 className="text-xl font-bold text-gray-900">Flower Testbed</h1>
            </Link>

            <nav className="flex items-center gap-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href === "/testbed/experiments" && pathname?.startsWith("/testbed/experiments/") && pathname !== "/testbed/experiments/new");
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive
                                    ? "bg-blue-100 text-blue-700"
                                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {item.label}
                        </Link>
                    );
                })}
                <div className="w-px h-6 bg-gray-200 mx-2" />
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Logout
                </button>
            </nav>
        </div>
    );
}