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
        <div className="container px-4 md:px-6 py-10 flex flex-col md:flex-row gap-10">
            {/* Sidebar */}
            <aside className="w-full md:w-64 flex-shrink-0">
                <div className="sticky top-24">
                    <nav className="flex flex-col gap-6">
                        {sidebarNavItems.map((group, index) => (
                            <div key={index} className="flex flex-col gap-2">
                                <h4 className="font-bold text-sm tracking-wide text-foreground uppercase">{group.title}</h4>
                                {group.items.map((item, itemIndex) => (
                                    <Link
                                        key={itemIndex}
                                        href={item.href}
                                        className={cn(
                                            "text-sm transition-colors hover:text-primary",
                                            pathname === item.href
                                                ? "text-primary font-medium"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        {item.title}
                                    </Link>
                                ))}
                            </div>
                        ))}
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 prose prose-invert prose-headings:font-heading prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-primary prose-code:bg-secondary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                {children}
            </main>
        </div>
    );
}
