"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarNavItems = [
    {
        title: "Overview",
        items: [
            {
                title: "Introduction",
                href: "/docs",
            },
            {
                title: "Getting Started",
                href: "/docs/getting-started",
            },
        ],
    },
    {
        title: "Core Features",
        items: [
            {
                title: "Ingesting Reviews",
                href: "/docs/ingesting-reviews",
            },
            {
                title: "Insights & Taxonomy",
                href: "/docs/insights-and-taxonomy",
            },
        ],
    },
    {
        title: "Configuration",
        items: [
            {
                title: "Authentication",
                href: "/docs/authentication",
            },
            {
                title: "Admin & Data",
                href: "/docs/admin-and-data",
            },
        ],
    },
    {
        title: "Support",
        items: [
            {
                title: "FAQ",
                href: "/docs/faq",
            },
        ],
    },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="container px-4 md:px-6 py-16 flex flex-col md:flex-row gap-16 relative">
            <div className="absolute inset-0 bg-[#00F0FF]/[0.02] -z-10" />
            {/* Sidebar */}
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

            {/* Main Content */}
            <main className="flex-1 min-w-0 max-w-4xl prose prose-invert 
                prose-headings:font-bold prose-headings:tracking-tighter prose-headings:uppercase
                prose-h1:text-5xl prose-h1:mb-12
                prose-h2:text-2xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:text-[#00F0FF]/80
                prose-p:text-lg prose-p:leading-relaxed prose-p:text-foreground/70 prose-p:font-light
                prose-li:text-lg prose-li:my-4 prose-li:text-foreground/70
                prose-strong:text-foreground prose-strong:font-bold
                prose-code:text-[#00F0FF] prose-code:bg-[#00F0FF]/10 prose-code:border prose-code:border-[#00F0FF]/20 prose-code:px-2 prose-code:py-0.5 prose-code:rounded-sm
                prose-a:text-[#00F0FF] prose-a:no-underline hover:prose-a:text-[#00F0FF]/80
                ">
                {children}
            </main>
        </div>
    );
}
