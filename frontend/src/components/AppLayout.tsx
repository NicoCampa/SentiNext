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
    { href: "/dashboard?view=home", label: "Home", icon: "▶" },
    { href: "/chat", label: "Chat", icon: "?" },
    { href: "/compare", label: "Compare", icon: "≈" },
    { href: "/database", label: "Database", icon: "◫" },
    { href: "/settings", label: "Settings", icon: "⚙" },
  ];

  const isActiveRoute = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || (path !== "/" && pathname.startsWith(path));
  };

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
                      isActiveRoute(item.href)
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

      <main className="min-w-0 flex-1 bg-slate-950/70 pb-24 lg:pb-0">
        {children}
      </main>
      {showSidebar && (
        <nav
          aria-label="Primary"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/90 backdrop-blur lg:hidden"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 pt-2">
            {navItems.map((item) => {
              const active = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[9px] uppercase tracking-[0.2em] transition",
                    active
                      ? "bg-white/10 text-sky-200"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <FirstRunSetup />
    </div>
  );
}
