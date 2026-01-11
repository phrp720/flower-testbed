import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "New Experiment | Flower Testbed",
};

export default function NewExperimentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}