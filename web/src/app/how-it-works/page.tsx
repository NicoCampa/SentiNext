"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Cloud, Database, FileText, Search, Server, BrainCircuit } from "lucide-react";

export default function HowItWorksPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <section className="py-20 md:py-28 bg-background border-b border-border/40">
                <div className="container px-4 md:px-6 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                    >
                        Under the hood.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-lg text-muted-foreground max-w-3xl mx-auto mb-10"
                    >
                        SentiNext combines robust data engineering with modern LLMs to turn unstructured text into structured databases.
                    </motion.p>
                </div>
            </section>

            <section className="py-24 bg-card/30">
                <div className="container px-4 md:px-6">
                    <div className="flex flex-col gap-12 relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden lg:block absolute left-1/2 top-4 bottom-4 w-0.5 bg-gradient-to-b from-primary/10 via-primary/50 to-primary/10 -translate-x-1/2" />

                        <PipelineStep
                            step="1"
                            title="Ingestion"
                            icon={<Cloud className="h-6 w-6 text-blue-400" />}
                            description="The user provides a Steam App ID. SentiNext queries the Steam Community API to fetch recent reviews, handling pagination and rate limits efficiently."
                            align="left"
                            delay={0.1}
                        />

                        <PipelineStep
                            step="2"
                            title="Preprocessing"
                            icon={<FileText className="h-6 w-6 text-gray-400" />}
                            description="Reviews are cleaned, deduped, and filtered based on your criteria (e.g., minimum playtime, language). We strip noise to focus on signal."
                            align="right"
                            delay={0.2}
                        />

                        <PipelineStep
                            step="3"
                            title="Classification (LLM)"
                            icon={<BrainCircuit className="h-6 w-6 text-secondary" />}
                            description="Each review is passed through our specialized LLM pipeline. It extracts distinct 'issues' and 'requests', normalizing phrasing to a consistent taxonomy."
                            align="left"
                            delay={0.3}
                        />

                        <PipelineStep
                            step="4"
                            title="Storage"
                            icon={<Database className="h-6 w-6 text-green-400" />}
                            description="Structured results—author stats, sentiment, and taxonomy tags—are persisted to a highly optimized PostgreSQL database for instant querying."
                            align="right"
                            delay={0.4}
                        />

                        <PipelineStep
                            step="5"
                            title="Insight Generation"
                            icon={<Server className="h-6 w-6 text-primary" />}
                            description="The frontend queries the database to build real-time aggregations: Top 5 Issues, Feature Request Heatmaps, and Sentiment Trends."
                            align="left"
                            delay={0.5}
                        />
                    </div>
                </div>
            </section>

            <section className="py-24 text-center">
                <h2 className="text-3xl font-bold mb-6">Transparent & Extensible</h2>
                <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                    The entire backend is open source. You can run the ingestion pipeline locally on your machine or use our hosted version.
                </p>
                <div className="flex justify-center gap-4">
                    <Button size="lg" className="h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90" asChild>
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                            Open SentiNext
                        </Link>
                    </Button>
                    <Button size="lg" variant="ghost" asChild>
                        <Link href="/docs/ingesting-reviews">
                            Read the Docs <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}

function PipelineStep({ step, title, icon, description, align, delay }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay }}
            className={`relative flex flex-col md:flex-row gap-8 items-center ${align === 'right' ? 'lg:flex-row-reverse' : ''}`}
        >
            <div className={`flex-1 text-center lg:text-${align === 'left' ? 'right' : 'left'} w-full`}>
                <div className={`inline-flex items-center gap-3 mb-2 font-mono text-sm text-primary`}>
                    <span className="flex items-center justify-center w-6 h-6 rounded-full border border-primary/50 bg-primary/10">{step}</span>
                    {align === 'left' ? 'Phase' : ''}
                </div>
                <h3 className="text-2xl font-bold mb-3 flex items-center gap-3 justify-center lg:justify-end flex-row-reverse">
                    {title}
                    {align === 'left' && <div className="p-2 rounded-lg bg-card border border-border/50">{icon}</div>}
                    {align === 'right' && <div className="p-2 rounded-lg bg-card border border-border/50 hidden">{icon}</div>} {/* Spacer logic fix needed, simplifying */}
                </h3>
                {/* Simple Title Render */}
                <div className={`flex items-center gap-3 justify-center lg:justify-${align === 'left' ? 'end' : 'start'} mb-3`}>
                    {align === 'right' && <div className="p-2 rounded-lg bg-card border border-border/50">{icon}</div>}
                    <span className="text-2xl font-bold">{title}</span>
                    {align === 'left' && <div className="p-2 rounded-lg bg-card border border-border/50">{icon}</div>}
                </div>

                <p className="text-muted-foreground leading-relaxed">{description}</p>
            </div>

            {/* Center Node (Desktop) */}
            <div className="hidden lg:flex w-12 h-12 rounded-full bg-background border-2 border-primary items-center justify-center z-10 shadow-[0_0_15px_-3px_var(--primary)]">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
            </div>

            <div className="flex-1 hidden lg:block" /> {/* Spacer */}
        </motion.div>
    )
}
