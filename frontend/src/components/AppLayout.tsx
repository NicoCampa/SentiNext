'use client';

import type { ComponentType, SVGProps } from "react";
import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { SignedIn, useClerk, useUser } from "@clerk/nextjs";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { useCredits } from "@/contexts/CreditsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useSupportNotification } from "@/contexts/SupportNotificationContext";
import { useTracking } from "@/hooks/useTracking";
import { AnalysisWidget } from "@/components/AnalysisWidget";
import { SentiNextLogo } from "@/components/SentiNextLogo";
import { createCheckoutSession } from "@/lib/api";

interface AppLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarContent?: ReactNode;
}

/* ── Inline SVG nav icons (Lucide-style, 24×24 viewBox) ── */
type IconProps = SVGProps<SVGSVGElement>;
const IconHome = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>);
const IconChat = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IconCompare = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>);
const IconReports = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>);
const IconSupport = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>);
const IconDatabase = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>);
const IconAdmin = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>);
const IconSettings = (p: IconProps) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>);

const LOCK_ICON = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <rect x="5" y="10" width="14" height="10" rx="3" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10V8a4 4 0 118 0v2" />
    <circle cx="12" cy="15" r="1.2" />
  </svg>
);

export function AppLayout({ children, showSidebar = true, sidebarContent }: AppLayoutProps) {
  const pathname = usePathname();
  const { density } = useUiPreferences();
  const { t } = useLanguage();
  const { openUserProfile, signOut } = useClerk();
  const { user } = useUser();
  const { isAdmin } = useAdminStatus();
  const { credits } = useCredits();
  const [sidebarUpgradeLoading, setSidebarUpgradeLoading] = useState<string | null>(null);

  async function handleSidebarUpgrade(tier: "indie") {
    setSidebarUpgradeLoading(tier);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createCheckoutSession(
        tier,
        `${baseUrl}/settings?upgrade=success`,
        `${baseUrl}/settings?upgrade=cancelled`,
        "monthly"
      );
      if (result.checkout_url) {
        window.location.href = result.checkout_url;
      }
    } catch (err) {
      console.error("Failed to create checkout session", err);
    } finally {
      setSidebarUpgradeLoading(null);
    }
  }
  const { userUnreadCount, adminUnreadCount, showWelcomeBadge } = useSupportNotification();
  const track = useTracking();
  const compact = density === "compact";
  const tierLabelMap: Record<string, string> = {
    free: "Free",
    indie: "Indie",
    max: "Enterprise",
  };
  const tierLabel = credits?.tier ? (tierLabelMap[credits.tier] ?? credits.tier) : null;
  const tierBadgeClass = credits?.tier === "max"
    ? "border-purple-500/30 bg-purple-500/10 text-purple-400"
    : credits?.tier === "indie"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : "border-slate-500/30 bg-slate-500/10 text-slate-300";

  // Get notification count for support/inbox (include welcome badge for first-time users)
  const supportNotificationCount = isAdmin ? adminUnreadCount : userUnreadCount;
  const effectiveSupportCount = supportNotificationCount + (showWelcomeBadge ? 1 : 0);

  const navItems = useMemo(() => {
    const items: Array<{ href: string; label: string; mobileLabel?: string; icon: ComponentType<IconProps>; hasNotification?: boolean }> = [
      { href: "/dashboard?view=home", label: t('nav.home'), icon: IconHome },
      { href: "/chat", label: t('nav.chat'), mobileLabel: t('nav.chatMobile'), icon: IconChat },
      { href: "/compare", label: t('nav.compare'), icon: IconCompare },
      { href: "/reports", label: t('nav.reports'), icon: IconReports },
    ];

    if (isAdmin) {
      items.push({ href: "/admin?tab=support", label: t('nav.inbox'), icon: IconSupport, hasNotification: true });
    } else {
      items.push({ href: "/support", label: t('nav.support'), icon: IconSupport, hasNotification: true });
    }

    if (isAdmin) {
      items.push({ href: "/database", label: t('nav.database'), icon: IconDatabase });
      items.push({ href: "/admin", label: "Admin", icon: IconAdmin });
    }

    items.push({ href: "/settings", label: t('nav.settings'), icon: IconSettings });
    return items;
  }, [t, isAdmin]);

  // Filter out settings from main nav - it goes at bottom
  const sidebarNavItems = navItems.filter((item) => item.href !== "/settings");

  const isActiveRoute = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || (path !== "/" && pathname.startsWith(path));
  };

  return (
    <div className="min-h-screen w-full">
      {/* Sidebar */}
      {showSidebar && (
        <aside className="hidden w-72 flex-shrink-0 border-r border-[rgb(0,255,255)]/10 bg-[rgb(5,5,15)]/95 backdrop-blur-xl lg:block fixed left-0 top-0 h-screen overflow-y-auto z-30">
          <div className="flex h-full flex-col p-6">
            {/* Logo Section */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <SentiNextLogo size="sm" />
                <div>
                  <h1 className="text-xl font-bold tracking-wider">
                    <span className="text-white">
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
                {sidebarNavItems.map((item) => {
                  const restricted = !!("restricted" in item && item.restricted);
                  const active = isActiveRoute(item.href);
                  const showNotification = item.hasNotification && effectiveSupportCount > 0;
                  const activeClasses = restricted
                    ? "bg-orange-500/15 border-l-2 border-orange-400 text-orange-300"
                    : "bg-[rgb(0,255,255)]/10 border-l-2 border-[rgb(0,255,255)] text-[rgb(0,255,255)]";
                  const inactiveClasses = restricted
                    ? "border-l-2 border-transparent text-orange-300/80 hover:text-orange-200 hover:bg-orange-500/10 hover:border-orange-400/60"
                    : "border-l-2 border-transparent text-[rgb(150,150,170)] hover:text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/5 hover:border-[rgb(0,255,255)]/50";
                  const codeClasses = restricted
                    ? "text-orange-400/70 group-hover:text-orange-300"
                    : "text-[rgb(0,255,255)]/40 group-hover:text-[rgb(0,255,255)]/60";
                  return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => track("nav_click", { category: "navigation", target: item.label })}
                    className={clsx(
                      "group flex items-center gap-3 px-4 py-3 transition-all duration-200 relative",
                      compact ? "py-2" : "py-3",
                      active ? activeClasses : inactiveClasses
                    )}
                  >
                    <item.icon className={clsx("h-4 w-4 flex-shrink-0", codeClasses)} />
                    <span className="text-xs uppercase tracking-[0.2em]">{item.label}</span>
                    {showNotification && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(255,0,128)] px-1.5 text-[10px] font-medium text-white">
                        {effectiveSupportCount > 99 ? "99+" : effectiveSupportCount}
                      </span>
                    )}
                    {active && !showNotification && (
                      <span className={clsx("ml-auto w-1.5 h-1.5 rounded-full", restricted ? "bg-orange-400" : "bg-sky-500")} />
                    )}
                  </Link>
                  );
                })}
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
              {/* Upgrade Banner for Free Users */}
              {credits?.tier === "free" && (
                <div className="border border-[rgb(0,255,255)]/20 bg-gradient-to-b from-[rgb(0,255,255)]/5 to-transparent p-3 space-y-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[rgb(0,255,255)]/70 mb-1">
                      {t('upgrade.banner')}
                    </p>
                    <p className="text-[10px] text-[rgb(150,150,170)] leading-snug">
                      {t('upgrade.unlockMore')}
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() => handleSidebarUpgrade("indie")}
                      disabled={sidebarUpgradeLoading !== null}
                      className="w-full py-1.5 border border-emerald-500/30 text-[10px] uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                    >
                      {sidebarUpgradeLoading === "indie" ? "..." : "Indie $8/mo"}
                    </button>
                  </div>
                </div>
              )}

              {/* Combined User Profile + Settings */}
              <SignedIn>
                <div className="border border-[rgb(0,255,255)]/10 bg-[rgb(10,10,25)]/50 overflow-hidden">
                  {/* User Profile Section */}
                  <button
                    onClick={() => openUserProfile()}
                    className="w-full flex items-center gap-3 p-3 hover:bg-[rgb(0,255,255)]/5 transition-all group text-left border-b border-[rgb(0,255,255)]/10"
                  >
                    {/* Avatar */}
                    <div className="relative">
                      {user?.imageUrl ? (
                        <img
                          src={user.imageUrl}
                          alt="Profile"
                          className="h-9 w-9 rounded-full border border-[rgb(0,255,255)]/30 group-hover:border-[rgb(0,255,255)]/60 transition-colors"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full border border-[rgb(0,255,255)]/30 bg-[rgb(0,255,255)]/10 flex items-center justify-center">
                          <span className="text-[rgb(0,255,255)] text-sm font-bold">
                            {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-[rgb(0,255,136)] rounded-full border-2 border-[rgb(10,10,25)]" />
                    </div>
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[rgb(200,200,210)] truncate group-hover:text-white transition-colors">
                        {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'User'}
                      </p>
                      <p className="text-[9px] uppercase tracking-[0.15em] text-[rgb(0,255,255)]/40 group-hover:text-[rgb(0,255,255)]/60 transition-colors">
                        Account
                      </p>
                    </div>
                    {tierLabel && (
                      <span className={clsx(
                        "rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]",
                        tierBadgeClass
                      )}>
                        {tierLabel}
                      </span>
                    )}
                  </button>

                  {/* Settings Link */}
                  <Link
                    href="/settings"
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 transition-all duration-200",
                      isActiveRoute("/settings")
                        ? "bg-[rgb(0,255,255)]/10 text-[rgb(0,255,255)]"
                        : "text-[rgb(150,150,170)] hover:text-[rgb(0,255,255)] hover:bg-[rgb(0,255,255)]/5"
                    )}
                  >
                    <IconSettings className="w-4 h-4" />
                    <span className="text-xs uppercase tracking-[0.2em]">{t('nav.settings')}</span>
                    {isActiveRoute("/settings") && (
                      <span className="ml-auto w-1.5 h-1.5 bg-[rgb(0,255,255)] rounded-full" />
                    )}
                  </Link>

                  {/* Sign Out */}
                  <button
                    onClick={() => signOut()}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-[rgb(150,150,170)] hover:text-rose-400 hover:bg-rose-500/5 transition-all duration-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="text-xs uppercase tracking-[0.2em]">Sign Out</span>
                  </button>
                </div>
              </SignedIn>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="w-full pb-24 lg:pb-0 lg:pl-72">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {showSidebar && (
        <nav
          aria-label="Primary"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-[rgb(0,255,255)]/20 bg-[rgb(5,5,15)]/95 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))" }}
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[rgb(0,255,255)]/50 to-transparent" />

          <div className="mx-auto flex max-w-lg items-center justify-around px-1 pt-1">
            {navItems.map((item) => {
              const active = isActiveRoute(item.href);
              const showNotification = item.hasNotification && supportNotificationCount > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-1 py-1 transition-all duration-200 relative rounded-lg",
                    active
                      ? "text-[rgb(0,255,255)] bg-[rgb(0,255,255)]/10"
                      : "text-[rgb(100,100,120)] active:bg-white/5"
                  )}
                >
                  {showNotification && (
                    <span className="absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(255,0,128)] px-1 text-[8px] font-medium text-white">
                      {effectiveSupportCount > 9 ? "9+" : effectiveSupportCount}
                    </span>
                  )}
                  <item.icon className="h-4 w-4 mb-0.5" />
                  <span className="text-[10px] uppercase tracking-[0.1em] font-medium">{item.mobileLabel || item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Global Analysis Progress Widget */}
      <AnalysisWidget />
    </div>
  );
}
