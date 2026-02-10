import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | SENTINEXT",
  description: "Analyze Steam game reviews with AI-powered classification and actionable insights.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
