import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare | SENTINEXT",
  description: "Compare Steam games side-by-side with category breakdowns and trend analysis.",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
