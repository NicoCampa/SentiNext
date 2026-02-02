"use client";

import { motion } from "framer-motion";
import { Search, Database, HardDrive, ShieldCheck } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function IngestingReviewsPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Cloud Ingestion</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    High-throughput Steam Community synchronization. The SentiNext Agent autonomously scales ingestion to match your project's review volume.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsStep
                    number="01"
                    title="Batch Query"
                    icon={<Search className="h-6 w-6" />}
                    description="The agent initiates a secure handshake with the Steam Community interface."
                >
                    <p>
                        Every cycle, the agent performs a deep scan of the target <code>AppID</code>. It retrieves metadata including playtime, purchase verification, and review text in a structured telemetry format.
                    </p>
                </DocsStep>

                <DocsStep
                    number="02"
                    title="Heuristic Filtering"
                    icon={<ShieldCheck className="h-6 w-6" />}
                    description="Removing noise and outliers for high-precision AI training."
                >
                    <p>
                        Before classification, the system applies strict heuristic filters. We prioritize reviews with verified ownership and minimum playtime thresholds (defaulting to {">"} 2.0h) to ensure the feedback represents actual player experience.
                    </p>
                </DocsStep>

                <DocsStep
                    number="03"
                    title="Persistence Layer"
                    icon={<Database className="h-6 w-6" />}
                    description="Long-term storage for historical sentiment tracking."
                >
                    <p>
                        Filtered data is committed to our <span className="text-[#00F0FF]">PostgreSQL storage layer</span>. This allows for rapid cross-referencing and historical comparisons between different game versions or patches.
                    </p>
                </DocsStep>
            </div>

            <section className="p-10 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm relative overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <h2 className="text-2xl font-bold tracking-widest uppercase mb-6">Quota Protocols</h2>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">Max Throughput</div>
                        <div className="text-3xl font-bold font-mono">2,000 ENV/JOB</div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">Active Clusters</div>
                        <div className="text-3xl font-bold font-mono">1 PER USER</div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function DocsStep({ number, title, icon, description, children }: any) {
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
