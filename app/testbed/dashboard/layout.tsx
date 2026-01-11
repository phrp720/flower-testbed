import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Dashboard | Flower Testbed",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}