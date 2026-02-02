'use client';

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { SignedIn, useClerk, useUser } from "@clerk/nextjs";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarContent?: ReactNode;
}

export function AppLayout({ children, showSidebar = true, sidebarContent }: AppLayoutProps) {
  const pathname = usePathname();
  const { density } = useUiPreferences();
  const { t } = useLanguage();
  const { openUserProfile } = useClerk();
  const { user } = useUser();
  const compact = density === "compact";

  const navItems = [
    { href: "/dashboard?view=home", label: t('nav.home'), code: "01" },
    { href: "/chat", label: t('nav.chat'), code: "02" },
    { href: "/compare", label: t('nav.compare'), code: "03" },
    { href: "/database", label: t('nav.database'), code: "04" },
    { href: "/settings", label: t('nav.settings'), code: "05" },
  ];
  // Filter out settings from main nav - it goes at bottom
  const sidebarNavItems = navItems.filter((item) => item.href !== "/settings");

  const isActiveRoute = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || (path !== "/" && pathname.startsWith(path));
  };

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <aside className="hidden w-72 flex-shrink-0 border-r border-[rgb(0,255,255)]/10 bg-[rgb(5,5,15)]/95 backdrop-blur-xl lg:block fixed left-0 top-0 h-screen overflow-y-auto z-30">
          <div className="flex h-full flex-col p-6">
            {/* Logo Section */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 border border-[rgb(0,255,255)]/50 flex items-center justify-center">
                  <span className="text-[rgb(0,255,255)] text-xl font-bold">SN</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-wider">
                    <span className="bg-gradient-to-r from-sky-300 via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                      SENTINEXT
                    </span>
                  </h1>
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
                      <span className="ml-auto w-1.5 h-1.5 bg-sky-500 rounded-full" />
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
            <div className="mt-auto pt-6 border-t border-[rgb(0,255,255)]/10 space-y-3">
              {/* User Profile - Fully Clickable */}
              <SignedIn>
                <button
                  onClick={() => openUserProfile()}
                  className="w-full flex items-center gap-3 p-3 bg-[rgb(10,10,25)]/50 border border-[rgb(0,255,255)]/10 hover:border-[rgb(0,255,255)]/30 hover:bg-[rgb(10,10,25)] transition-all group text-left"
                >
                  {/* Avatar */}
                  <div className="relative">
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt="Profile"
                        className="h-10 w-10 rounded-full border border-[rgb(0,255,255)]/30 group-hover:border-[rgb(0,255,255)]/60 transition-colors"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full border border-[rgb(0,255,255)]/30 bg-[rgb(0,255,255)]/10 flex items-center justify-center">
                        <span className="text-[rgb(0,255,255)] text-sm font-bold">
                          {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[rgb(0,255,136)] rounded-full border-2 border-[rgb(10,10,25)]" />
                  </div>
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[rgb(200,200,210)] truncate group-hover:text-white transition-colors">
                      {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/50 group-hover:text-[rgb(0,255,255)]/70 transition-colors">
                      Manage Account
                    </p>
                  </div>
                  {/* Arrow */}
                  <span className="text-[rgb(0,255,255)]/30 group-hover:text-[rgb(0,255,255)] transition-colors">
                    →
                  </span>
                </button>
              </SignedIn>

              {/* Settings Link */}
              <Link
                href="/settings"
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 transition-all duration-200",
                  isActiveRoute("/settings")
                    ? "bg-[rgb(0,255,255)]/10 border border-[rgb(0,255,255)]/30 text-[rgb(0,255,255)]"
                    : "border border-[rgb(0,255,255)]/10 text-[rgb(150,150,170)] hover:text-[rgb(0,255,255)] hover:border-[rgb(0,255,255)]/30 hover:bg-[rgb(0,255,255)]/5"
                )}
              >
                <span className="text-sm">⚙</span>
                <span className="text-xs uppercase tracking-[0.2em]">{t('nav.settings')}</span>
                {isActiveRoute("/settings") && (
                  <span className="ml-auto w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                )}
              </Link>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="min-w-0 flex-1 pb-24 lg:pb-0 lg:pl-72 relative">
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/30 to-transparent" />

        {children}
      </main>

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
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-sky-500" />
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
