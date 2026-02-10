"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, BarChart2, MessageSquare, Server, Mail } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { Dictionary } from "@/lib/i18n";

export default function DemoClient({ dict }: { dict: Dictionary }) {
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
                            {dict.demo.badge}
                        </span>
                    </motion.div>
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase">
                        {dict.demo.title1}{" "}
                        <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                            {dict.demo.title2}
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {dict.demo.subtitle}
                    </p>
                </div>
            </section>

            {/* Info Cards */}
            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-5xl mx-auto">
                        <DemoCard
                            icon={<Play className="h-6 w-6 text-[#00F0FF]" />}
                            title={dict.demo.card1Title}
                            description={dict.demo.card1Desc}
                            delay={0}
                        />
                        <DemoCard
                            icon={<BarChart2 className="h-6 w-6 text-[#00F0FF]" />}
                            title={dict.demo.card2Title}
                            description={dict.demo.card2Desc}
                            delay={0.1}
                        />
                        <DemoCard
                            icon={<MessageSquare className="h-6 w-6 text-[#00F0FF]" />}
                            title={dict.demo.card3Title}
                            description={dict.demo.card3Desc}
                            delay={0.2}
                        />
                        <DemoCard
                            icon={<Server className="h-6 w-6 text-[#00F0FF]" />}
                            title={dict.demo.card4Title}
                            description={dict.demo.card4Desc}
                            delay={0.3}
                        />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-32 w-full flex justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[#00F0FF]/5 border-y border-[#00F0FF]/10" />
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="p-12 md:p-24 rounded-sm border border-[#00F0FF]/30 bg-black/60 backdrop-blur-xl relative text-center max-w-5xl mx-auto"
                    >
                        <CornerMarkers />
                        <h2 className="text-4xl md:text-6xl font-bold mb-8 uppercase tracking-tighter">
                            {dict.demo.ctaTitle}
                        </h2>
                        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto font-light font-mono tracking-widest uppercase opacity-70">
                            {dict.demo.ctaSubtitle}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                            <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)] relative overflow-hidden group" asChild>
                                <a href="mailto:nicolocampagnoli20@icloud.com?subject=SentiNext%20Enterprise%20Implementation%20Call">
                                    <Mail className="h-4 w-4 mr-3" />
                                    <span className="relative z-10">{dict.demo.ctaButton}</span>
                                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                </a>
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}

function DemoCard({ icon, title, description, delay }: { icon: React.ReactNode; title: string; description: string; delay: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay }}
            whileHover={{ y: -5, scale: 1.01 }}
            className="relative flex flex-col p-10 rounded-sm border border-[#00F0FF]/10 bg-[#00F0FF]/[0.02] backdrop-blur-md transition-all h-full group overflow-hidden"
        >
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="inline-flex items-center justify-center p-4 rounded-sm bg-[#00F0FF]/5 border border-[#00F0FF]/20 shadow-xl backdrop-blur-sm mb-6 w-fit">
                {icon}
            </div>
            <h3 className="text-sm font-bold mb-4 font-mono uppercase tracking-[0.4em] text-[#00F0FF]">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed font-light">{description}</p>
        </motion.div>
    );
}
