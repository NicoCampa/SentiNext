"use client";

import { Tag } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";

const TAXONOMY: Array<{ main: string; subs: string[] }> = [
    { main: "gameplay", subs: ["mechanics", "controls", "balance", "difficulty", "progression", "ai"] },
    { main: "technical", subs: ["performance", "bugs", "stability_crashes", "compatibility", "networking", "installation", "save_data"] },
    { main: "content_design", subs: ["amount_variety", "level_design", "quests_modes", "narrative_characters", "replayability", "pacing", "customization"] },
    { main: "ui_ux_accessibility", subs: ["menus_hud", "readability", "quality_of_life", "controller_support", "accessibility_options"] },
    { main: "onboarding", subs: ["tutorial", "learning_curve", "clarity", "tooltips"] },
    { main: "presentation", subs: ["visuals_art_style", "animation", "audio_music", "voice_acting", "atmosphere", "localization"] },
    { main: "online_community", subs: ["multiplayer_experience", "matchmaking", "social_features", "toxicity_moderation", "mods_ugc", "cheating_anti_cheat"] },
    { main: "developer_updates", subs: ["patch_quality", "update_frequency", "roadmap_events", "communication", "customer_support", "response_time"] },
    { main: "monetization_value", subs: ["pricing", "regional_pricing", "dlc", "microtransactions", "battle_pass_fomo", "pay_to_win_grind", "value_for_money"] },
    { main: "other", subs: ["general", "mixed", "meta", "unclear", "off_topic", "meme"] },
];

const MAIN_LABELS: Record<string, string> = {
    gameplay: "Gameplay",
    technical: "Technical",
    content_design: "Content & Design",
    ui_ux_accessibility: "UI/UX & Accessibility",
    onboarding: "Onboarding",
    presentation: "Presentation",
    online_community: "Online & Community",
    developer_updates: "Developer & Updates",
    monetization_value: "Monetization & Value",
    other: "Other",
};

const CATEGORY_FREQUENCY: Record<string, number> = {
    gameplay: 85,
    technical: 72,
    content_design: 65,
    ui_ux_accessibility: 45,
    onboarding: 20,
    presentation: 58,
    online_community: 35,
    developer_updates: 28,
    monetization_value: 40,
    other: 15,
};

function titleize(value: string): string {
    return value
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => {
            const lower = word.toLowerCase();
            if (lower === "ui") return "UI";
            if (lower === "ux") return "UX";
            if (lower === "ugc") return "UGC";
            if (lower === "ai") return "AI";
            if (lower === "dlc") return "DLC";
            if (lower === "fomo") return "FOMO";
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
}

export default function TaxonomyReferencePage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">
                    Taxonomy Reference
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    This is the taxonomy currently used by the SENTINEXT classifier. Tags are formatted as <code>{"<main>/<sub>"}</code>, e.g. <code>technical/performance</code>.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                {TAXONOMY.map((group) => (
                    <RefSection
                        key={group.main}
                        title={MAIN_LABELS[group.main] ?? titleize(group.main)}
                        icon={<Tag className="h-6 w-6" />}
                        frequency={CATEGORY_FREQUENCY[group.main] ?? 0}
                    >
                        <p className="mb-8 opacity-70">
                            <span className="font-mono text-xs uppercase tracking-[0.2em]">Main:</span>{" "}
                            <code>{group.main}</code>
                        </p>
                        <div className="grid gap-6">
                            {group.subs.map((sub) => (
                                <TaxonomyLabel
                                    key={`${group.main}/${sub}`}
                                    name={`${group.main}/${sub}`}
                                    description={titleize(sub)}
                                />
                            ))}
                        </div>
                    </RefSection>
                ))}
            </div>
        </div>
    );
}

type RefSectionProps = {
    title: string;
    icon: ReactNode;
    frequency: number;
    children: ReactNode;
};

function RefSection({ title, icon, frequency, children }: RefSectionProps) {
    return (
        <section className="space-y-8">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                    {icon}
                </div>
                <h2 className="text-3xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
            </div>
            <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-[#00F0FF]/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00F0FF]/40 rounded-full" style={{ width: `${frequency}%` }} />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    ~{frequency}% of reviews mention this category
                </div>
            </div>
            <div className="pl-16">
                {children}
            </div>
        </section>
    );
}

type TaxonomyLabelProps = {
    name: string;
    description: string;
};

function TaxonomyLabel({ name, description }: TaxonomyLabelProps) {
    return (
        <div className="relative p-6 border border-[#00F0FF]/10 bg-[rgb(10,10,25)]/50 rounded-sm hover:bg-[rgb(10,10,25)]/70 transition-all group">
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
