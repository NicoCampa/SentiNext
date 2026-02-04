"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, Zap, BarChart2 } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { Dictionary, SupportedLocale } from "@/lib/i18n";

export default function HowItWorksClient({ dict, lang }: { dict: Dictionary; lang: SupportedLocale }) {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            {/* Hero */}
            <section className="relative w-full py-20 md:py-32 lg:py-48 flex flex-col items-center justify-center border-b border-[#00F0FF]/10 overflow-hidden">
                <div className="scanline" />
                <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-6xl mx-auto">
                    <motion.h1
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase"
                    >
                        {lang === 'it' ? 'Il' : 'The'} <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">{lang === 'it' ? 'Processo.' : 'Process.'}</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it' ? 'Dalle recensioni Steam a insight azionabili.' : 'From Steam reviews to actionable insights.'}
                    </p>
                </div>
            </section>

            {/* Pipeline Steps */}
            <section className="py-32 w-full flex justify-center relative overflow-hidden">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="max-w-4xl mx-auto space-y-24">
                        <PipelineStep
                            number="01"
                            icon={<Search className="h-10 w-10 text-[#00F0FF]" />}
                            title={lang === 'it' ? "INGESTIONE" : "INGESTION"}
                            description={lang === 'it'
                                ? "Recupera recensioni Steam per qualsiasi App ID (endpoint pubblico). Gestione paginazione e persistenza su database."
                                : "Fetch Steam reviews for any App ID (public endpoint). Handles pagination and persists data to the database."}
                            delay={0.1}
                        />
                        <PipelineStep
                            number="02"
                            icon={<Zap className="h-10 w-10 text-[#00F0FF]" />}
                            title={lang === 'it' ? "CLASSIFICAZIONE" : "CLASSIFICATION"}
                            description={lang === 'it'
                                ? "Google Gemini etichetta ogni recensione con una tassonomia coerente e salva citazioni di evidenza per ogni tag."
                                : "Google Gemini labels each review with a consistent taxonomy and stores evidence quotes for every tag."}
                            delay={0.3}
                        />
                        <PipelineStep
                            number="03"
                            icon={<BarChart2 className="h-10 w-10 text-[#00F0FF]" />}
                            title={lang === 'it' ? "INSIGHT" : "INSIGHTS"}
                            description={lang === 'it'
                                ? "Dashboard, esplorazione e confronto: identifica i principali problemi e richieste, poi fai domande all’agente AI e genera report."
                                : "Dashboards, exploration, and comparisons: surface top issues and requests, ask the AI agent questions, and generate reports."}
                            delay={0.5}
                        />
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-32 text-center relative border-t border-[#00F0FF]/10 w-full">
                <div className="container px-4 mx-auto">
                    <h2 className="text-4xl font-bold mb-10 tracking-tighter uppercase leading-none">Pipeline <span className="text-[#00F0FF]">{lang === 'it' ? 'Pronta' : 'Ready'}</span></h2>
                    <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)]" asChild>
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"} target="_blank">
                            {dict.common.initialize}
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}

function PipelineStep({ number, icon, title, description, delay }: { number: string, icon: React.ReactNode, title: string, description: string, delay: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay }}
            className="flex flex-col md:flex-row gap-12 items-center md:items-start group relative p-12 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm backdrop-blur-sm"
        >
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-[60px] md:text-[80px] font-bold text-[#00F0FF]/10 leading-none font-mono">
                {number}
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
                <div className="inline-flex p-4 bg-[#00F0FF]/10 border border-[#00F0FF]/20 rounded-sm mb-4">
                    {icon}
                </div>
                <h3 className="text-3xl font-bold tracking-widest uppercase group-hover:text-[#00F0FF] transition-colors">{title}</h3>
                <p className="text-xl text-muted-foreground font-light leading-relaxed">
                    {description}
                </p>
            </div>
        </motion.div>
    );
}
