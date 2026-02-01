"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Cloud, Database, FileText, Server, BrainCircuit, Cpu } from "lucide-react";

export default function HowItWorksPage() {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            <section className="py-20 md:py-28 bg-background border-b border-border/40 w-full flex justify-center">
                <div className="container px-4 md:px-6 text-center max-w-4xl mx-auto">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight mb-6"
                    >
                        The Intelligence Pipeline.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10"
                    >
                        SentiNext's cloud agent autonomously fetches, processes, and classifies thousands of reviews in minutes.
                    </motion.p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center bg-card/20">
                <div className="container px-4 md:px-6 max-w-5xl mx-auto">
                    <div className="flex flex-col gap-16 relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden lg:block absolute left-1/2 top-4 bottom-4 w-0.5 bg-gradient-to-b from-primary/10 via-primary/40 to-primary/10 -translate-x-1/2" />

                        <PipelineStep
                            step="01"
                            title="Cloud Ingestion"
                            icon={<Cloud className="h-6 w-6 text-primary" />}
                            description="Our cloud fleet queries the Steam Community API for your App ID. We handle rate limiting, pagination, and data cleaning at scale so you don't have to."
                            align="left"
                            delay={0.1}
                        />

                        <PipelineStep
                            step="02"
                            title="Noise Filtering"
                            icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                            description="We automatically discard reviews with low playtime or verified 'off-topic' content, isolating high-signal feedback."
                            align="right"
                            delay={0.2}
                        />

                        <PipelineStep
                            step="03"
                            title="Agent Analysis (LLM)"
                            icon={<Cpu className="h-6 w-6 text-secondary" />}
                            description="The heart of the system. Our fine-tuned AI agent reads every review, extracting specific issues (e.g., 'Crash on Startup') and feature requests into a structured taxonomy."
                            align="left"
                            delay={0.3}
                        />

                        <PipelineStep
                            step="04"
                            title="PostgreSQL Storage"
                            icon={<Database className="h-6 w-6 text-white" />}
                            description="Structured insights are persisted in our high-performance cloud database, ready for instant querying and aggregation."
                            align="right"
                            delay={0.4}
                        />

                        <PipelineStep
                            step="05"
                            title="Insight Dashboard"
                            icon={<BrainCircuit className="h-6 w-6 text-primary" />}
                            description="You get a real-time dashboard showing the top 5 issues driving negative sentiment, backed by evidence."
                            align="left"
                            delay={0.5}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function PipelineStep({ step, title, icon, description, align, delay }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, x: align === 'left' ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay }}
            className={`relative flex flex-col md:flex-row gap-12 items-center ${align === 'right' ? 'lg:flex-row-reverse' : ''}`}
        >
            <div className={`flex-1 text-center lg:text-${align === 'left' ? 'right' : 'left'} w-full`}>
                <div className={`inline-flex items-center gap-3 mb-2 font-mono text-sm text-primary tracking-widest`}>
                    <span className="text-secondary font-bold">///</span> PHASE {step}
                </div>

                <h3 className="text-2xl font-bold mb-4 flex items-center gap-4 justify-center lg:justify-end flex-row-reverse">
                    {title}
                </h3>
                {/* Title for alignment logic */}
                <div className={`flex items-center gap-4 justify-center lg:justify-${align === 'left' ? 'end' : 'start'} mb-4 hidden`}>
                    <span className="text-2xl font-bold">{title}</span>
                </div>

                <p className="text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0">{description}</p>
            </div>

            {/* Center Node (Desktop) */}
            <div className="hidden lg:flex w-16 h-16 rounded-xl bg-card border border-primary/30 items-center justify-center z-10 shadow-[0_0_20px_-5px_var(--primary)] backdrop-blur-md">
                {icon}
            </div>

            <div className="flex-1 hidden lg:block" /> {/* Spacer */}
        </motion.div>
    )
}
