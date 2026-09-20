import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Settings | Flower Testbed",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
