"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Bot, Sparkles, Zap, BrainCircuit, ShieldCheck, Cpu, MessageSquare } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center w-full min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full py-24 md:py-32 lg:py-48 overflow-hidden flex flex-col items-center justify-center">
        <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto">
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
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-[0.9] animate-float"
          >
            Your AI Analyst for <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_auto] animate-pulse">Steam Reviews</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-lg md:text-2xl text-muted-foreground max-w-3xl mb-12 leading-relaxed"
          >
            SentiNext's AI Agent reads, classifies, and quantifies thousands of reviews to give you instant product answers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto items-center justify-center"
          >
            <Button size="lg" className="h-16 px-12 text-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wide rounded-full shadow-[0_0_30px_-5px_rgba(79,70,229,0.5)] transition-all hover:scale-105 active:scale-95" asChild>
              <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                Start Analysis <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-16 px-12 text-lg border-white/10 hover:bg-white/5 rounded-full glass transition-all" asChild>
              <Link href="/how-it-works">
                How it works
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* AI Agent Chat Section */}
      <section className="w-full py-32 border-y border-white/5 bg-white/[0.02] backdrop-blur-xl">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-2 mb-6 text-primary font-mono text-sm tracking-[0.3em] uppercase">
                <MessageSquare className="h-4 w-4" />
                <span>Conversational Intelligence</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-bold mb-8 tracking-tighter">Ask Your Data <br />Anything.</h2>
              <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-lg font-light">
                Why scroll through 5,000 negative reviews? Just ask the agent. SentiNext simulates a product analyst that has read every single comment.
              </p>

              <div className="space-y-6">
                {[
                  "What are the top 3 reasons players are refunding this week?",
                  "Do players prefer the new combat system or the old one?"
                ].map((q, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ x: 10, backgroundColor: "rgba(255,255,255,0.05)" }}
                    className="p-5 rounded-2xl glass border border-white/10 flex gap-5 transition-all cursor-pointer group"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold group-hover:bg-primary group-hover:text-white transition-colors">Q</div>
                    <p className="font-medium text-lg leading-snug">{q}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Visual Representation of Chat Interface */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full" />
              <div className="relative rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl glass backdrop-blur-2xl">
                <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-6">
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500/50" />
                    <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                    <div className="h-3 w-3 rounded-full bg-green-500/50" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground ml-2 tracking-widest uppercase opacity-50">SentiNext Agent v1.0</span>
                </div>
                <div className="space-y-8 font-mono text-sm h-[320px] overflow-hidden relative">
                  <div className="flex gap-4 items-start">
                    <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10 font-bold opacity-70">U</div>
                    <div className="p-4 bg-white/5 rounded-2xl text-foreground border border-white/10 max-w-[80%]">
                      Why is the review score dropping?
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 text-white shadow-[0_0_20px_rgba(79,70,229,0.5)]"><Bot className="h-5 w-5" /></div>
                    <div className="space-y-4 w-full">
                      <div className="p-5 bg-primary/5 rounded-2xl text-foreground border border-primary/20 max-w-[90%] glass">
                        <p className="mb-4 text-base font-bold">I analyzed 450 recent reviews:</p>
                        <ul className="space-y-3 mb-4 text-muted-foreground">
                          <li className="flex gap-3 items-start italic border-l-2 border-red-500/50 pl-3">
                            <span>"Game keeps stuttering after v1.2 patch..."</span>
                          </li>
                          <li className="flex gap-3 items-start italic border-l-2 border-red-500/50 pl-3">
                            <span>"Lost my save file in the Iron Mines!"</span>
                          </li>
                        </ul>
                        <div className="pt-4 border-t border-white/5 text-xs text-primary flex gap-2 items-center font-bold tracking-wider uppercase">
                          <ShieldCheck className="h-4 w-4" /> 120 evidence points extracted
                        </div>
                      </div>
                    </div>
                  </div>
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

      {/* CTA Section */}
      <section className="w-full py-32">
        <div className="container px-4 md:px-6 mx-auto">
          <motion.div
            whileInView={{ scale: [0.95, 1], opacity: [0, 1] }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto rounded-[3rem] bg-gradient-to-br from-primary/20 via-black/20 to-secondary/20 border border-white/10 p-12 md:p-24 text-center shadow-2xl relative overflow-hidden glass"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/10 blur-[100px] -ml-32 -mb-32" />

            <h2 className="text-5xl md:text-7xl font-bold mb-10 tracking-tighter relative z-10">Deploy Intelligence.</h2>
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto relative z-10 font-light">
              Join the beta. Analyze your game's feedback loop today.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6 relative z-10">
              <Button size="lg" className="h-16 px-12 text-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-full shadow-[0_0_40px_-10px_rgba(79,70,229,1)] transition-transform hover:scale-105" asChild>
                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                  Try SentiNext Agent
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

function ValueCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div
      whileHover={{ y: -10, scale: 1.02 }}
      className="flex flex-col items-center text-center p-10 rounded-[2rem] border border-white/10 bg-white/[0.03] glass-morphism transition-all hover:border-primary/50 group"
    >
      <div className="mb-8 p-6 rounded-2xl bg-black/40 border border-white/10 group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-xl">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4 tracking-tight group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-lg font-light">{description}</p>
    </motion.div>
  )
}
