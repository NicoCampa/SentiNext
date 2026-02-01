"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, BarChart3, Database, Search, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="relative w-full py-24 md:py-32 lg:py-40 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        <div className="container px-4 md:px-6 relative z-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-6"
          >
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            SentiNext is now available
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70 mb-6 max-w-4xl"
          >
            Turn Steam reviews into actionable insights.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed"
          >
            SentiNext analyzes thousands of player reviews to tell you exactly what’s driving sentiment, what’s broken, and what to build next.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
          >
            <Button size="lg" className="h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_var(--primary)]" asChild>
              <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                Open SentiNext <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link href="/how-it-works">
                How it works
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="w-full py-20 bg-card border-y border-border/40">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Beyond simple sentiment</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We go deeper than "Negative" or "Positive". SentiNext builds a structured taxonomy of every issue and request found in your reviews.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Search className="h-8 w-8 text-primary" />}
              title="Ingest & Search"
              description="Instantly fetch reviews for any Steam app. Filter by language, date range, and playtime to get the most relevant feedback."
              delay={0.1}
            />
            <FeatureCard
              icon={<Database className="h-8 w-8 text-secondary" />}
              title="Auto-Classification"
              description="Our LLM-powered pipeline tags every review with specific issues (e.g., 'Performance/Stuttering') and requests."
              delay={0.2}
            />
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8 text-blue-400" />}
              title="Aggregate Insights"
              description="See the big picture. Identify the top 5 issues driving negative sentiment and prioritize your roadmap with data."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* Preview / How it works Teaser */}
      <section className="w-full py-24">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Designed for Product Teams</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Real-time Analysis</h3>
                    <p className="text-sm text-muted-foreground mt-1">Don't wait for monthly reports. Run analysis whenever you need fresh insights.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Transparent Taxonomy</h3>
                    <p className="text-sm text-muted-foreground mt-1">Drill down from a high-level "Bug" category to specific reviews mentioning "Crash on Startup".</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Hosted or Local</h3>
                    <p className="text-sm text-muted-foreground mt-1">Use our hosted version or run the open-source engine locally for full data control.</p>
                  </div>
                </li>
              </ul>
              <div className="mt-8">
                <Button variant="link" className="p-0 text-primary h-auto" asChild>
                  <Link href="/product">Explore all features <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
            </div>
            <div className="relative aspect-square md:aspect-video rounded-xl bg-gradient-to-br from-card to-background border border-border/50 shadow-2xl p-6 flex flex-col justify-center items-center overflow-hidden group">
              {/* Abstract UI representation */}
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(68,68,68,.2)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%,100%_100%] bg-[position:-100%_0,0_0] bg-no-repeat transition-[background-position_0s] duration-0 ease-in-out group-hover:bg-[position:200%_0,0_0] group-hover:duration-[1500ms]" />
              <div className="w-full h-full border border-border/30 rounded-lg bg-background/50 backdrop-blur flex flex-col p-4">
                <div className="h-8 w-full border-b border-border/30 mb-4 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500/50" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
                  <div className="h-3 w-3 rounded-full bg-green-500/50" />
                </div>
                <div className="flex-1 w-full grid grid-cols-3 gap-4">
                  <div className="col-span-1 border-r border-border/30 pr-4 space-y-3">
                    <div className="h-4 w-3/4 bg-border/20 rounded" />
                    <div className="h-4 w-1/2 bg-border/20 rounded" />
                    <div className="h-4 w-2/3 bg-border/20 rounded" />
                  </div>
                  <div className="col-span-2 space-y-3">
                    <div className="h-32 w-full bg-border/10 rounded flex items-end p-2 gap-2">
                      <div className="w-8 h-12 bg-primary/40 rounded-t" />
                      <div className="w-8 h-20 bg-primary/60 rounded-t" />
                      <div className="w-8 h-16 bg-primary/50 rounded-t" />
                      <div className="w-8 h-24 bg-primary rounded-t" />
                    </div>
                    <div className="h-4 w-full bg-border/20 rounded" />
                    <div className="h-4 w-5/6 bg-border/20 rounded" />
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-24 mb-10">
        <div className="container px-4 md:px-6">
          <div className="rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/5 border border-border/50 p-8 md:p-16 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Ready to see your game clearly?</h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Join developers who are using SentiNext to prioritize their roadmap and improve player sentiment.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90" asChild>
                <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                  Try SentiNext for Free
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base bg-transparent border-primary/20 hover:bg-primary/5 hover:text-primary hover:border-primary/50" asChild>
                <Link href="/contact">
                  Contact Sales
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="flex flex-col items-center text-center p-6 rounded-xl border border-border/40 bg-card/30 hover:bg-card/50 transition-colors"
    >
      <div className="mb-4 p-3 rounded-full bg-background border border-border/50 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </motion.div>
  )
}
