import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat | SENTINEXT",
  description: "Ask questions about game reviews using AI-powered natural language analysis.",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
