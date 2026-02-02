"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function PricingPage() {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            {/* Hero */}
            <section className="py-20 md:py-32 bg-transparent relative overflow-hidden flex flex-col items-center justify-center border-b border-[#00F0FF]/10 w-full">
                <div className="scanline" />
                <div className="container px-4 md:px-6 text-center max-w-5xl mx-auto relative z-10">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-block rounded-sm bg-[#00F0FF]/10 px-4 py-1.5 text-xs font-bold text-[#00F0FF] border border-[#00F0FF]/20 mb-8 font-mono tracking-[0.3em] uppercase backdrop-blur-sm"
                    >
                        BETA ACCESS ACTIVE
                    </motion.div>
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase">
                        Free <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Beta.</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        Next-gen analysis for modern developers.
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
                            description="For indie developers trying out AI analysis."
                            features={[
                                "Cloud Ingestion",
                                "1 Active Project",
                                "Basic AI Taxonomy",
                                "7-day history",
                            ]}
                            cta="Initialize Session"
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"}
                        />

                        {/* Pro Tier (Highlighted) */}
                        <PricingCard
                            name="Pro Agent"
                            price="$0"
                            period="/ beta"
                            description="Full AI power for growing studios."
                            features={[
                                "Priority Cloud Queue",
                                "5 Active Projects",
                                "Advanced Evidence Extraction",
                                "90-day history",
                                "Export Data"
                            ]}
                            cta="Get Pro Access"
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"}
                            popular
                        />

                        {/* Team Tier */}
                        <PricingCard
                            name="Enterprise"
                            price="Custom"
                            description="For publishers needing custom taxonomy fine-tuning."
                            features={[
                                "Unlimited Ingestion",
                                "Custom LLM Fine-tuning",
                                "Dedicated Support",
                                "SLA & Compliance",
                            ]}
                            cta="Contact Sales"
                            href="/contact"
                        />
                    </div>
                </div>
            </section>

            <section className="pb-32 w-full flex justify-center opacity-50">
                <div className="container px-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                        * Pricing models will be introduced in late 2026. Beta users receive a legacy discount.
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
