"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Cloud, Database, FileText, Server, BrainCircuit, Cpu } from "lucide-react";

export default function HowItWorksPage() {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            <section className="py-20 md:py-32 bg-transparent w-full flex justify-center relative overflow-hidden">
                <div className="container px-4 md:px-6 text-center max-w-5xl mx-auto relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="text-5xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight"
                    >
                        Intelligence <br /><span className="text-primary tracking-[-0.05em]">Pipeline.</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 font-light leading-relaxed"
                    >
                        SentiNext's cloud agent autonomously fetches, processes, and classifies thousands of reviews in minutes.
                    </motion.p>
                </div>
            </section>

            <section className="py-32 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 max-w-6xl mx-auto relative z-10">
                    <div className="flex flex-col gap-24 relative">
                        {/* Connecting Line (Desktop) */}
                        <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent -translate-x-1/2" />

                        <PipelineStep
                            step="01"
                            title="Cloud Ingestion"
                            icon={<Cloud className="h-7 w-7 text-primary" />}
                            description="Our cloud fleet queries the Steam Community API for your App ID. We handle rate limiting, pagination, and data cleaning at scale."
                            align="left"
                            delay={0.1}
                        />

                        <PipelineStep
                            step="02"
                            title="Noise Filtering"
                            icon={<FileText className="h-7 w-7 text-muted-foreground" />}
                            description="We automatically discard reviews with low playtime or verified 'off-topic' content, isolating high-signal feedback."
                            align="right"
                            delay={0.2}
                        />

                        <PipelineStep
                            step="03"
                            title="Agent Analysis"
                            icon={<Cpu className="h-7 w-7 text-secondary" />}
                            description="The heart of the system. Our fine-tuned AI agent reads every review, extracting specific issues and feature requests."
                            align="left"
                            delay={0.3}
                        />

                        <PipelineStep
                            step="04"
                            title="PostgreSQL Storage"
                            icon={<Database className="h-7 w-7 text-white" />}
                            description="Structured insights are persisted in our high-performance cloud database, ready for instant querying."
                            align="right"
                            delay={0.4}
                        />

                        <PipelineStep
                            step="05"
                            title="Insight Dashboard"
                            icon={<BrainCircuit className="h-7 w-7 text-primary" />}
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
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay }}
            className={`relative flex flex-col md:flex-row gap-16 items-center ${align === 'right' ? 'lg:flex-row-reverse' : ''}`}
        >
            <div className={`flex-1 text-center lg:text-${align === 'left' ? 'right' : 'left'} w-full`}>
                <div className={`inline-flex items-center gap-3 mb-4 font-mono text-sm text-primary tracking-[0.4em] uppercase opacity-70`}>
                    <span className="text-secondary font-bold">///</span> PHASE {step}
                </div>

                <h3 className="text-3xl font-bold mb-6 tracking-tight">
                    {title}
                </h3>

                <p className="text-muted-foreground leading-relaxed text-lg max-w-md mx-auto lg:mx-0 font-light italic opacity-80">{description}</p>
            </div>

            {/* Center Node (Desktop) */}
            <div className="hidden lg:flex w-24 h-24 rounded-3xl items-center justify-center z-10 glass-morphism shadow-[0_0_40px_-10px_rgba(79,70,229,0.3)] border border-white/20 hover:scale-110 transition-transform cursor-pointer animate-float" style={{ animationDelay: `${delay}s` }}>
                {icon}
            </div>

            <div className="flex-1 hidden lg:block" /> {/* Spacer */}
        </motion.div>
    )
}
