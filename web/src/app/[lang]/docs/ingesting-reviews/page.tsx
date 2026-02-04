"use client";

import { Search, Database, ShieldCheck } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";

export default function IngestingReviewsPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Review Ingestion</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    SentiNext fetches public Steam reviews for a given <code>AppID</code> and stores them so you can analyze, search, and export them later.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsStep
                    number="01"
                    title="Fetch From Steam"
                    icon={<Search className="h-6 w-6" />}
                    description="We paginate Steam's reviews endpoint and collect review text plus useful metadata."
                >
                    <p>
                        Reviews are pulled from the public Steam reviews API (no Steam login required). We store fields like language, recommendation, timestamps, helpful votes, and playtime so you can filter and drill down later.
                    </p>
                </DocsStep>

                <DocsStep
                    number="02"
                    title="Filters & Safety"
                    icon={<ShieldCheck className="h-6 w-6" />}
                    description="Rate limits, deduplication, and optional filters keep runs reliable."
                >
                    <p>
                        The backend supports fetching recent, updated, best, or all reviews and can work across multiple languages. The hosted dashboard focuses on recent reviews and keeps limits in place to stay fast and stable.
                    </p>
                </DocsStep>

                <DocsStep
                    number="03"
                    title="Persistence Layer"
                    icon={<Database className="h-6 w-6" />}
                    description="PostgreSQL storage for search, exports, and repeat analyses."
                >
                    <p>
                        Data is persisted to PostgreSQL along with the AI labels and evidence quotes. If you analyze the same game again, cached labels can be reused instead of re-calling the model.
                    </p>
                </DocsStep>
            </div>

            <section className="p-10 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm relative overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <h2 className="text-2xl font-bold tracking-widest uppercase mb-6">Defaults & Limits</h2>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">Dashboard Default</div>
                        <div className="text-3xl font-bold font-mono">1,000 REV/RUN</div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">Backend Fetch Cap (Default)</div>
                        <div className="text-3xl font-bold font-mono">5,000 REV</div>
                    </div>
                </div>
            </section>
        </div>
    );
}

type DocsStepProps = {
    number: string;
    title: string;
    icon: ReactNode;
    description: string;
    children: ReactNode;
};

function DocsStep({ number, title, icon, description, children }: DocsStepProps) {
    return (
        <section className="space-y-6 group">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm transition-colors group-hover:bg-[#00F0FF] group-hover:text-black">
                    {icon}
                </div>
                <h3 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
                <div className="text-sm font-mono text-[#00F0FF]/40 font-bold tracking-widest">PHASE {number}</div>
            </div>
            <div className="pl-16 space-y-4">
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">{description}</p>
                <div className="pt-4 border-l-2 border-[#00F0FF]/10 pl-8">
                    {children}
                </div>
            </div>
        </section>
    );
}
