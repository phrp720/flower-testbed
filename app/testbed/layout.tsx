"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navigation from "@/app/components/Navigation";
import Footer from "@/app/components/Footer";
import Spinner from "@/app/components/ui/Spinner";

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
    const { status } = useSession();

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
            <Navigation />
            <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">{children}</main>
            <Footer />
        </div>
    );
}
