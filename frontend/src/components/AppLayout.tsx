'use client';

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { AnalysisWidget } from "@/components/AnalysisWidget";

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
    { href: "/dashboard?view=home", label: "Home", code: "01" },
    { href: "/chat", label: "Chat", code: "02" },
    { href: "/compare", label: "Compare", code: "03" },
    { href: "/database", label: "Database", code: "04" },
    { href: "/settings", label: "Settings", code: "05" },
  ];
  const sidebarNavItems = navItems.filter((item) => item.href !== "/settings");

  const isActiveRoute = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || (path !== "/" && pathname.startsWith(path));
  };

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <aside className="hidden w-72 flex-shrink-0 border-r border-[rgb(0,255,255)]/10 bg-[rgb(5,5,15)]/95 backdrop-blur-xl lg:block">
          <div className="flex h-full flex-col p-6">
            {/* Logo Section */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 border border-[rgb(0,255,255)]/50 flex items-center justify-center">
                  <span className="text-[rgb(0,255,255)] text-xl font-bold">SN</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-wider cyber-gradient-text">
                    SENTINEXT
                  </h1>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-[rgb(0,255,136)] rounded-full animate-pulse" />
                    <span className="text-[9px] uppercase tracking-[0.3em] text-[rgb(0,255,255)]/50">
                      System Online
                    </span>
                  </div>
                </div>
              </div>
              <div className="cyber-divider mt-4" />
            </div>

            {/* Navigation */}
            <div className="space-y-1">
              <p className="hud-label mb-3">
                Navigation
              </p>
              <nav className="space-y-1">
                {sidebarNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "group flex items-center gap-3 px-4 py-3 transition-all duration-200 relative",
                      compact ? "py-2" : "py-3",
                      isActiveRoute(item.href)
                        ? "bg-[rgb(0,255,255)]/10 border-l-2 border-[rgb(0,255,255)] text-[rgb(0,255,255)]"
                        : "border-l-2 border-transparent text-[rgb(150,150,170)] hover:text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/5 hover:border-[rgb(0,255,255)]/50"
                    )}
                  >
                    <span className="text-[10px] font-mono text-[rgb(0,255,255)]/40 group-hover:text-[rgb(0,255,255)]/60">
                      {item.code}
                    </span>
                    <span className="text-xs uppercase tracking-[0.2em]">{item.label}</span>
                    {isActiveRoute(item.href) && (
                      <span className="ml-auto w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full shadow-[0_0_10px_rgb(0,255,255)]" />
                    )}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Custom sidebar content */}
            {sidebarContent && (
              <div className="flex-1 overflow-y-auto mt-6 border-t border-[rgb(0,255,255)]/10 pt-6">
                {sidebarContent}
              </div>
            )}

            {/* Bottom section */}
            <div className="mt-auto pt-6 border-t border-[rgb(0,255,255)]/10">
              {/* User Profile */}
              <div className="flex items-center justify-between p-4 bg-[rgb(10,10,25)] border border-[rgb(0,255,255)]/20 mb-3">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-[rgb(0,255,255)]/50">
                    Operator
                  </p>
                  <p className="text-xs text-[rgb(200,200,210)]">Active Session</p>
                </div>
                <SignedIn>
                  <UserButton
                    appearance={{
                      elements: {
                        userButtonAvatarBox: "h-9 w-9 border border-[rgb(0,255,255)]/30",
                      },
                    }}
                  />
                </SignedIn>
              </div>

              {/* Settings Link */}
              <Link
                href="/settings"
                className="flex items-center justify-between p-4 border border-[rgb(0,255,255)]/10 text-[rgb(150,150,170)] hover:border-[rgb(0,255,255)]/30 hover:text-[rgb(0,255,255)] transition-all duration-200 group"
              >
                <span className="text-xs uppercase tracking-[0.2em]">System Config</span>
              </Link>

              {/* Version Info */}
              <div className="mt-4 flex items-center justify-between text-[9px] text-[rgb(0,255,255)]/30 uppercase tracking-wider">
                <span>v0.1.0</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[rgb(0,255,136)] rounded-full" />
                  Stable
                </span>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-0 relative">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/30 to-transparent" />

        {children}
      </main>

      {/* Analysis Widget */}
      <AnalysisWidget />

      {/* Mobile Bottom Navigation */}
      {showSidebar && (
        <nav
          aria-label="Primary"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[rgb(0,255,255)]/20 bg-[rgb(5,5,15)]/95 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/50 to-transparent" />

          <div className="mx-auto flex max-w-md items-center justify-between gap-1 px-2 pt-2">
            {navItems.map((item) => {
              const active = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex flex-1 flex-col items-center gap-1 px-2 py-2 transition-all duration-200 relative",
                    active
                      ? "text-[rgb(0,255,255)]"
                      : "text-[rgb(100,100,120)] hover:text-[rgb(0,255,255)]"
                  )}
                >
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[rgb(0,255,255)] shadow-[0_0_10px_rgb(0,255,255)]" />
                  )}
                  <span className="text-[8px] uppercase tracking-[0.15em]">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
