"use client";

import Link from "next/link";
import { ShieldCheck, UserCheck, Key, Lock } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function AuthenticationPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Authentication</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    Managed identity protocols and session security. SentiNext uses industry-standard encryption to protect your project telemetry.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsAuthStep
                    title="Managed Identity"
                    icon={<UserCheck className="h-6 w-6" />}
                    description="We use Clerk for enterprise-grade authentication management."
                >
                    <p>
                        Every analyst identity is verified via <Link href="https://clerk.com" target="_blank" className="text-[#00F0FF] underline decoration-[#00F0FF]/30">Clerk</Link>. This ensures your analysis history and project clusters are isolated and protected by modern security frameworks.
                    </p>
                </DocsAuthStep>

                <DocsAuthStep
                    title="Access Control"
                    icon={<Lock className="h-6 w-6" />}
                    description="Why a secure session is required for agent deployment."
                >
                    <p>While public telemetry is viewable by anyone, deploying active agents requires an authenticated session to:</p>
                    <ul className="space-y-3 list-none p-0 mt-6">
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Initialize New Analysis Pipelines
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Commit Games to Personal Cluster
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Manage Organization Teams
                        </li>
                    </ul>
                </DocsAuthStep>

                <DocsAuthStep
                    title="API Protocols"
                    icon={<Key className="h-6 w-6" />}
                    description="Headless access for automated CI/CD workflows."
                >
                    <p>
                        For automated extraction via CLI or external scripts, you must generate a <span className="text-[#00F0FF]">Bearer Token</span> from your profile settings. These tokens bypass the UI and allow direct agent triggering.
                    </p>
                </DocsAuthStep>
            </div>
        </div>
    );
}

function DocsAuthStep({ title, icon, description, children }: any) {
    return (
        <section className="space-y-6">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                    {icon}
                </div>
                <h2 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
            </div>
            <div className="pl-16 space-y-4">
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">{description}</p>
                <div className="pt-4 border-l-2 border-[#00F0FF]/10 pl-8">
                    {children}
                </div>
            </div>
        </section>
    );
}
