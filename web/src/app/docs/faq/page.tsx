"use client";

import { HelpCircle, ChevronRight } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function FaqPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Protocol FAQ</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    Frequent queries regarding agent deployment and telemetry classification.
                </p>
            </section>

            <div className="space-y-12 mt-16 max-w-3xl">
                <FaqItem
                    question="Is SentiNext affiliated with Valve/Steam?"
                    answer="No. SentiNext is an independent autonomous tool that consumes the public Steam Community telemetry. We operate as a high-precision analysis layer for developers, not as a branch of Valve Corporation. We are not endorsed by or affiliated with Valve."
                />
                <FaqItem
                    question="Can I analyze competitive telemetry?"
                    answer="Yes. The system can initialize agents for any valid Steam AppID. This is a standard protocol for competitive benchmarking and identifying market friction points in similar software."
                />
                <FaqItem
                    question="Why is the analysis job in queue?"
                    answer="Neural processing is horizontally scaled. Depending on volume, a job may take 30-60 minutes to complete extraction of 50,000+ data nodes. The system will dispatch an email once the analysis is committed to the database."
                />
                <FaqItem
                    question="When will billing be enabled?"
                    answer="We are currently in Public Beta. All plans are free during this period. We expect to enable credit-based billing models in Late 2026. Beta users will receive legacy discounts."
                />
            </div>
        </div>
    );
}

function FaqItem({ question, answer }: any) {
    return (
        <div className="group relative p-8 border border-[#00F0FF]/10 bg-[#00F0FF]/5 hover:bg-[#00F0FF]/10 transition-all rounded-sm overflow-hidden">
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex gap-6 items-start">
                <div className="p-2 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm mt-1">
                    <HelpCircle className="h-4 w-4" />
                </div>
                <div className="space-y-4">
                    <h3 className="text-xl font-bold tracking-widest uppercase group-hover:text-[#00F0FF] transition-colors">{question}</h3>
                    <p className="text-foreground/70 leading-relaxed font-light">{answer}</p>
                </div>
            </div>
        </div>
    );
}
