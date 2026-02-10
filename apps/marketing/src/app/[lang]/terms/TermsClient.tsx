"use client";

import { motion } from "framer-motion";
import { CornerMarkers } from "@/components/ui/corner-markers";

export function TermsClient() {
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
                        Usage <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Terms.</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        Terms for using the SENTINEXT open-source software.
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-foreground/80 font-mono text-sm uppercase tracking-wide leading-relaxed">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative space-y-12">
                        <CornerMarkers />

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">1. Software License</h2>
                            <p>SENTINEXT is open-source software. The source code is available on GitHub and may be used, modified, and distributed in accordance with the project license.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">2. Self-Hosting</h2>
                            <p>SENTINEXT is designed for self-hosting. You are responsible for your own deployment, infrastructure, and any costs associated with running the software (e.g., LLM API keys, hosting).</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">3. Acceptable Use</h2>
                            <p>You may analyze Steam App IDs for which you have a legitimate interest. Do not abuse the Steam API or any third-party services integrated with the software.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">4. Data Ownership</h2>
                            <p>All data processed by your self-hosted instance stays on your infrastructure. Analysis insights you generate are yours. Public Steam review text remains subject to Valve Corporation&apos;s original terms of service.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">5. AI Limitations & Liability</h2>
                            <p>AI can be wrong. Always verify evidence quotes before making decisions. The authors of SENTINEXT are not responsible for business decisions made solely based on AI output. The software is provided &quot;as is&quot; without warranty.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
