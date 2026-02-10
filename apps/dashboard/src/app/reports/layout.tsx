import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reports | SENTINEXT",
  description: "Generate and download executive summary reports for Steam game review analysis.",
};

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
