import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Chat | Flower Testbed",
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
