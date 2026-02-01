"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Check, X } from "lucide-react";

export default function PricingPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <section className="py-20 bg-background border-b border-border/40">
                <div className="container px-4 md:px-6 text-center">
                    <div className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-sm font-medium text-secondary border border-secondary/20 mb-6">
                        Pricing in Beta
                    </div>
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                        Simple, transparent pricing.
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
                        Start for free on our hosted platform. Upgrade for team collaboration and advanced retention.
                    </p>

                    <div className="p-4 bg-card/50 border border-primary/20 rounded-lg max-w-xl mx-auto mb-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        Billing is currently disabled during the public beta. All features are free to try.
                    </div>
                </div>
            </section>

            <section className="py-20">
                <div className="container px-4 md:px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {/* Free Tier */}
                        <PricingCard
                            name="Free"
                            price="$0"
                            description="Perfect for indie developers analyzing their own game."
                            features={[
                                "Ingest up to 10k reviews/mo",
                                "1 Active App Dashboard",
                                "Basic Issue Classification",
                                "7-day Data Retention",
                                "Community Support"
                            ]}
                            cta="Start for Free"
                            href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"}
                            variant="outline"
                        />

                        {/* Pro Tier (Popular) */}
                        <PricingCard
                            name="Pro"
                            price="$29"
                            period="/month"
                            description="For studios that need deeper insights and longer history."
                            features={[
                                "Ingest up to 100k reviews/mo",
                                "5 Active App Dashboards",
                                "Advanced Taxonomy & Evidence",
                                "90-day Data Retention",
                                "Priority Email Support",
                                "Export to CSV/JSON"
                            ]}
                            cta="Join Waitlist"
                            href="/contact"
                            variant="primary"
                            popular
                        />

                        {/* Team Tier */}
                        <PricingCard
                            name="Team"
                            price="Custom"
                            description="For publishers and large teams managing portfolio intelligence."
                            features={[
                                "Unlimited Ingestion",
                                "Unlimited Dashboards",
                                "Custom Taxonomy Rules",
                                "1-year Data Retention",
                                "Dedicated Account Manager",
                                "SSO & Admin Controls"
                            ]}
                            cta="Contact Sales"
                            href="/contact"
                            variant="outline"
                        />
                    </div>
                </div>
            </section>

            {/* Comparison Table */}
            <section className="py-20 bg-card/30 border-t border-border/40">
                <div className="container px-4 md:px-6 max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold text-center mb-12">Feature Comparison</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border/40">
                                    <th className="py-4 px-4 font-medium text-muted-foreground w-1/3">Feature</th>
                                    <th className="py-4 px-4 font-bold text-center w-1/5">Free</th>
                                    <th className="py-4 px-4 font-bold text-center text-primary w-1/5">Pro</th>
                                    <th className="py-4 px-4 font-bold text-center w-1/5">Team</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                                <TableRow feature="Review Ingestion Limit" free="10k / mo" pro="100k / mo" team="Unlimited" />
                                <TableRow feature="Active Apps" free="1" pro="5" team="Unlimited" />
                                <TableRow feature="Data Retention" free="7 days" pro="90 days" team="1 year+" />
                                <TableRow feature="LLM Classification" free={<Check className="h-4 w-4 mx-auto text-primary" />} pro={<Check className="h-4 w-4 mx-auto text-primary" />} team={<Check className="h-4 w-4 mx-auto text-primary" />} />
                                <TableRow feature="Evidence Extraction" free={<Check className="h-4 w-4 mx-auto text-primary" />} pro={<Check className="h-4 w-4 mx-auto text-primary" />} team={<Check className="h-4 w-4 mx-auto text-primary" />} />
                                <TableRow feature="CSV / JSON Export" free={<X className="h-4 w-4 mx-auto text-muted-foreground/50" />} pro={<Check className="h-4 w-4 mx-auto text-primary" />} team={<Check className="h-4 w-4 mx-auto text-primary" />} />
                                <TableRow feature="Team Members" free="1" pro="5" team="Unlimited" />
                                <TableRow feature="SSO / SAML" free={<X className="h-4 w-4 mx-auto text-muted-foreground/50" />} pro={<X className="h-4 w-4 mx-auto text-muted-foreground/50" />} team={<Check className="h-4 w-4 mx-auto text-primary" />} />
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-16 text-center">
                        <h3 className="text-xl font-bold mb-4">Frequently Asked Questions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left mt-8">
                            <div>
                                <h4 className="font-semibold mb-2">Is the desktop app free?</h4>
                                <p className="text-sm text-muted-foreground">Yes! The SentiNext desktop app is open source and can be run locally for free without limits if you bring your own API keys.</p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">What happens after the beta?</h4>
                                <p className="text-sm text-muted-foreground">We will notify all users 30 days before enabling billing. Early beta users may be eligible for a discount.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function PricingCard({ name, price, period, description, features, cta, href, variant, popular }: any) {
    return (
        <div className={`relative flex flex-col p-8 rounded-xl border ${popular ? 'border-primary shadow-[0_0_30px_-10px_var(--primary)] bg-card/60' : 'border-border/50 bg-card/30'} transition-all hover:bg-card/50`}>
            {popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    Most Popular
                </div>
            )}
            <div className="mb-6">
                <h3 className="text-xl font-bold mb-2">{name}</h3>
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{price}</span>
                    {period && <span className="text-muted-foreground">{period}</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-4 h-10">{description}</p>
            </div>
            <ul className="flex-1 space-y-4 mb-8">
                {features.map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5" />
                        <span className="text-foreground/80">{feature}</span>
                    </li>
                ))}
            </ul>
            <Button
                className={`w-full ${variant === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
                variant={variant === 'outline' ? 'outline' : 'default'}
                asChild
            >
                <Link href={href}>{cta}</Link>
            </Button>
        </div>
    )
}

function TableRow({ feature, free, pro, team }: any) {
    return (
        <tr className="hover:bg-card/30 transition-colors">
            <td className="py-4 px-4 text-sm font-medium">{feature}</td>
            <td className="py-4 px-4 text-sm text-muted-foreground text-center">{free}</td>
            <td className="py-4 px-4 text-sm text-muted-foreground text-center">{pro}</td>
            <td className="py-4 px-4 text-sm text-muted-foreground text-center">{team}</td>
        </tr>
    )
}
