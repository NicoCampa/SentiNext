"use client";

import { motion } from "framer-motion";
import { CornerMarkers } from "@/components/ui/corner-markers";

export function PrivacyClient() {
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
                        Privacy <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">Policy.</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        Self-Hosted & Privacy-First
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-foreground/80 font-mono text-sm uppercase tracking-wide leading-relaxed">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative space-y-12">
                        <CornerMarkers />

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">1. Self-Hosted by Design</h2>
                            <p>SENTINEXT is self-hosted software. All data -- reviews, analysis results, and user information -- stays on your own infrastructure. We do not operate a hosted service and do not collect your data.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">2. Marketing Website</h2>
                            <p>This website (sentinext.com) is a static marketing site. It does not use cookies, tracking pixels, or analytics services. No personal data is collected through this website.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">3. Data You Control</h2>
                            <p>When you self-host SENTINEXT, you control all data processing:</p>
                            <ul className="list-disc pl-6 space-y-2 mt-4">
                                <li>Review Data: Public Steam reviews fetched via Steam API, stored in your PostgreSQL database.</li>
                                <li>Analysis Results: AI classification labels and evidence quotes, stored locally.</li>
                                <li>LLM API Calls: Review text is sent to the LLM provider you configure (e.g., xAI, Gemini, OpenAI). Refer to their privacy policies.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">4. Third-Party Services</h2>
                            <p>Depending on your configuration, self-hosted SENTINEXT may communicate with:</p>
                            <ul className="list-disc pl-6 space-y-2 mt-4">
                                <li><strong>Steam API</strong>: To fetch public game reviews.</li>
                                <li><strong>LLM Providers</strong>: Review text is sent for classification. Choose a provider that meets your data requirements.</li>
                                <li><strong>PostgreSQL</strong>: Your own database instance for data persistence.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">5. Contact</h2>
                            <p>For questions about privacy, contact: nicolocampagnoli20@icloud.com.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
