"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { Dictionary, SupportedLocale } from "@/lib/i18n";

export default function PricingClient({ dict, lang }: { dict: Dictionary; lang: SupportedLocale }) {
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
                        <span className="tracking-widest uppercase text-xs font-bold">
                            {lang === 'it' ? 'PIANI A CREDITI' : 'CREDITS-BASED PLANS'}
                        </span>
                    </motion.div>
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase">
                        {lang === 'it' ? 'Piani' : 'Plans'}{" "}
                        <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                            {lang === 'it' ? 'a Crediti.' : 'by Credits.'}
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it'
                            ? 'Scegli un limite mensile di crediti. I crediti vengono usati per analisi, chat e confronti.'
                            : 'Pick a monthly credit allowance. Credits are used for analysis, chat, and comparisons.'}
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="flex items-center justify-center mb-8">
                        <Button
                            variant="outline"
                            className="h-10 text-xs font-bold uppercase tracking-[0.2em] rounded-none border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10"
                            asChild
                        >
                            <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}>
                                {lang === 'it' ? 'Provalo gratis' : 'Try it for free'}
                            </Link>
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 max-w-7xl mx-auto items-start">

                        {/* Indie */}
                        <PricingCard
                            name="Indie"
                            price="$10"
                            period="/ month"
                            description={lang === 'it' ? 'Per team piccoli e dev indie.' : 'For small teams and indie developers.'}
                            features={[
                                lang === 'it' ? "5.000 crediti / mese" : "5,000 credits / month",
                                lang === 'it' ? "Dashboard + Chat agente + Confronti" : "Dashboards + AI agent chat + Compare",
                                lang === 'it' ? "Report PDF mensili" : "Monthly PDF reports",
                                lang === 'it' ? "Export CSV / JSONL" : "CSV / JSONL export",
                            ]}
                            cta={lang === 'it' ? 'Passa a Indie' : 'Upgrade to Indie'}
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}
                        />

                        {/* Pro Tier (Highlighted) */}
                        <PricingCard
                            name="Pro"
                            price="$20"
                            period="/ month"
                            description={lang === 'it' ? 'Per studi che analizzano regolarmente.' : 'For teams that analyze reviews regularly.'}
                            features={[
                                lang === 'it' ? "15.000 crediti / mese" : "15,000 credits / month",
                                lang === 'it' ? "Dashboard + Chat agente + Confronti" : "Dashboards + AI agent chat + Compare",
                                lang === 'it' ? "Report PDF mensili" : "Monthly PDF reports",
                                lang === 'it' ? "Export CSV / JSONL" : "CSV / JSONL export",
                            ]}
                            cta={lang === 'it' ? 'Passa a Pro' : 'Upgrade to Pro'}
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}
                            popular
                        />

                        {/* Enterprise */}
                        <PricingCard
                            name="Enterprise"
                            price={lang === 'it' ? 'Personalizzato' : 'Custom'}
                            description={lang === 'it' ? 'Per studi con esigenze avanzate.' : 'For studios with advanced needs.'}
                            features={[
                                lang === 'it' ? "Crediti e limiti su misura" : "Custom credits & limits",
                                lang === 'it' ? "Supporto prioritario" : "Priority support",
                                lang === 'it' ? "Report su misura" : "Custom reporting",
                                lang === 'it' ? "Export CSV / JSONL" : "CSV / JSONL export",
                            ]}
                            cta={lang === 'it' ? 'Contattaci' : 'Contact Us'}
                            href={`${process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"}/support`}
                        />
                    </div>
                </div>
            </section>

            <section className="pb-32 w-full flex justify-center opacity-50">
                <div className="container px-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                        {lang === 'it'
                            ? "* I crediti vengono usati per analisi, chat e confronti. I report PDF usano dati già analizzati."
                            : "* Credits are used for analysis, chat, and comparisons. PDF reports use existing analysis data."}
                    </p>
                </div>
            </section>
        </div>
    );
}

type PricingCardProps = {
    name: string;
    price: string;
    period?: string;
    description: string;
    features: string[];
    cta: string;
    href: string;
    popular?: boolean;
};

function PricingCard({ name, price, period, description, features, cta, href, popular }: PricingCardProps) {
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
