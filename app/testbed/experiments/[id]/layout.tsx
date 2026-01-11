import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
    title: "Experiment | Flower Testbed",
};

export default function ExperimentsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}