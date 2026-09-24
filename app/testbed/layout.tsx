"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navigation from "@/app/components/Navigation";
import SystemBanner from "@/app/components/SystemBanner";
import Footer from "@/app/components/Footer";
import Spinner from "@/app/components/ui/Spinner";
import { cn } from "@/app/components/ui/cn";

/**
 * The frame every signed-in page sits in.
 *
 * The chrome lives here rather than in each page: previously every page
 * rendered its own Navigation, Footer and container, which is how their widths
 * and paddings drifted apart. A page now renders only its own content.
 *
 * The chat route opts out of the centred column, because a conversation with a
 * sidebar wants the full viewport height rather than a scrolling page.
 */
export default function TestbedLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { status } = useSession();

    /**
     * The chat is a full-height pane with its own scrollback rather than a
     * document that ends, so it sizes itself from what is left instead of
     * subtracting a guessed amount of chrome. Padding is tighter here for the
     * same reason: on a view fixed to the viewport, every pixel of margin is a
     * pixel taken off the conversation.
     */
    const fills = pathname?.startsWith("/testbed/chat") ?? false;

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login");
    }, [status, router]);

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size={20} label="Loading" />
            </div>
        );
    }

    if (status === "unauthenticated") return null;

    return (
        <div className="min-h-screen flex flex-col">
            <SystemBanner />
            <Navigation />
            <main
                className={cn(
                    "flex-1 w-full max-w-7xl mx-auto px-6",
                    // min-h-0 is what lets a flex child shrink below its content
                    // and so lets the chat pane size itself from what is left.
                    fills ? "py-5 flex flex-col min-h-0" : "py-8"
                )}
            >
                {children}
            </main>
            <Footer />
        </div>
    );
}
