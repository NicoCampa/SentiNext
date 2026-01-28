'use client';

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { FirstRunSetup } from "@/components/FirstRunSetup";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarContent?: ReactNode;
}

export function AppLayout({ children, showSidebar = true, sidebarContent }: AppLayoutProps) {
  const pathname = usePathname();
  const { density } = useUiPreferences();
  const compact = density === "compact";

  const navItems = [
    { href: "/dashboard", label: "Analyze", icon: "▶" },
    { href: "/chat", label: "Chat", icon: "?" },
    { href: "/compare", label: "Compare", icon: "≈" },
    { href: "/database", label: "Database", icon: "◫" },
    { href: "/settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100">
      {showSidebar && (
        <aside className="hidden w-80 flex-shrink-0 border-r border-white/10 bg-slate-900/70 px-7 py-10 backdrop-blur lg:block">
          <div className="flex h-full flex-col gap-8 text-sm">
            {/* Logo */}
            <div className="space-y-3 text-left">
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                    SentiNext
                  </span>
                </h1>
                <p className="text-[10px] uppercase tracking-[0.5em] text-slate-400">
                  Game review analytics
                </p>
                <p className="text-xs text-slate-400/85">
                  Understand what players really think.
                </p>
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Navigate</p>
              <nav className="flex flex-col gap-2 text-xs uppercase tracking-[0.25em]">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl border px-4 text-center transition",
                      compact ? "py-2 text-[11px]" : "py-3 text-xs",
                      pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                        ? "border-white/20 bg-white/10 text-slate-100 shadow-lg shadow-indigo-900/20"
                        : "border-white/15 bg-transparent text-slate-300 hover:border-sky-400/60 hover:text-white"
                    )}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Custom sidebar content */}
            {sidebarContent && (
              <div className="flex-1 overflow-y-auto">{sidebarContent}</div>
            )}

          </div>
        </aside>
      )}

      <main className="flex-1 bg-slate-950/70">
        {children}
      </main>
      <FirstRunSetup />
    </div>
  );
}
