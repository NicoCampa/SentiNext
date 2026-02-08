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
                        GDPR & Data Protection
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-foreground/80 font-mono text-sm uppercase tracking-wide leading-relaxed">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative space-y-12">
                        <CornerMarkers />

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">1. Data Controller</h2>
                            <p>The responsible party for data processing on this website (the &quot;Controller&quot;) is Nicolo Campagnoli, based in Berlin, Germany. Contact: nicolocampagnoli20@icloud.com.</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">2. Data We Process</h2>
                            <p>We process the following data to provide the service:</p>
                            <ul className="list-disc pl-6 space-y-2 mt-4">
                                <li>Identity Data: Email and name via Clerk (Managed Auth).</li>
                                <li>Technical Data: IP addresses, browser type, and OS for security/logging.</li>
                                <li>Usage Data: Analyzed App IDs, results, and service settings (e.g., credits).</li>
                                <li>Review Data: text and metadata of public Steam reviews you analyze.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">3. Legal Basis (GDPR)</h2>
                            <p>Data processing is based on Art. 6(1)(b) GDPR (performance of a contract) and Art. 6(1)(f) GDPR (our legitimate interest in providing a secure, high-performance analysis platform).</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">4. Third-Party Processors</h2>
                            <p>We use external providers for service-critical operations:</p>
                            <ul className="list-disc pl-6 space-y-2 mt-4">
                                <li><strong>Clerk</strong>: Identity management and authentication.</li>
                                <li><strong>Render/PostgreSQL</strong>: Secure hosting and data persistence.</li>
                                <li><strong>Google Gemini</strong>: Review classification (text + non-identifying metadata like language and playtime).</li>
                                <li><strong>Stripe</strong>: Billing and subscription management (if enabled).</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">5. User Rights</h2>
                            <p>Under GDPR, you have the right to access, rectify, or erase your personal data (the &quot;Right to be Forgotten&quot;). To exercise these rights, please contact the Data Controller directly.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
