"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Search, Sliders, BarChart2, Layers } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function ProductClient({ dict, lang }: { dict: any, lang: string }) {
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
                        {lang === 'it'
                            ? 'Ingestione dati autonoma e classificazione neurale.'
                            : 'Autonomous data ingestion and neural classification.'}
                    </motion.p>
                </div>
            </section>

            {/* Feature 1: Ingest */}
            <FeatureSection
                id="ingest"
                icon={<Search className="h-7 w-7 text-[#00F0FF]" />}
                title={lang === 'it' ? "1. Ricerca e Ingestione" : "1. Search & Ingest"}
                description={lang === 'it'
                    ? "Collegati a qualsiasi Steam App ID. SentiNext recupera migliaia di recensioni in pochi secondi, rispettando i limiti delle API di Steam."
                    : "Connect to any Steam App ID. SentiNext fetches thousands of reviews in seconds, respecting Steam's API rate limits and handling pagination automatically."}
                details={lang === 'it' ? [
                    "Filtra per intervallo di date, lingua e tempo di gioco.",
                    "La cache intelligente consente la ri-analisi offline.",
                    "Persistenza dati su PostgreSQL per il monitoraggio a lungo termine."
                ] : [
                    "Filter by date range, language, and playtime.",
                    "Smart caching allows offline re-analysis.",
                    "Persist data to PostgreSQL for long-term tracking."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-8 flex flex-col gap-6 relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        <div className="h-12 bg-[#00F0FF]/5 border border-[#00F0FF]/20 rounded-sm flex items-center px-6 text-[#00F0FF] text-sm font-mono tracking-wider">
                            {" > "} SEARCH ID: 413150
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-[10px] text-[#00F0FF]/60 font-mono uppercase tracking-widest">
                                <span>Ingesting reports...</span>
                                <span>1,240 / 5,000</span>
                            </div>
                            <div className="h-2 w-full bg-[#00F0FF]/10 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    whileInView={{ width: "25%" }}
                                    className="h-full bg-[#00F0FF]"
                                />
                            </div>
                        </div>
                    </div>
                }
            />

            {/* Feature 2: Classify */}
            <FeatureSection
                id="classify"
                icon={<Layers className="h-7 w-7 text-[#00F0FF]" />}
                title={lang === 'it' ? "2. Classificazione" : "2. Classification"}
                description={lang === 'it'
                    ? "La nostra pipeline LLM fine-tuned legge ogni recensione per identificare problemi specifici e richieste di caratteristiche."
                    : "Our fine-tuned LLM pipeline reads every review to identify specific issues and feature requests, not just generic sentiment."}
                details={lang === 'it' ? [
                    "Distingue tra bug, richieste ed elogi.",
                    "Normalizza termini vari (es. 'lag' -> 'Performance').",
                    "Usa l'estrazione di evidenze per citare il reclamo esatto dell'utente."
                ] : [
                    "Distinguishes between bugs, requests, and praise.",
                    "Normalizes varying terms (e.g., 'lag' -> 'Performance').",
                    "Uses evidence extraction to quote the exact user complaint."
                ]}
                align="right"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-8 flex flex-col gap-6 font-mono text-sm leading-relaxed relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        <div className="p-4 bg-[#00F0FF]/5 rounded-sm border border-[#00F0FF]/10 italic text-[#00F0FF]/70">
                            {lang === 'it' ? '"Il gioco continua a crashare all\'avvio dopo l\'aggiornamento."' : '"Game keeps crashing on launch since the update."'}
                        </div>
                        <div className="flex gap-3">
                            <div className="px-3 py-1.5 rounded-sm bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider">ISSUE: CRASH</div>
                            <div className="px-3 py-1.5 rounded-sm bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/30 text-[10px] font-bold uppercase tracking-wider">CONTEXT: LAUNCH</div>
                        </div>
                    </div>
                }
            />

            {/* Feature 3: Insights */}
            <FeatureSection
                id="insights"
                icon={<BarChart2 className="h-7 w-7 text-[#00F0FF]" />}
                title={lang === 'it' ? "3. Insight Quantificati" : "3. Quantified Insights"}
                description={lang === 'it'
                    ? "Visualizza un dashboard di alto livello di ciò che conta di più. SentiNext classifica i problemi per frequenza e impatto."
                    : "View a high-level dashboard of what matters most. SentiNext ranks issues by frequency and impact, helping you decide what to fix next."}
                details={lang === 'it' ? [
                    "Grafici interattivi e mappe di calore.",
                    "Approfondisci dalla categoria alle singole recensioni.",
                    "Esporta i dati per la tua analisi."
                ] : [
                    "Interactive charts and heatmaps.",
                    "Drill down from category to individual reviews.",
                    "Export data for your own analysis."
                ]}
                align="left"
                mockup={
                    <div className="w-full h-full bg-black/40 border border-[#00F0FF]/20 rounded-sm p-8 grid grid-cols-2 gap-6 relative overflow-hidden backdrop-blur-md">
                        <CornerMarkers />
                        <div className="col-span-1 h-36 bg-[#00F0FF]/5 rounded-sm border border-[#00F0FF]/10 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-[#00F0FF] tracking-tighter uppercase">142</div>
                                <div className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest mt-2">{lang === 'it' ? 'Performance' : 'Performance'}</div>
                            </div>
                        </div>
                        <div className="col-span-1 h-36 bg-[#00F0FF]/5 rounded-sm border border-[#00F0FF]/10 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-[#00F0FF] tracking-tighter uppercase">86</div>
                                <div className="text-[10px] text-[#00F0FF]/50 uppercase tracking-widest mt-2">{lang === 'it' ? 'Localizzazione' : 'Localization'}</div>
                            </div>
                        </div>
                        <div className="col-span-2 h-28 bg-[#00F0FF]/5 rounded-sm border border-[#00F0FF]/10 relative overflow-hidden">
                            <div className="absolute inset-x-0 bottom-0 h-[70%] flex items-end justify-around px-8">
                                {[40, 70, 50, 90, 60, 80].map((h, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ height: 0 }}
                                        whileInView={{ height: `${h}%` }}
                                        className="w-6 bg-[#00F0FF]/40 border-x border-[#00F0FF]/20"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                }
            />

            <section className="py-32 text-center">
                <h2 className="text-4xl font-bold mb-10 tracking-tighter uppercase">{lang === 'it' ? 'Sistema Pronto.' : 'System Ready.'}</h2>
                <Button size="lg" className="h-16 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)]" asChild>
                    <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                        {dict.common.initialize}
                    </Link>
                </Button>
            </section>
        </div>
    );
}

function FeatureSection({ id, icon, title, description, details, align, mockup }: any) {
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
