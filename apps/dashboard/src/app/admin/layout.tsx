import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
