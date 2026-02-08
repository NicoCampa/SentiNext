"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles, Cpu, Bot } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { Dictionary } from "@/lib/i18n";

function TerminalLine({ text, delay, color = "text-[#00F0FF]/70", className, cursor }: { text: string, delay: number, color?: string, className?: string, cursor?: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.1 }}
            className={cn("flex items-center gap-2", color, className)}
        >
            <span>{text}</span>
            {cursor && (
                <motion.div
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="w-2 h-3 bg-[#00F0FF]"
                />
            )}
        </motion.div>
    );
}

export default function HomeClient({ dict }: { dict: Dictionary }) {
    const [bootPhase, setBootPhase] = useState<"booting" | "complete">("booting");

    useEffect(() => {
        const timer = setTimeout(() => {
            setBootPhase("complete");
        }, 1500); // reduced from 1800
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="flex flex-col items-center w-full min-h-screen">
            {/* Hero Section */}
            <section className="relative w-full py-24 md:py-32 lg:py-48 flex flex-col items-center justify-center border-b border-[#00F0FF]/10 overflow-hidden min-h-[80vh]">
                <div className="scanline" />

                <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-6xl mx-auto">
                    {/* Terminal Boot Sequence (Transient) */}
                    <AnimatePresence mode="wait">
                        {bootPhase === "booting" && (
                            <motion.div
                                key="terminal-boot"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05, height: 0, marginBottom: 0, padding: 0, filter: "blur(20px)" }}
                                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                className="mb-8 font-mono text-[10px] md:text-xs text-[#00F0FF]/70 text-left w-full max-w-md p-6 border border-[#00F0FF]/20 bg-[#00F0FF]/5 relative rounded-sm backdrop-blur-sm overflow-hidden"
                            >
                                <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#00F0FF]" />
                                <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#00F0FF]" />

                                <div className="space-y-1">
                                    <TerminalLine text="> INITIALIZING SYSTEM..." delay={0} />
                                    <TerminalLine text="> CONNECTING TO DATA STREAMS..." delay={0.2} />
                                    <TerminalLine text="> SENTIMENT ANALYSIS MODULE: ONLINE" delay={0.4} color="text-green-400" />
                                    <TerminalLine text="> REVIEW PROCESSOR: ACTIVE" delay={0.6} color="text-green-400" />
                                    <TerminalLine text="> SYSTEM READY" delay={0.8} color="text-green-400" className="font-bold flex items-center gap-2" cursor />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Main Hero Content (Revealed after boot) */}
                    <motion.div
                        initial={{ opacity: 0, y: 10, filter: "blur(10px)" }}
                        animate={bootPhase === "complete" ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 10, filter: "blur(10px)" }}
                        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: 0 }}
                        className={cn(
                            "flex flex-col items-center w-full mt-0 md:-mt-36",
                            bootPhase === "booting" ? "pointer-events-none scale-95" : "scale-100"
                        )}
                    >
                        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8 backdrop-blur-md glass">
                            <Sparkles className="h-3.5 w-3.5 mr-2 text-primary animate-pulse" />
                            <span className="tracking-widest uppercase text-xs font-bold">{dict.hero.badge}</span>
                        </div>

                        <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-[ -0.05em] mb-10 leading-[0.85] uppercase">
                            {dict.hero.title1} <br />
                            <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">{dict.hero.title2}</span>
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mb-12 leading-relaxed font-mono uppercase tracking-[0.1em] opacity-80">
                            {dict.hero.subtitle}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 w-full max-w-4xl">
                            {[
                                dict.hero.bullet1,
                                dict.hero.bullet2,
                                dict.hero.bullet3
                            ].map((text, i) => (
                                <div key={i} className="flex items-center gap-3 p-4 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm">
                                    <div className="h-1.5 w-1.5 bg-[#00F0FF] shadow-[0_0_5px_rgba(0,240,255,1)]" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/70">{text}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-8 w-full sm:w-auto items-center justify-center">
                            <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] text-xs rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)] relative overflow-hidden group" asChild>
                                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"} target="_blank">
                                    <span className="relative z-10">{dict.common.initialize}</span>
                                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                                </Link>
                            </Button>
                            <Button size="lg" variant="outline" className="h-14 px-12 border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-[0.2em] text-xs rounded-none relative group" asChild>
                                <Link href="/en/how-it-works">
                                    Pipeline Overview
                                </Link>
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Social Proof (Implicitly Client due to CornerMarkers) */}
            <section className="py-20 w-full border-b border-[#00F0FF]/10 bg-black/40">
                <div className="container px-4 md:px-6 mx-auto">
	                    <div className="flex flex-col items-center text-center gap-12">
	                        <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#00F0FF]/50 border-b border-[#00F0FF]/10 pb-4">
	                            Built for game teams
	                        </div>
	                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
	                            <div className="relative p-10 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm">
	                                <CornerMarkers className="opacity-20" />
	                                <p className="text-lg font-light mb-6 opacity-80 leading-relaxed">
	                                    I wait for your reviews :)
	                                </p>
	                                <div className="text-xs font-bold uppercase tracking-widest text-[#00F0FF]">
	                                    Evidence quotes
	                                </div>
	                            </div>
	                            <div className="relative p-10 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm">
	                                <CornerMarkers className="opacity-20" />
	                                <p className="text-lg font-light mb-6 opacity-80 leading-relaxed">
	                                    I wait for your reviews :)
	                                </p>
	                                <div className="text-xs font-bold uppercase tracking-widest text-[#00F0FF]">
	                                    Dashboards, exports, reports
	                                </div>
	                            </div>
	                        </div>
	                    </div>
	                </div>
	            </section>

            {/* AI Agent Chat Section */}
            <section className="py-24 md:py-32 w-full flex justify-center border-b border-[#00F0FF]/10 bg-[#00F0FF]/[0.01]">
                <div className="container px-4 md:px-6 mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="space-y-8"
	                        >
	                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-[#00F0FF]/30 bg-[#00F0FF]/5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
	                                <Cpu className="h-3 w-3" />
	                                <span>AI Agent: Online</span>
	                            </div>
                            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter uppercase leading-[0.9]">
                                Direct <br />
                                <span className="text-[#00F0FF]">Interaction</span>
                            </h2>
	                            <p className="text-lg text-muted-foreground leading-relaxed font-light max-w-xl">
	                                Ask questions in natural language: the AI agent pulls stats, searches quotes, and compares games—grounded in your analyzed data (with charts when useful).
	                            </p>
	                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="relative p-1 rounded-sm bg-gradient-to-br from-[#00F0FF]/20 to-transparent border border-[#00F0FF]/20 shadow-2xl"
                        >
                            <div className="bg-black/80 p-8 rounded-sm relative min-h-[400px] flex flex-col font-mono text-xs overflow-hidden">
                                <CornerMarkers />
                                <div className="mb-8 flex items-center justify-between border-b border-[#00F0FF]/10 pb-4">
                                    <span className="text-[#00F0FF] uppercase tracking-widest font-bold">Query Terminal</span>
                                    <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[8px]">STABLE</span>
                                </div>

	                                <div className="flex-1 space-y-6">
	                                    <ChatMessage role="user" content="Show me negative reviews about performance" />
	                                    <ChatMessage role="agent" content={"> TOOLS: get_subcategory_stats + search_reviews. TOPIC: technical/performance (negative). EVIDENCE: \"FPS drops\", \"stuttering\"."} />
	                                </div>

                                <div className="mt-8 p-4 border border-[#00F0FF]/20 bg-[#00F0FF]/5 rounded-sm flex items-center justify-between animate-pulse">
                                    <span className="text-[#00F0FF]/50 uppercase tracking-[0.2em]">Executing...</span>
                                    <Bot className="h-4 w-4 text-[#00F0FF]" />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
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
                            Ready to <span className="text-[#00F0FF]">Optimize?</span>
                        </h2>
                        <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto font-light font-mono tracking-widest uppercase opacity-70">
                            Stop guessing. Start analyzing with precision.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
                            <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)]" asChild>
                                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"} target="_blank">
                                    {dict.common.initialize}
                                </Link>
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}

function ChatMessage({ role, content }: { role: "user" | "agent", content: string }) {
    return (
        <div className={cn(
            "flex flex-col gap-2 p-4 rounded-sm border relative",
            role === "user" ? "bg-[#00F0FF]/5 border-[#00F0FF]/20 self-end max-w-[80%]" : "bg-white/5 border-white/10 self-start max-w-[90%]"
        )}>
            <div className="flex items-center gap-2 mb-1">
                {role === "user" ? <span className="text-[8px] font-bold uppercase tracking-widest text-[#00F0FF]">Operator</span> : <span className="text-[8px] font-bold uppercase tracking-widest text-green-400">Agent-01</span>}
            </div>
            <p className={cn("text-xs leading-relaxed", role === "agent" ? "terminal-text" : "text-white/80")}>
                {content}
            </p>
        </div>
    )
}
