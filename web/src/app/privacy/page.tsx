"use client";

import { motion } from "framer-motion";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function PrivacyPage() {
    return (
        <div className="flex flex-col min-h-screen items-center w-full">
            <section className="py-20 md:py-32 bg-transparent relative overflow-hidden flex flex-col items-center justify-center border-b border-[#00F0FF]/10 w-full">
                <div className="scanline" />
                <div className="container px-4 md:px-6 text-center max-w-5xl mx-auto relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter mb-8 leading-tight uppercase"
                    >
                        Security <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Protocols.</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        Data handling and privacy standards.
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative">
                        <CornerMarkers />
                        <div className="prose prose-invert max-w-none font-mono text-sm leading-relaxed uppercase opacity-80 space-y-8">
                            <div>
                                <h2 className="text-[#00F0FF] text-xl font-bold mb-4">1. Data Ingestion</h2>
                                <p>SentiNext processes public Steam review data. We do not ingest private player communications or sensitive identifiable information beyond what is provided publicly via the Steam API.</p>
                            </div>
                            <div>
                                <h2 className="text-[#00F0FF] text-xl font-bold mb-4">2. AI Processing</h2>
                                <p>Classification occurs in secure neural environments. Your proprietary analysis data is isolated and encrypted. We do not use your feedback data to train global models without explicit consent.</p>
                            </div>
                            <div>
                                <h2 className="text-[#00F0FF] text-xl font-bold mb-4">3. Local Deployment</h2>
                                <p>For enterprise clients, SentiNext supports full on-premise installation where no data leaves your internal network.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
