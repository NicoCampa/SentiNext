"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, Sliders, BarChart2, Layers } from "lucide-react";

export default function ProductPage() {
    return (
        <div className="flex flex-col min-h-screen">
            {/* Hero */}
            <section className="py-20 md:py-28 bg-background border-b border-border/40">
                <div className="container px-4 md:px-6 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                    >
                        The complete review intelligence pipeline.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-lg text-muted-foreground max-w-3xl mx-auto mb-10"
                    >
                        From raw Steam data to categorized, quantified insights. See how SentiNext transforms noise into signal.
                    </motion.p>
                </div>
            </section>

            {/* Feature 1: Ingest */}
            <FeatureSection
                id="ingest"
                icon={<Search className="h-6 w-6 text-primary" />}
                title="1. Search & Ingest"
                description="Connect to any Steam App ID. SentiNext fetches thousands of reviews in seconds, respecting Steam's API rate limits and handling pagination automatically."
                details={[
                    "Filter by date range, language, and playtime.",
                    "Smart caching allows offline re-analysis.",
                    "Persist data to PostgreSQL for long-term tracking."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-card border border-border/50 rounded-lg p-6 flex flex-col gap-4">
                        <div className="h-10 bg-background border border-border/30 rounded flex items-center px-4 text-muted-foreground text-sm">
                            Stardew Valley (413150)
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Fetching reviews...</span>
                                <span>1,240 / 5,000</span>
                            </div>
                            <div className="h-2 w-full bg-secondary/20 rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-[25%]" />
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Feature 2: Classify */}
            <FeatureSection
                id="classify"
                icon={<Layers className="h-6 w-6 text-secondary" />}
                title="2. Auto-Classification"
                description="Our fine-tuned LLM pipeline reads every review to identify specific issues and feature requests, not just generic sentiment."
                details={[
                    "Distinguishes between bugs, requests, and praise.",
                    "Normalizes varying terms (e.g., 'lag', 'stutter', 'fps drop all map to 'Performance').",
                    "Uses evidence extraction to quote the exact user complaint."
                ]}
                align="right"
                mockup={
                    <div className="w-full h-full bg-card border border-border/50 rounded-lg p-6 flex flex-col gap-4 font-mono text-xs">
                        <div className="p-3 bg-background/50 rounded border border-border/30">
                            <span className="text-muted-foreground">"Game keeps crashing on launch since the update."</span>
                        </div>
                        <div className="flex gap-2">
                            <div className="px-2 py-1 rounded bg-red-500/20 text-red-300 border border-red-500/30">Issue: Crash</div>
                            <div className="px-2 py-1 rounded bg-secondary/20 text-secondary border border-secondary/30">Context: Launch</div>
                        </div>
                    </div>
                }
            />

            {/* Feature 3: Insights */}
            <FeatureSection
                id="insights"
                icon={<BarChart2 className="h-6 w-6 text-blue-400" />}
                title="3. Aggregated Insights"
                description="View a high-level dashboard of what matters most. SentiNext ranks issues by frequency and impact, helping you decide what to fix next."
                details={[
                    "Interactive charts and heatmaps.",
                    "Drill down from category to individual reviews.",
                    "Export data for your own analysis."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-card border border-border/50 rounded-lg p-6 grid grid-cols-2 gap-4">
                        <div className="col-span-1 h-32 bg-background/50 rounded border border-border/30 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-foreground">142</div>
                                <div className="text-xs text-muted-foreground">Performance Reports</div>
                            </div>
                        </div>
                        <div className="col-span-1 h-32 bg-background/50 rounded border border-border/30 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-foreground">86</div>
                                <div className="text-xs text-muted-foreground">Localization Fixes</div>
                            </div>
                        </div>
                        <div className="col-span-2 h-24 bg-background/50 rounded border border-border/30 relative">
                            <div className="absolute inset-x-0 bottom-0 h-[60%] flex items-end justify-around px-4">
                                <div className="w-4 h-[40%] bg-primary/40 rounded-t" />
                                <div className="w-4 h-[70%] bg-primary/60 rounded-t" />
                                <div className="w-4 h-[50%] bg-primary/50 rounded-t" />
                                <div className="w-4 h-[80%] bg-primary rounded-t" />
                                <div className="w-4 h-[60%] bg-primary/50 rounded-t" />
                            </div>
                        </div>
                    </div>
                }
            />

            <section className="py-24 text-center">
                <h2 className="text-3xl font-bold mb-6">Ready to dive in?</h2>
                <Button size="lg" className="h-12 px-8 text-base shadow-[0_0_20px_-5px_var(--primary)]" asChild>
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
        <section id={id} className="py-20 md:py-24 border-b border-border/40 last:border-0 overflow-hidden">
            <div className="container px-4 md:px-6">
                <div className={`flex flex-col md:flex-row gap-12 items-center ${align === 'right' ? 'md:flex-row-reverse' : ''}`}>
                    <div className="flex-1 space-y-6">
                        <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 text-primary mb-4 w-12 h-12">
                            {icon}
                        </div>
                        <h2 className="text-3xl font-bold">{title}</h2>
                        <p className="text-lg text-muted-foreground leading-relaxed">
                            {description}
                        </p>
                        <ul className="space-y-3 pt-4">
                            {details.map((detail: string, i: number) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                                    {detail}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex-1 w-full max-w-md md:max-w-full">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.5 }}
                            className="aspect-square md:aspect-video rounded-xl bg-gradient-to-br from-card to-background border border-border/50 shadow-2xl p-4 md:p-8"
                        >
                            {mockup}
                        </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
