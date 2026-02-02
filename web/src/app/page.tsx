"use client";

import { cn } from "@/lib/utils";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Zap, BrainCircuit, ShieldCheck, Cpu, MessageSquare, Terminal } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

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

export default function Home() {
  return (
    <div className="flex flex-col items-center w-full min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full py-24 md:py-32 lg:py-48 flex flex-col items-center justify-center border-b border-[#00F0FF]/10 overflow-hidden">
        <div className="scanline" />

        <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-6xl mx-auto">
          {/* Terminal Boot Sequence (Dashboard Inspired) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-12 font-mono text-[10px] md:text-xs text-[#00F0FF]/70 text-left w-full max-w-md p-6 border border-[#00F0FF]/20 bg-[#00F0FF]/5 relative rounded-sm backdrop-blur-sm"
          >
            <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#00F0FF]" />
            <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#00F0FF]" />

            <div className="space-y-1">
              <TerminalLine text="> INITIALIZING SYSTEM..." delay={0} />
              <TerminalLine text="> CONNECTING TO DATA STREAMS..." delay={0.5} />
              <TerminalLine text="> SENTIMENT ANALYSIS MODULE: ONLINE" delay={1} color="text-green-400" />
              <TerminalLine text="> REVIEW PROCESSOR: ACTIVE" delay={1.5} color="text-green-400" />
              <TerminalLine text="> SYSTEM READY" delay={2} color="text-green-400" className="font-bold flex items-center gap-2" cursor />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8 backdrop-blur-md glass"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2 text-primary animate-pulse" />
            <span className="tracking-widest uppercase text-xs font-bold">Public Beta Live</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-[ -0.05em] mb-10 leading-[0.85] uppercase"
          >
            Review <br />
            <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Intelligence</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-12 leading-relaxed font-mono uppercase tracking-[0.2em] opacity-60"
          >
            Next-generation autonomous feedback classification system.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 2.2 }}
            className="flex flex-col sm:flex-row gap-8 w-full sm:w-auto items-center justify-center"
          >
            <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] text-xs rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)] relative overflow-hidden group" asChild>
              <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                <span className="relative z-10">Initialize Analysis</span>
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-12 border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-[0.2em] text-xs rounded-none relative group" asChild>
              <Link href="/how-it-works">
                Pipeline Overview
              </Link>
            </Button>
          </motion.div>
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
                <span>Neural Engine: Online</span>
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter uppercase leading-[0.9]">
                Direct <br />
                <span className="text-[#00F0FF]">Interaction</span>
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed font-light max-w-xl">
                Don't just look at charts. Prompt the SentiNext agent to drill into specific player segments, cross-reference version updates, or identify emerging meta-shifts in real-time.
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
                  <ChatMessage role="user" content="Analyze negative reviews for v1.4.2" />
                  <ChatMessage role="agent" content="> SCANNING 1,242 REVIEWS... Category 'Performance' up 15%. Evidence: 'Stuttering in main menu' (42 instances)." />
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

      {/* Value Props */}
      <section className="w-full py-32 bg-background relative overflow-hidden">
        <div className="container px-4 md:px-6 mx-auto relative z-10">
          <div className="text-center mb-24 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tighter">Built for Modern Teams</h2>
            <p className="text-muted-foreground text-xl font-light">
              SentiNext integrates directly with the Steam ecosystem to prioritize your roadmap.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-7xl mx-auto">
            <ValueCard
              icon={<Zap className="h-10 w-10 text-primary" />}
              title="Real-time Ingestion"
              description="Connect to your App ID. Fetch 5,000+ reviews in minutes, filtered by language and playtime."
            />
            <ValueCard
              icon={<BrainCircuit className="h-10 w-10 text-secondary" />}
              title="LLM Classification"
              description="Our fine-tuned models detect distinct technical issues, removing the noise of generic complaints."
            />
            <ValueCard
              icon={<Bot className="h-10 w-10 text-primary-foreground" />}
              title="Actionable Dashboard"
              description="Don't drown in CSVs. Get a prioritized list of top issues affecting your review score right now."
            />
          </div>
        </div>
      </section>

      {/* Core Modules */}
      <section className="py-24 md:py-32 w-full flex justify-center border-b border-[#00F0FF]/10">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tighter uppercase mb-4">Core <span className="text-[#00F0FF]">Modules</span></h2>
            <div className="h-1 w-20 bg-[#00F0FF] mx-auto rounded-full shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-7xl mx-auto">
            <ValueCard
              icon={<Cpu className="h-8 w-8" />}
              title="Classify"
              description="Fine-tuned LLM pipeline categorizing issues in sub-second latency."
            />
            <ValueCard
              icon={<Zap className="h-8 w-8" />}
              title="Quantify"
              description="Turn qualitative words into actionable impact scores for the dev team."
            />
            <ValueCard
              icon={<BrainCircuit className="h-8 w-8" />}
              title="Drill-down"
              description="Trace every insight back to the exact Steam review with deep links."
            />
            <ValueCard
              icon={<ShieldCheck className="h-8 w-8" />}
              title="Privacy"
              description="On-prem or cloud. Your proprietary analysis stays within your environment."
            />
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
            <h2 className="text-4xl md:text-6xl font-bold mb-8 uppercase tracking-tighter">Ready to <span className="text-[#00F0FF]">Optimize?</span></h2>
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto font-light font-mono tracking-widest uppercase opacity-70">
              Stop guessing. Start analyzing with precision.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <Button size="lg" className="h-14 px-12 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-[0.2em] rounded-none shadow-[0_0_30px_rgba(0,240,255,0.4)]" asChild>
                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                  Initialize System
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

function ValueCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.01 }}
      className="flex flex-col items-start text-left p-10 rounded-sm border border-[#00F0FF]/10 bg-[#00F0FF]/[0.02] backdrop-blur-sm transition-all hover:border-[#00F0FF]/40 group relative overflow-hidden"
    >
      <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="mb-8 p-4 rounded-sm bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] group-hover:bg-[#00F0FF] group-hover:text-black transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-4 tracking-widest uppercase group-hover:text-[#00F0FF] transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-sm font-light font-mono uppercase opacity-70">{description}</p>
    </motion.div>
  )
}

