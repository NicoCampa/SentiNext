"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function PricingClient({ dict, lang }: { dict: any, lang: string }) {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            {/* Hero */}
            <section className="relative w-full py-20 md:py-32 lg:py-48 flex flex-col items-center justify-center border-b border-[#00F0FF]/10 overflow-hidden">
                <div className="scanline" />
                <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8 backdrop-blur-md glass"
                    >
                        <Sparkles className="h-3.5 w-3.5 mr-2 text-primary animate-pulse" />
                        <span className="tracking-widest uppercase text-xs font-bold">BETA ACCESS ACTIVE</span>
                    </motion.div>
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase">
                        Free <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Beta.</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it' ? 'Analisi di nuova generazione per sviluppatori moderni.' : 'Next-gen analysis for modern developers.'}
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-7xl mx-auto items-start">
                        {/* Starter */}
                        <PricingCard
                            name="Starter"
                            price="$0"
                            period="/ beta"
                            description={lang === 'it' ? 'Per sviluppatori indie che provano l\'analisi AI.' : 'For indie developers trying out AI analysis.'}
                            features={[
                                lang === 'it' ? "Ingestione 2.000 recensioni / job" : "2,000 review ingestion / job",
                                lang === 'it' ? "1 Cluster di Progetto Attivo" : "1 Active Project Cluster",
                                lang === 'it' ? "Tassonomia AI Standard" : "Standard AI Taxonomy",
                                lang === 'it' ? "Ritenzione telemetria 7 giorni" : "7-day telemetry retention",
                            ]}
                            cta={dict.common.initialize}
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}
                        />

                        {/* Pro Tier (Highlighted) */}
                        <PricingCard
                            name="Pro Agent"
                            price="$0"
                            period="/ beta"
                            description={lang === 'it' ? 'Piena potenza AI per studi in crescita.' : 'Full AI power for growing studios.'}
                            features={[
                                lang === 'it' ? "5.000+ ingestione recensioni / job" : "5,000+ review ingestion / job",
                                lang === 'it' ? "Coda Neurale Prioritaria" : "Priority Neural Queue",
                                lang === 'it' ? "5 Cluster di Progetto Attivi" : "5 Active Project Clusters",
                                lang === 'it' ? "Estrazione Evidenze Profonda" : "Deep Evidence Extraction",
                                lang === 'it' ? "Ritenzione telemetria 90 giorni" : "90-day telemetry retention",
                                lang === 'it' ? "Esportazione Telemetria CSV/JSON" : "CSV/JSON Telemetry Export"
                            ]}
                            cta={lang === 'it' ? 'Ottieni Accesso Pro' : 'Get Pro Access'}
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}
                            popular
                        />

                        {/* Team Tier */}
                        <PricingCard
                            name="Enterprise"
                            price="Custom"
                            description={lang === 'it' ? 'Per publisher che necessitano di fine-tuning.' : 'For publishers needing custom taxonomy fine-tuning.'}
                            features={[
                                lang === 'it' ? "Ingestione Illimitata" : "Unlimited Ingestion",
                                lang === 'it' ? "Fine-tuning LLM Personalizzato" : "Custom LLM Fine-tuning",
                                lang === 'it' ? "Supporto Dedicato" : "Dedicated Support",
                                lang === 'it' ? "SLA e Compliance" : "SLA & Compliance",
                            ]}
                            cta={lang === 'it' ? 'Contatta Sales' : 'Contact Sales'}
                            href={`/${lang}/contact`}
                        />
                    </div>
                </div>
            </section>

            <section className="pb-32 w-full flex justify-center opacity-50">
                <div className="container px-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                        {lang === 'it'
                            ? "* I modelli di prezzo saranno introdotti a fine 2026. Gli utenti beta ricevono uno sconto legacy."
                            : "* Pricing models will be introduced in late 2026. Beta users receive a legacy discount."}
                    </p>
                </div>
            </section>
        </div>
    );
}

function PricingCard({ name, price, period, description, features, cta, href, popular }: any) {
    return (
        <motion.div
            whileHover={{ y: -5, scale: 1.01 }}
            className={`relative flex flex-col p-10 rounded-sm border ${popular ? 'border-[#00F0FF]/50 bg-[#00F0FF]/[0.05] shadow-[0_0_30px_rgba(0,240,255,0.1)] z-10 scale-105' : 'border-[#00F0FF]/10 bg-[#00F0FF]/[0.02]'} backdrop-blur-md transition-all h-full group overflow-hidden`}
        >
            <CornerMarkers className={popular ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"} />

            {popular && (
                <div className="absolute top-0 right-0 bg-[#00F0FF] text-black text-[8px] font-bold px-3 py-1 uppercase tracking-widest shadow-lg">
                    RECOMMENDED
                </div>
            )}

            <div className="mb-10">
                <h3 className="text-sm font-bold mb-6 font-mono uppercase tracking-[0.4em] text-[#00F0FF]">{name}</h3>
                <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-6xl font-bold tracking-tighter uppercase">{price}</span>
                    {period && <span className="text-xs text-muted-foreground font-mono tracking-widest uppercase opacity-50">{period}</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed font-light font-mono uppercase opacity-70 min-h-[40px]">{description}</p>
            </div>

            <ul className="flex-1 space-y-4 mb-10">
                {features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-4 text-xs font-light font-mono uppercase tracking-wide opacity-80">
                        <span className="text-[#00F0FF] font-bold">{" > "}</span>
                        <span className="text-foreground/90">{feature}</span>
                    </li>
                ))}
            </ul>

            <Button
                className={`w-full h-14 text-xs font-bold uppercase tracking-[0.2em] rounded-none transition-all ${popular ? 'bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 shadow-[0_0_20px_rgba(0,240,255,0.3)]' : 'border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10'}`}
                variant={popular ? 'default' : 'outline'}
                asChild
            >
                <Link href={href}>{cta}</Link>
            </Button>
        </motion.div>
    );
}
