"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, BarChart2, Layers, MessageSquare } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n";

export default function ProductClient({ dict }: { dict: Dictionary }) {
    return (
        <div className="flex flex-col min-h-screen">
            {/* Hero */}
            <section className="relative w-full py-20 md:py-32 lg:py-48 flex flex-col items-center justify-center border-b border-[#00F0FF]/10 overflow-hidden">
                <div className="scanline" />
                <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-6xl mx-auto">
                    <motion.h1
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="text-5xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase"
                    >
                        Intelligence <br /><span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Pipeline.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60"
                    >
                        From Steam reviews to structured insights, with evidence.
                    </motion.p>
                </div>
            </section>

            {/* Feature 1: Ingest */}
            <FeatureSection
                id="ingest"
                icon={<Search className="h-7 w-7 text-[#00F0FF]" />}
                title="1. Search & Ingest"
                description="Search a game (name or App ID) and run an analysis. SENTINEXT fetches recent Steam reviews and saves results to your local database."
                details={[
                    "Search by name or paste an App ID.",
                    "Fetch recent reviews from Steam (public endpoint; no Steam login).",
                    "Runs in the background with progress tracking and PostgreSQL persistence."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-6 md:p-8 grid grid-cols-2 gap-4 md:gap-6 relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        {/* Left: Search */}
                        <div className="space-y-3">
                            <div className="text-[10px] text-[#00F0FF]/60 font-mono uppercase tracking-widest mb-2">Search Game</div>
                            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/20 rounded-sm p-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <Search className="w-3.5 h-3.5 text-[#00F0FF]/50" />
                                    <span className="text-[#00F0FF] text-xs font-mono">Stardew Valley</span>
                                </div>
                                {[{ name: 'Stardew Valley', id: '413150', selected: true }, { name: 'Stardew Valley Expanded', id: '1234567', selected: false }].map((game, i) => (
                                    <motion.div
                                        key={game.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.2 + i * 0.15 }}
                                        className={`p-2 mb-1.5 flex items-center gap-2 rounded-sm ${game.selected ? 'bg-[#00F0FF]/10 border border-[#00F0FF]/30' : 'bg-black/20 border border-transparent'}`}
                                    >
                                        <div className="w-5 h-5 bg-[#00F0FF]/20 rounded-sm flex-shrink-0" />
                                        <div className="min-w-0">
                                            <span className="text-[11px] text-white block truncate">{game.name}</span>
                                            <span className="text-[9px] text-[#00F0FF]/40 font-mono">{game.id}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                        {/* Right: Progress */}
                        <div className="space-y-3">
                            <div className="text-[10px] text-[#00F0FF]/60 font-mono uppercase tracking-widest mb-2">Ingestion</div>
                            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/20 rounded-sm p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-[#00F0FF]/50 font-mono">Fetching reviews...</span>
                                    <span className="text-xs text-[#00F0FF] font-mono font-bold">847/1000</span>
                                </div>
                                <div className="h-1.5 w-full bg-[#00F0FF]/10 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: "85%" }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 1.2, delay: 0.5 }}
                                        className="h-full bg-[#00F0FF]"
                                    />
                                </div>
                                {[
                                    { text: 'Connecting to Steam API...', delay: 0.6 },
                                    { text: 'Fetching page 1/10...', delay: 0.9 },
                                    { text: '847 reviews ingested', delay: 1.2 },
                                ].map((log, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: log.delay }}
                                        className="text-[10px] font-mono text-[#00F0FF]/50 flex items-center gap-1.5"
                                    >
                                        <span className="text-[#00F0FF]/30">{" > "}</span>{log.text}
                                    </motion.div>
                                ))}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 1.5 }}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-sm"
                                >
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">PostgreSQL: persisting</span>
                                </motion.div>
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Feature 2: Classify */}
            <FeatureSection
                id="classify"
                icon={<Layers className="h-7 w-7 text-[#00F0FF]" />}
                title="2. Classification"
                description="AI labels each review with a consistent taxonomy and extracts evidence quotes."
                details={[
                    "Assigns 1-6 tags (e.g., technical/performance, ui_ux_accessibility/quality_of_life).",
                    "Separates issues vs feature requests.",
                    "Stores verbatim evidence quotes for every tag so you can audit results."
                ]}
                align="right"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-6 md:p-8 flex flex-col gap-4 font-mono text-sm leading-relaxed relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        {/* Review card */}
                        <div className="bg-[#00F0FF]/5 rounded-sm border border-[#00F0FF]/10 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest">Review #847</span>
                                <span className="px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] font-bold uppercase tracking-wider rounded-sm">Negative</span>
                            </div>
                            <p className="italic text-[#00F0FF]/70 text-xs leading-relaxed">
                                &quot;Game keeps crashing mid-battle since the last patch, and the inventory menus are impossible to navigate with a controller.&quot;
                            </p>
                        </div>
                        {/* Classification tags */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest">AI Classification</div>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: 'technical/stability_crashes', color: 'bg-red-500/20 text-red-300 border-red-500/30', type: 'ISSUE', delay: 0.3 },
                                    { label: 'ui_ux_accessibility/menus_hud', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', type: 'ISSUE', delay: 0.5 },
                                    { label: 'technical/compatibility', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', type: 'REQUEST', delay: 0.7 },
                                ].map((tag) => (
                                    <motion.div
                                        key={tag.label}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true }}
                                        transition={{ type: "spring", stiffness: 300, damping: 20, delay: tag.delay }}
                                        className={`px-2.5 py-1.5 rounded-sm border text-[10px] font-bold uppercase tracking-wider ${tag.color}`}
                                    >
                                        {tag.type}: {tag.label.split('/')[1].replaceAll('_', ' ')}
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                        {/* Evidence quotes */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest">Evidence Quotes</div>
                            {[
                                { quote: '"keeps crashing mid-battle"', tag: 'stability_crashes', color: 'border-red-500/50', delay: 0.9 },
                                { quote: '"inventory menus impossible to navigate with controller"', tag: 'menus_hud', color: 'border-amber-500/50', delay: 1.1 },
                            ].map((ev) => (
                                <motion.div
                                    key={ev.tag}
                                    initial={{ opacity: 0, x: -10 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: ev.delay }}
                                    className={`border-l-2 ${ev.color} pl-3 py-1`}
                                >
                                    <p className="text-[11px] italic text-[#00F0FF]/60">{ev.quote}</p>
                                    <p className="text-[9px] text-[#00F0FF]/30 mt-0.5">{" -> "}{ev.tag}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                }
            />

            {/* Feature 3: Insights */}
            <FeatureSection
                id="insights"
                icon={<BarChart2 className="h-7 w-7 text-[#00F0FF]" />}
                title="3. Quantified Insights"
                description="Dashboards, review explorer, AI agent chat, and comparisons: go from numbers to decisions with evidence and drill-down."
                details={[
                    "Dashboard: category breakdown, top issues/requests, and trends.",
                    "AI agent chat: questions and charts grounded in your analyzed data.",
                    "Compare games, export CSV/JSONL, and generate monthly PDF reports."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-6 md:p-8 flex flex-col gap-4 relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        {/* KPI cards */}
                        <div className="grid grid-cols-4 gap-2 md:gap-3">
                            {[
                                { label: 'Recommendation', value: '87%', color: 'text-emerald-400', border: 'border-l-emerald-500' },
                                { label: 'Issue Rate', value: '23%', color: 'text-amber-400', border: 'border-l-amber-500' },
                                { label: 'Request Rate', value: '15%', color: 'text-sky-400', border: 'border-l-sky-500' },
                                { label: 'Reviews', value: '1,000', color: 'text-[#00F0FF]', border: 'border-l-[#00F0FF]' },
                            ].map((kpi, i) => (
                                <motion.div
                                    key={kpi.label}
                                    initial={{ opacity: 0, y: 12 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 0.1 + i * 0.1 }}
                                    className={`bg-[#00F0FF]/5 border border-[#00F0FF]/10 border-l-2 ${kpi.border} rounded-sm p-2.5`}
                                >
                                    <p className="text-[8px] md:text-[9px] uppercase tracking-wider text-[#00F0FF]/40 mb-0.5 truncate">{kpi.label}</p>
                                    <p className={`text-sm md:text-base font-bold ${kpi.color}`}>{kpi.value}</p>
                                </motion.div>
                            ))}
                        </div>
                        {/* Trend chart */}
                        <div className="space-y-2 flex-1">
                            <div className="text-[10px] text-[#00F0FF]/50 font-mono uppercase tracking-widest">Sentiment Trend</div>
                            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 rounded-sm p-3 h-24 md:h-28">
                                <div className="h-full flex items-end gap-1">
                                    {[40, 45, 42, 55, 60, 58, 72, 75, 80, 85, 82, 87].map((value, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ height: 0 }}
                                            whileInView={{ height: `${value}%` }}
                                            viewport={{ once: true }}
                                            transition={{ duration: 0.5, delay: 0.5 + i * 0.05 }}
                                            className="flex-1 bg-[#00F0FF]/50 border-x border-[#00F0FF]/20 rounded-t-sm"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        {/* Category breakdown */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-[#00F0FF]/50 font-mono uppercase tracking-widest">Category Breakdown</div>
                            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/10 rounded-sm p-3 space-y-2.5">
                                {[
                                    { name: 'Gameplay', value: 85, color: 'bg-emerald-500' },
                                    { name: 'Technical', value: 62, color: 'bg-amber-500' },
                                    { name: 'Content', value: 78, color: 'bg-sky-500' },
                                    { name: 'Value', value: 71, color: 'bg-purple-500' },
                                ].map((cat, i) => (
                                    <motion.div
                                        key={cat.name}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 1.0 + i * 0.1 }}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[11px] text-[#00F0FF]/60">{cat.name}</span>
                                            <span className="text-[11px] text-white font-medium">{cat.value}%</span>
                                        </div>
                                        <div className="h-1.5 bg-[#00F0FF]/10 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                whileInView={{ width: `${cat.value}%` }}
                                                viewport={{ once: true }}
                                                transition={{ duration: 0.8, delay: 1.1 + i * 0.1 }}
                                                className={`h-full ${cat.color} rounded-full`}
                                            />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Feature 4: Agent Chat */}
            <FeatureSection
                id="chat"
                icon={<MessageSquare className="h-7 w-7 text-[#00F0FF]" />}
                title="4. Agent Chat"
                description="Ask natural-language questions about your analyzed data. The agent answers with charts, evidence, and quotes from real reviews."
                details={[
                    "Natural-language questions -- no queries to write.",
                    "Answers with inline charts and interactive breakdowns.",
                    "Verbatim review quotes as auditable evidence."
                ]}
                align="right"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-6 md:p-8 flex flex-col gap-4 relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        {/* Chat header */}
                        <div className="flex items-center gap-2 pb-2 border-b border-[#00F0FF]/10">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-[10px] font-mono text-[#00F0FF]/50 uppercase tracking-widest">AI Agent -- Online</span>
                        </div>
                        {/* User message */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="flex justify-end"
                        >
                            <div className="max-w-[80%] bg-[#00F0FF]/10 border border-[#00F0FF]/30 rounded-sm p-3">
                                <p className="text-xs text-white">
                                    What are the top technical issues?
                                </p>
                            </div>
                        </motion.div>
                        {/* Agent response */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.5 }}
                            className="flex gap-3"
                        >
                            <div className="w-7 h-7 flex-shrink-0 bg-[#00F0FF]/20 border border-[#00F0FF]/30 rounded-sm flex items-center justify-center">
                                <MessageSquare className="w-3.5 h-3.5 text-[#00F0FF]" />
                            </div>
                            <div className="flex-1 space-y-3">
                                <p className="text-xs text-[#00F0FF]/70 leading-relaxed">
                                    Across 1,000 reviews, the most reported technical issues are:
                                </p>
                                {/* Inline chart */}
                                <div className="bg-black/30 border border-[#00F0FF]/10 rounded-sm p-3 space-y-2.5">
                                    {[
                                        { label: 'Stability / Crashes', value: 42, color: 'bg-red-500', delay: 0.7 },
                                        { label: 'Performance', value: 31, color: 'bg-amber-500', delay: 0.85 },
                                        { label: 'Networking', value: 18, color: 'bg-sky-500', delay: 1.0 },
                                        { label: 'Save Data', value: 9, color: 'bg-purple-500', delay: 1.15 },
                                    ].map((item) => (
                                        <motion.div
                                            key={item.label}
                                            initial={{ opacity: 0, x: -8 }}
                                            whileInView={{ opacity: 1, x: 0 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: item.delay }}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-[#00F0FF]/50">{item.label}</span>
                                                <span className="text-[10px] text-white font-bold">{item.value}%</span>
                                            </div>
                                            <div className="h-1.5 bg-[#00F0FF]/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    whileInView={{ width: `${item.value}%` }}
                                                    viewport={{ once: true }}
                                                    transition={{ duration: 0.6, delay: item.delay + 0.1 }}
                                                    className={`h-full ${item.color} rounded-full`}
                                                />
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                                {/* Evidence quote */}
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: 1.3 }}
                                    className="border-l-2 border-red-500/50 pl-3 py-1"
                                >
                                    <p className="text-[10px] text-[#00F0FF]/40 uppercase tracking-widest mb-1">Evidence -- stability</p>
                                    <p className="text-[11px] italic text-[#00F0FF]/60">
                                        &quot;Game crashes every time I enter the third act, lost hours of progress.&quot;
                                    </p>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                }
            />

            <section className="py-32 text-center">
                <h2 className="text-4xl font-bold mb-10 tracking-tighter uppercase">System Ready.</h2>
                <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                    <Button size="lg" className="h-16 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)]" asChild>
                        <a href="https://github.com/nicolo-nico/SentiNext" target="_blank" rel="noopener noreferrer">
                            {dict.common.viewOnGithub}
                        </a>
                    </Button>
                    <Button size="lg" variant="outline" className="h-16 px-12 border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-[0.2em] text-xs rounded-none" asChild>
                        <Link href="/en/demo">
                            {dict.common.requestDemo}
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}

type FeatureSectionProps = {
    id: string;
    icon: ReactNode;
    title: string;
    description: string;
    details: string[];
    align: "left" | "right";
    mockup: ReactNode;
};

function FeatureSection({ id, icon, title, description, details, align, mockup }: FeatureSectionProps) {
    return (
        <section id={id} className="py-24 md:py-32 border-b border-[#00F0FF]/10 last:border-0 overflow-hidden">
            <div className="container px-4 md:px-6 mx-auto">
                <div className={`flex flex-col md:flex-row gap-16 lg:gap-24 items-center ${align === 'right' ? 'md:flex-row-reverse' : ''}`}>
                    <motion.div
                        initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="flex-1 space-y-8"
                    >
                        <div className="inline-flex items-center justify-center p-4 rounded-sm bg-[#00F0FF]/5 border border-[#00F0FF]/20 shadow-xl backdrop-blur-sm">
                            {icon}
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase">{title}</h2>
                        <p className="text-xl text-muted-foreground leading-relaxed font-light">
                            {description}
                        </p>
                        <ul className="space-y-4 pt-4">
                            {details.map((detail: string, i: number) => (
                                <li key={i} className="flex items-start gap-4 text-base text-foreground/80 font-light font-mono uppercase tracking-wide opacity-70">
                                    <span className="text-[#00F0FF] font-bold">{" > "}</span>
                                    {detail}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                    <div className="flex-1 w-full max-w-xl md:max-w-full">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8 }}
                            className="aspect-square md:aspect-video rounded-sm bg-gradient-to-br from-[#00F0FF]/5 to-transparent border border-[#00F0FF]/20 shadow-2xl p-6 md:p-10 relative"
                        >
                            <CornerMarkers />
                            {mockup}
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
