"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles, Container, Wrench, MessageSquare } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { Dictionary } from "@/lib/i18n";

export default function PricingClient({ dict }: { dict: Dictionary }) {
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
                            DEPLOYMENT OPTIONS
                        </span>
                    </motion.div>
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase">
                        Get{" "}
                        <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                            Started.
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        Self-host SentiNext on your own infrastructure. Free and open-source.
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl mx-auto items-start">

                        {/* Docker Compose */}
                        <DeployCard
                            icon={<Container className="h-6 w-6 text-[#00F0FF]" />}
                            name="Docker Compose"
                            badge="RECOMMENDED"
                            description="One-command self-hosting with PostgreSQL, backend, and frontend."
                            features={[
                                "Single docker compose up --build",
                                "PostgreSQL included",
                                "Frontend + Backend + DB",
                                "Production-ready defaults",
                            ]}
                            cta={dict.common.viewOnGithub}
                            href="https://github.com/NicoCampa/SentiNext"
                            external
                            popular
                        />

                        {/* Manual Setup */}
                        <DeployCard
                            icon={<Wrench className="h-6 w-6 text-[#00F0FF]" />}
                            name="Manual Setup"
                            description="Run frontend and backend separately for full control."
                            features={[
                                "Next.js frontend",
                                "FastAPI backend",
                                "Bring your own PostgreSQL",
                                "Conda or pip environment",
                            ]}
                            cta="View Docs"
                            href="/en/docs/getting-started"
                            external={false}
                        />

                        {/* Request a Demo */}
                        <DeployCard
                            icon={<MessageSquare className="h-6 w-6 text-[#00F0FF]" />}
                            name="Guided Setup"
                            description="Need help getting started? Request a guided demo."
                            features={[
                                "Live walkthrough",
                                "Deployment assistance",
                                "Architecture guidance",
                                "Custom integration help",
                            ]}
                            cta={dict.common.requestDemo}
                            href="/en/demo"
                            external={false}
                        />
                    </div>
                </div>
            </section>

            <section className="pb-32 w-full flex justify-center opacity-50">
                <div className="container px-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                        * SentiNext is free and open-source. You only pay for the LLM API keys you choose to use.
                    </p>
                </div>
            </section>
        </div>
    );
}

type DeployCardProps = {
    icon: React.ReactNode;
    name: string;
    badge?: string;
    description: string;
    features: string[];
    cta: string;
    href: string;
    external: boolean;
    popular?: boolean;
};

function DeployCard({ icon, name, badge, description, features, cta, href, external, popular }: DeployCardProps) {
    return (
        <motion.div
            whileHover={{ y: -5, scale: 1.01 }}
            className={`relative flex flex-col p-10 rounded-sm border ${popular ? 'border-[#00F0FF]/50 bg-[#00F0FF]/[0.05] shadow-[0_0_30px_rgba(0,240,255,0.1)] z-10 scale-105' : 'border-[#00F0FF]/10 bg-[#00F0FF]/[0.02]'} backdrop-blur-md transition-all h-full group overflow-hidden`}
        >
            <CornerMarkers className={popular ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"} />

            {badge && (
                <div className="absolute top-0 right-0 bg-[#00F0FF] text-black text-[8px] font-bold px-3 py-1 uppercase tracking-widest shadow-lg">
                    {badge}
                </div>
            )}

            <div className="mb-10">
                <div className="inline-flex items-center justify-center p-4 rounded-sm bg-[#00F0FF]/5 border border-[#00F0FF]/20 shadow-xl backdrop-blur-sm mb-6">
                    {icon}
                </div>
                <h3 className="text-sm font-bold mb-6 font-mono uppercase tracking-[0.4em] text-[#00F0FF]">{name}</h3>
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
                {external ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">{cta}</a>
                ) : (
                    <Link href={href}>{cta}</Link>
                )}
            </Button>
        </motion.div>
    );
}
