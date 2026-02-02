"use client";

import { Tag, CheckSquare, AlertCircle, MessageSquare } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function TaxonomyReferencePage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Taxonomy Reference</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    The complete ontology used by SentiNext agents to classify Steam review telemetry.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <RefSection title="Technical Issues" icon={<AlertCircle className="h-6 w-6" />}>
                    <p className="mb-8 opacity-70">Identifies friction points that prevent users from enjoying the software.</p>
                    <div className="grid gap-6">
                        <TaxonomyLabel name="Performance" description="Stuttering, low FPS, memory leaks, or thermal issues." />
                        <TaxonomyLabel name="Stability" description="Crashes to desktop, freezes, or save-game corruption." />
                        <TaxonomyLabel name="Network" description="Latency, disconnects, matchmaking failure, or desync." />
                        <TaxonomyLabel name="Input" description="Controller deadzones, mouse lag, or keybinding issues." />
                    </div>
                </RefSection>

                <RefSection title="Feature Requests" icon={<MessageSquare className="h-6 w-6" />}>
                    <p className="mb-8 opacity-70">Extracts user desires for new content or workflow improvements.</p>
                    <div className="grid gap-6">
                        <TaxonomyLabel name="Content" description="Requests for new levels, characters, or story expansion." />
                        <TaxonomyLabel name="QoL" description="Quality of Life tweaks (e.g., skip cutscenes, bulk delete)." />
                        <TaxonomyLabel name="Balance" description="Difficulty spikes, weapon/character tuning requests." />
                        <TaxonomyLabel name="Accessibility" description="Colorblind modes, text scaling, or subtitles." />
                    </div>
                </RefSection>

                <RefSection title="Sentiment Layers" icon={<Tag className="h-6 w-6" />}>
                    <p className="mb-8 opacity-70">The underlying emotional tone of the feedback.</p>
                    <div className="grid gap-6">
                        <TaxonomyLabel name="Appreciation" description="High-praise for specific creative or technical elements." />
                        <TaxonomyLabel name="Frustration" description="Negative sentiment explicitly tied to a blocker or design choice." />
                        <TaxonomyLabel name="Constructive" description="Detailed feedback with specific suggestions for improvement." />
                    </div>
                </RefSection>
            </div>
        </div>
    );
}

function RefSection({ title, icon, children }: any) {
    return (
        <section className="space-y-8">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                    {icon}
                </div>
                <h2 className="text-3xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
            </div>
            <div className="pl-16">
                {children}
            </div>
        </section>
    );
}

function TaxonomyLabel({ name, description }: any) {
    return (
        <div className="relative p-6 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm hover:bg-[#00F0FF]/10 transition-all group">
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex gap-6 items-center">
                <div className="text-[#00F0FF] font-mono font-bold leading-none">{">"}</div>
                <div>
                    <h4 className="font-bold uppercase tracking-widest mb-1 group-hover:text-[#00F0FF] transition-colors">{name}</h4>
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-[0.1em]">{description}</p>
                </div>
            </div>
        </div>
    );
}
