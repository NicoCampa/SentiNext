"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

export default function PricingPage() {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            <section className="py-20 bg-background border-b border-border/40 w-full flex justify-center">
                <div className="container px-4 md:px-6 text-center max-w-4xl mx-auto">
                    <div className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-sm font-medium text-secondary border border-secondary/20 mb-6 font-mono tracking-wide">
                        BETA ACCESS ACTIVE
                    </div>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8">
                        Free during Beta.
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
                        We are actively refining our AI agent. All features are currently free to use on the hosted platform.
                    </p>
                </div>
            </section>

            <section className="py-20 w-full flex justify-center">
                <div className="container px-4 md:px-6 mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">

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
                            cta="Start Analyzing"
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"}
                            variant="ghost"
                        />

                        {/* Pro Tier (Highlighted) */}
                        <div className="relative transform md:-translate-y-4">
                            <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-secondary/20 blur-xl opacity-50 pointer-events-none" />
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
                                variant="primary"
                                popular
                            />
                        </div>

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
                            variant="ghost"
                        />
                    </div>
                </div>
            </section>

            <section className="pb-24 w-full flex justify-center">
                <div className="container px-4 text-center">
                    <p className="text-sm text-muted-foreground">
                        * Pricing models will be introduced in late 2026. Beta users will receive a legacy discount.
                    </p>
                </div>
            </section>
        </div>
    );
}

function PricingCard({ name, price, period, description, features, cta, href, variant, popular }: any) {
    return (
        <div className={`relative flex flex-col p-8 rounded-2xl border ${popular ? 'border-primary bg-card/80 shadow-2xl skew-y-0 z-10' : 'border-border/50 bg-card/30'} backdrop-blur-sm transition-all hover:bg-card/50 h-full`}>
            {popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-secondary text-black text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-2">
                    <Sparkles className="h-3 w-3" /> Recommended
                </div>
            )}
            <div className="mb-8">
                <h3 className="text-xl font-bold mb-4 font-mono uppercase tracking-wider text-muted-foreground">{name}</h3>
                <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-5xl font-bold tracking-tight">{price}</span>
                    {period && <span className="text-sm text-muted-foreground font-mono">{period}</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed min-h-[40px]">{description}</p>
            </div>
            <ul className="flex-1 space-y-4 mb-8">
                {features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 ${popular ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="text-foreground/90">{feature}</span>
                    </li>
                ))}
            </ul>
            <Button
                className={`w-full h-12 text-base font-bold ${variant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20' : ''}`}
                variant={variant === 'primary' ? 'default' : 'outline'}
                asChild
            >
                <Link href={href}>{cta}</Link>
            </Button>
        </div>
    )
}
