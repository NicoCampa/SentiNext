import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | SENTINEXT",
  description: "Manage your account and application preferences.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
