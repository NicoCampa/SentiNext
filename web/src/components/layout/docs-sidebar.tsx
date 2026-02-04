"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Dictionary, SupportedLocale } from "@/lib/i18n";

export function DocsSidebar({ dict, lang }: { dict: Dictionary; lang: SupportedLocale }) {
    const pathname = usePathname();

    // We construct the nav items using the translated labels from the dictionary
    const sidebarNavItems = [
        {
            title: dict.docs.sidebar.overview,
            items: [
                {
                    title: dict.docs.sidebar.introduction,
                    href: `/${lang}/docs`,
                },
                {
                    title: dict.docs.sidebar.gettingStarted,
                    href: `/${lang}/docs/getting-started`,
                },
            ],
        },
        {
            title: dict.docs.sidebar.coreFeatures,
            items: [
                {
                    title: dict.docs.sidebar.ingestingReviews,
                    href: `/${lang}/docs/ingesting-reviews`,
                },
                {
                    title: dict.docs.sidebar.insightsTaxonomy,
                    href: `/${lang}/docs/insights-and-taxonomy`,
                },
            ],
        },
        {
            title: dict.docs.sidebar.configuration,
            items: [
                {
                    title: dict.docs.sidebar.authentication,
                    href: `/${lang}/docs/authentication`,
                },
                {
                    title: dict.docs.sidebar.adminData,
                    href: `/${lang}/docs/admin-and-data`,
                },
            ],
        },
        {
            title: dict.docs.sidebar.support,
            items: [
                {
                    title: dict.docs.sidebar.faq,
                    href: `/${lang}/docs/faq`,
                },
            ],
        },
    ];

    return (
        <aside className="w-full md:w-64 flex-shrink-0">
            <div className="sticky top-24">
                <nav className="flex flex-col gap-6">
                    {sidebarNavItems.map((group, index) => (
                        <div key={index} className="flex flex-col gap-4">
                            <h4 className="font-mono text-[10px] font-bold tracking-[0.3em] text-[#00F0FF] uppercase opacity-70 border-b border-[#00F0FF]/10 pb-2">
                                {group.title}
                            </h4>
                            <div className="flex flex-col gap-3">
                                {group.items.map((item, itemIndex) => (
                                    <Link
                                        key={itemIndex}
                                        href={item.href}
                                        className={cn(
                                            "text-xs font-bold uppercase tracking-widest transition-all hover:text-[#00F0FF] hover:translate-x-1",
                                            pathname === item.href
                                                ? "text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                                                : "text-muted-foreground/60"
                                        )}
                                    >
                                        <span className={cn("mr-2", pathname === item.href ? "inline" : "hidden")}>{" > "}</span>
                                        {item.title}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>
            </div>
        </aside>
    );
}
