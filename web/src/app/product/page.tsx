"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, Sliders, BarChart2, Layers } from "lucide-react";

export default function ProductPage() {
    return (
        <div className="flex flex-col min-h-screen">
            {/* Hero */}
            <section className="py-20 md:py-32 bg-transparent relative overflow-hidden">
                <div className="container px-4 md:px-6 text-center relative z-10 mx-auto">
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="text-5xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight"
                    >
                        The Complete <br /><span className="text-secondary tracking-[-0.05em]">Intelligence Pipeline.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto mb-10 font-light leading-relaxed"
                    >
                        From raw Steam data to categorized, quantified insights. See how SentiNext transforms noise into signal.
                    </motion.p>
                </div>
            </section>

            {/* Feature 1: Ingest */}
            <FeatureSection
                id="ingest"
                icon={<Search className="h-7 w-7 text-primary" />}
                title="1. Search & Ingest"
                description="Connect to any Steam App ID. SentiNext fetches thousands of reviews in seconds, respecting Steam's API rate limits and handling pagination automatically."
                details={[
                    "Filter by date range, language, and playtime.",
                    "Smart caching allows offline re-analysis.",
                    "Persist data to PostgreSQL for long-term tracking."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-white/10 rounded-2xl p-8 flex flex-col gap-6 glass">
                        <div className="h-12 bg-white/5 border border-white/10 rounded-xl flex items-center px-6 text-muted-foreground text-sm font-mono tracking-wider">
                            Stardew Valley (413150)
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-xs text-muted-foreground font-mono uppercase tracking-widest">
                                <span>Fetching reviews...</span>
                                <span>1,240 / 5,000</span>
                            </div>
                            <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    whileInView={{ width: "25%" }}
                                    className="h-full bg-primary"
                                />
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Feature 2: Classify */}
            <FeatureSection
                id="classify"
                icon={<Layers className="h-7 w-7 text-secondary" />}
                title="2. Auto-Classification"
                description="Our fine-tuned LLM pipeline reads every review to identify specific issues and feature requests, not just generic sentiment."
                details={[
                    "Distinguishes between bugs, requests, and praise.",
                    "Normalizes varying terms (e.g., 'lag' -> 'Performance').",
                    "Uses evidence extraction to quote the exact user complaint."
                ]}
                align="right"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-white/10 rounded-2xl p-8 flex flex-col gap-6 font-mono text-sm leading-relaxed glass">
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10 italic text-muted-foreground">
                            "Game keeps crashing on launch since the update."
                        </div>
                        <div className="flex gap-3">
                            <div className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-bold uppercase tracking-wider">Issue: Crash</div>
                            <div className="px-3 py-1.5 rounded-lg bg-secondary/20 text-secondary border border-secondary/30 text-xs font-bold uppercase tracking-wider">Context: Launch</div>
                        </div>
                    </div>
                }
            />

            {/* Feature 3: Insights */}
            <FeatureSection
                id="insights"
                icon={<BarChart2 className="h-7 w-7 text-primary-foreground" />}
                title="3. Aggregated Insights"
                description="View a high-level dashboard of what matters most. SentiNext ranks issues by frequency and impact, helping you decide what to fix next."
                details={[
                    "Interactive charts and heatmaps.",
                    "Drill down from category to individual reviews.",
                    "Export data for your own analysis."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-white/10 rounded-2xl p-8 grid grid-cols-2 gap-6 glass">
                        <div className="col-span-1 h-36 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-foreground tracking-tighter">142</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-widest mt-2">Performance</div>
                            </div>
                        </div>
                        <div className="col-span-1 h-36 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-foreground tracking-tighter">86</div>
                                <div className="text-xs text-muted-foreground uppercase tracking-widest mt-2">Localization</div>
                            </div>
                        </div>
                        <div className="col-span-2 h-28 bg-white/5 rounded-2xl border border-white/10 relative overflow-hidden">
                            <div className="absolute inset-x-0 bottom-0 h-[70%] flex items-end justify-around px-8">
                                {[40, 70, 50, 90, 60, 80].map((h, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ height: 0 }}
                                        whileInView={{ height: `${h}%` }}
                                        className="w-6 bg-primary/40 rounded-t-lg border-x border-white/5"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                }
            />

            <section className="py-32 text-center">
                <h2 className="text-4xl font-bold mb-10 tracking-tighter">Ready to dive in?</h2>
                <Button size="lg" className="h-16 px-12 text-lg rounded-full shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-transform hover:scale-105" asChild>
                    <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                        Open SentiNext Dashboard
                    </Link>
                </Button>
            </section>
        </div>
    );
}

function FeatureSection({ id, icon, title, description, details, align, mockup }: any) {
    return (
        <section id={id} className="py-24 md:py-32 border-b border-white/5 last:border-0 overflow-hidden">
            <div className="container px-4 md:px-6 mx-auto">
                <div className={`flex flex-col md:flex-row gap-16 lg:gap-24 items-center ${align === 'right' ? 'md:flex-row-reverse' : ''}`}>
                    <motion.div
                        initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="flex-1 space-y-8"
                    >
                        <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xl glass">
                            {icon}
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tighter">{title}</h2>
                        <p className="text-xl text-muted-foreground leading-relaxed font-light">
                            {description}
                        </p>
                        <ul className="space-y-4 pt-4">
                            {details.map((detail: string, i: number) => (
                                <li key={i} className="flex items-start gap-4 text-base text-foreground/80 font-light">
                                    <span className="mt-2 text-primary font-bold">/</span>
                                    {detail}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                    <div className="flex-1 w-full max-w-xl md:max-w-full">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, rotate: align === 'left' ? 2 : -2 }}
                            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.8 }}
                            className="aspect-square md:aspect-video rounded-[2.5rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 shadow-2xl p-6 md:p-10 glass-morphism animate-float"
                        >
                            {mockup}
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
