"use client";

import { Brain, Quote, Tag, Layers } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";

export default function InsightsAndTaxonomyPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Insights & Taxonomy</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    Each Steam review is labeled with a consistent taxonomy (e.g., <code>technical/performance</code>) and backed by evidence quotes you can audit.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <TaxonomySection
                    title="Label Structure"
                    description="How SENTINEXT represents feedback in a consistent, queryable format."
                >
                    <div className="grid gap-8">
                        <TaxonomyItem
                            icon={<Brain className="h-5 w-5" />}
                            title="Main Categories"
                            items={[
                                "gameplay",
                                "technical",
                                "content_design",
                                "ui_ux_accessibility",
                                "onboarding",
                                "presentation",
                                "online_community",
                                "developer_updates",
                                "monetization_value",
                                "other",
                            ]}
                        />
                        <TaxonomyItem
                            icon={<Tag className="h-5 w-5" />}
                            title="Issue vs Request"
                            items={[
                                "issue_subcategories: complaints/problems",
                                "request_subcategories: explicit asks",
                                "subcategories: 1–6 total tags",
                            ]}
                        />
                        <TaxonomyItem
                            icon={<Layers className="h-5 w-5" />}
                            title="Evidence Quotes"
                            items={[
                                "1–3 short quotes per tag",
                                "quotes are verbatim from the review",
                                "used to audit and share findings",
                            ]}
                        />
                    </div>
                </TaxonomySection>

                <section className="space-y-8">
                    <div className="flex items-center gap-6">
                        <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                            <Quote className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-widest uppercase m-0">Evidence Extraction</h2>
                        <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
                    </div>

                    <div className="space-y-6">
                        <p className="font-light text-foreground/70 leading-relaxed max-w-2xl">
                            Labels are only useful if you can verify them. SENTINEXT attaches short, verbatim quotes to every tag so you can trace an insight back to the original wording.
                        </p>

                        <div className="relative p-10 bg-black/40 border border-[#00F0FF]/10 rounded-sm italic font-mono text-[#00F0FF]/80">
                            <CornerMarkers className="opacity-30" />
                            &quot;The game is great but it crashes every time I try to load the second level.&quot;
                            <div className="mt-8 pt-6 border-t border-[#00F0FF]/10 flex flex-wrap gap-3 not-italic">
                                <span className="bg-[#00F0FF]/10 border border-[#00F0FF]/30 px-3 py-1 rounded-sm text-[10px] font-bold text-[#00F0FF] tracking-tighter uppercase">technical/stability_crashes</span>
                                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-sm text-[10px] font-bold text-white tracking-tighter uppercase">content_design/level_design</span>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

type TaxonomySectionProps = {
    title: string;
    description: string;
    children: ReactNode;
};

function TaxonomySection({ title, description, children }: TaxonomySectionProps) {
    return (
        <section className="space-y-6">
            <h2 className="text-2xl font-bold tracking-widest uppercase">{title}</h2>
            <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">{description}</p>
            <div className="pt-8 border-l-2 border-[#00F0FF]/10 pl-8">
                {children}
            </div>
        </section>
    );
}

type TaxonomyItemProps = {
    icon: ReactNode;
    title: string;
    items: string[];
};

function TaxonomyItem({ icon, title, items }: TaxonomyItemProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 text-[#00F0FF]">
                {icon}
                <span className="font-bold font-mono text-sm uppercase tracking-widest">{title}</span>
            </div>
            <div className="flex flex-wrap gap-4">
                {items.map((item: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 font-mono text-xs uppercase tracking-wide opacity-60">
                        <span className="text-[#00F0FF]">{">"}</span>
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );
}
