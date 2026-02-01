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
        {/* Subtle Gradient Spot - No Neon Glow */}
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

        <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary mb-8 backdrop-blur-sm"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
            <span className="tracking-wide uppercase text-xs font-bold">Public Beta Live</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 leading-tight"
          >
            Your AI Analyst for <br />
            <span className="text-primary">Steam Reviews</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-2xl text-muted-foreground max-w-3xl mb-12 leading-relaxed"
          >
            Don't just read feedback. Chat with it. SentiNext's AI Agent reads, classifies, and quantifies thousands of reviews to give you instant answers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto items-center justify-center"
          >
            <Button size="lg" className="h-14 px-10 text-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wide shadow-none" asChild>
              <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                Start Analysis <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-10 text-lg border-primary/20 hover:bg-primary/10" asChild>
              <Link href="/how-it-works">
                See How it Works
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* AI Agent Chat Section */}
      <section className="w-full py-24 border-y border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center max-w-6xl mx-auto">
            <div>
              <div className="flex items-center gap-2 mb-4 text-primary font-mono text-sm tracking-widest uppercase">
                <MessageSquare className="h-4 w-4" />
                <span>Conversational Intelligence</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Ask Your Data Questions.</h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Why scroll through 5,000 negative reviews? Just ask the agent. SentiNext simulates a product analyst that has read every single comment.
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-card border border-border/50 flex gap-4">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">Q</div>
                  <p className="font-medium">"What are the top 3 reasons players are refunding this week?"</p>
                </div>
                <div className="p-4 rounded-lg bg-card border border-border/50 flex gap-4 opacity-80">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">Q</div>
                  <p className="font-medium">"Do players prefer the new combat system or the old one?"</p>
                </div>
              </div>
            </div>

            {/* Visual Representation of Chat Interface */}
            <div className="relative group">
              <div className="relative rounded-xl border border-border/50 bg-card p-6 shadow-2xl">
                <div className="flex items-center gap-3 border-b border-border/50 pb-4 mb-4">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-xs text-muted-foreground ml-2">SentiNext Agent v1.0</span>
                </div>
                <div className="space-y-6 font-mono text-sm h-[300px] overflow-hidden relative">
                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">You</div>
                    <div className="p-3 bg-muted rounded-lg text-foreground">
                      Why is the review score dropping?
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded bg-primary flex items-center justify-center flex-shrink-0 text-white"><Bot className="h-4 w-4" /></div>
                    <div className="space-y-3 w-full">
                      <div className="p-3 bg-primary/10 rounded-lg text-foreground border border-primary/20">
                        <p className="mb-2">I analyzed 450 recent negative reviews. The drop is driven by 2 main issues:</p>
                        <ul className="list-disc pl-4 space-y-1 mb-2 text-muted-foreground">
                          <li><strong>Performance / Stutter</strong> (35% of reports) - Specifically after the v1.2 patch.</li>
                          <li><strong>Save Data / Corruption</strong> (15% of reports) - Occurs in the "Iron Mines" level.</li>
                        </ul>
                        <div className="text-xs text-primary flex gap-2 items-center mt-2">
                          <ShieldCheck className="h-3 w-3" /> Verified with 120 evidence quotes
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="w-full py-24">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Built for Developers</h2>
            <p className="text-muted-foreground text-lg">
              SentiNext integrates directly with the Steam ecosystem.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <ValueCard
              icon={<Zap className="h-8 w-8 text-primary" />}
              title="Real-time Ingestion"
              description="Connect to your App ID. Fetch 5,000+ reviews in minutes, filtered by language and playtime."
            />
            <ValueCard
              icon={<BrainCircuit className="h-8 w-8 text-secondary" />}
              title="LLM Classification"
              description="Our fine-tuned models detect distinct technical issues, removing the noise of generic complaints."
            />
            <ValueCard
              icon={<Bot className="h-8 w-8 text-foreground" />}
              title="Actionable Dashboard"
              description="Don't drown in CSVs. Get a prioritized list of top issues affecting your review score right now."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-24 mb-10">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="max-w-4xl mx-auto rounded-3xl bg-card border border-border/50 p-8 md:p-16 text-center shadow-lg relative overflow-hidden">

            <h2 className="text-3xl md:text-5xl font-bold mb-6 relative z-10">Deploy Intelligence.</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto relative z-10">
              Join the beta. Analyze your game's feedback loop today.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 relative z-10">
              <Button size="lg" className="h-14 px-10 text-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold" asChild>
                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                  Try SentiNext Agent
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ValueCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center text-center p-8 rounded-xl border border-border/40 bg-card/30 hover:bg-card/50 transition-all hover:border-primary/30 group">
      <div className="mb-6 p-4 rounded-full bg-background border border-border/50 group-hover:border-primary/50 transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
