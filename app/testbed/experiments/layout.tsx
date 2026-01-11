import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Experiments | Flower Testbed",
};

export default function ExperimentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}