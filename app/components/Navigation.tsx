"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { cn } from "@/app/components/ui/cn";

type Item = { href: string; label: string; icon: IconName };

const ITEMS: Item[] = [
    { href: "/testbed/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/testbed/experiments", label: "Experiments", icon: "experiments" },
    { href: "/testbed/chat", label: "Chat", icon: "chat" },
    { href: "/testbed/settings", label: "Settings", icon: "settings" },
];

/**
 * Whether a nav item owns the current route.
 *
 * Detail routes have to light up their section, and "New experiment" lives
 * under /testbed/experiments/ without being one of them -- so this is a
 * prefix match with that one carve-out, expressed once instead of inline.
 */
function isActive(item: Item, pathname: string | null): boolean {
    if (!pathname) return false;
    if (pathname === item.href) return true;
    if (item.href === "/testbed/experiments") {
        return pathname.startsWith("/testbed/experiments/") && pathname !== "/testbed/experiments/new";
    }
    return pathname.startsWith(`${item.href}/`);
}

export default function Navigation() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-sm border-b border-line">
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
                <Link
                    href="/testbed/dashboard"
                    className="flex items-center gap-0.5 shrink-0 hover:opacity-70 transition-opacity"
                >
                    <Image src="/testbed-icon-v2.png" alt="" width={40} height={40} priority />
                    <span className="text-sm font-semibold text-ink tracking-tight">
                        Flower Testbed
                    </span>
                </Link>

                <nav className="flex items-center gap-0.5">
                    {ITEMS.map((item) => {
                        const active = isActive(item, pathname);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "flex items-center gap-2 px-3 h-8 rounded-[var(--radius)] text-sm transition-colors",
                                    active
                                        ? "bg-surface-muted text-ink font-medium"
                                        : "text-ink-muted hover:text-ink hover:bg-surface-hover"
                                )}
                            >
                                <Icon name={item.icon} size={15} />
                                <span className="hidden sm:inline">{item.label}</span>
                            </Link>
                        );
                    })}

                    <span className="w-px h-5 bg-line mx-2" />

                    <Link
                        href="/testbed/experiments/new"
                        className="flex items-center gap-1.5 px-3 h-8 rounded-[var(--radius)] bg-accent text-ink-inverted text-sm font-medium hover:bg-accent-hover transition-colors"
                    >
                        <Icon name="add" size={15} />
                        <span className="hidden sm:inline">New</span>
                    </Link>

                    <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        aria-label="Log out"
                        title="Log out"
                        className="flex items-center justify-center w-8 h-8 ml-1 rounded-[var(--radius)] text-ink-subtle hover:text-danger hover:bg-danger-surface transition-colors"
                    >
                        <Icon name="logout" size={15} />
                    </button>
                </nav>
            </div>
        </header>
    );
}
