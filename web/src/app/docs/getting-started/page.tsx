"use client";

import Link from "next/link";
import { AlertTriangle, Terminal, Rocket } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function GettingStartedPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Getting Started</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    Welcome to the SentiNext Closed Beta. This protocol will guide you through initializing your first AI agent and quantifying review intelligence.
                </p>
            </section>

            {/* Banner */}
            <div className="relative p-8 border border-[#00F0FF]/20 bg-[#00F0FF]/5 rounded-sm flex gap-6 items-start group overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 rounded-sm text-[#00F0FF]">
                    <Terminal className="h-6 w-6" />
                </div>
                <div>
                    <h4 className="font-mono text-xs font-bold text-[#00F0FF] mb-2 uppercase tracking-[0.2em]">Deployment: Hosted Cloud</h4>
                    <p className="text-sm text-foreground/70 m-0 font-mono uppercase tracking-wide leading-relaxed">
                        No local hardware or GPU required. The system is operating in autonomous cloud-agent mode.
                    </p>
                </div>
                <div className="absolute -top-1 -right-1 w-24 h-24 bg-[#00F0FF]/5 blur-3xl rounded-full" />
            </div>

            <div className="space-y-16 mt-16">
                <StepSection
                    number="01"
                    title="Access the Platform"
                    description="The dashboard is the central hub for all agent operations."
                >
                    <p>
                        Navigate to the <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank" className="font-bold underline decoration-[#00F0FF]/30 hover:decoration-[#00F0FF]">SentiNext App Dashboard</Link>. Verify your connection to the secure server at <code>sentinext-frontend.onrender.com</code>.
                    </p>
                </StepSection>

                <StepSection
                    number="02"
                    title="Initialize Identity"
                    description="Secure authentication is required for job persistence."
                >
                    <p>
                        Authenticate using your developer credentials. The system uses <span className="text-[#00F0FF]">Clerk-managed authentication</span> to ensure encrypted session handling and project isolation.
                    </p>
                </StepSection>

                <StepSection
                    number="03"
                    title="Deploy First Agent"
                    description="Configure the extraction parameters for your Steam project."
                >
                    <div className="grid gap-6">
                        <ul className="space-y-4 list-none p-0">
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Click "New Analysis"</strong> on the main command center.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Target Steam App ID</strong>: For example, use <code>1086940</code> for Baldur's Gate 3 telemetry.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Select "Recent Reviews"</strong>: Optimized for real-time sentiment shifts after updates.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Initialize (Commit)</strong>: Confirm parameters and deploy the agent.</div>
                            </li>
                        </ul>

                        <div className="p-4 bg-black/40 border border-[#00F0FF]/10 rounded-sm font-mono text-xs text-[#00F0FF]/60 flex items-center gap-3">
                            <Rocket className="h-4 w-4" />
                            <span>System: Agent successfully deployed to cluster. Job ID: SN_ALPHA_001</span>
                        </div>
                    </div>
                </StepSection>
            </div>
        </div>
    );
}

function StepSection({ number, title, description, children }: any) {
    return (
        <section className="space-y-6">
            <div className="flex items-center gap-6">
                <div className="text-4xl font-bold font-mono text-[#00F0FF]/20 leading-none">
                    {number}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
            </div>
            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">{description}</p>
                <div className="pt-4 border-l-2 border-[#00F0FF]/10 pl-8">
                    {children}
                </div>
            </div>
        </section>
    );
}
