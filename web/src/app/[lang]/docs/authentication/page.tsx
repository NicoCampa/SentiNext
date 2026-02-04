"use client";

import Link from "next/link";
import { ShieldCheck, UserCheck, Lock } from "lucide-react";
import type { ReactNode } from "react";

export default function AuthenticationPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Authentication</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    SentiNext uses Clerk for sign-in. Authentication is required to save analyses, manage credits, and keep data separated per user.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsAuthStep
                    title="Sign In With Clerk"
                    icon={<UserCheck className="h-6 w-6" />}
                    description="Clerk handles sessions and account management for SentiNext."
                >
                    <p>
                        You authenticate via <Link href="https://clerk.com" target="_blank" className="text-[#00F0FF] underline decoration-[#00F0FF]/30">Clerk</Link>. Your analysis history, saved games, and credit usage are tied to your account.
                    </p>
                </DocsAuthStep>

                <DocsAuthStep
                    title="Why Sign In Is Required"
                    icon={<Lock className="h-6 w-6" />}
                    description="Sign-in enables persistence, exports, and usage tracking."
                >
                    <p>Authentication is required to:</p>
                    <ul className="space-y-3 list-none p-0 mt-6">
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Save analyzed games and results
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Track credits and subscriptions
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> Export datasets and generate reports
                        </li>
                    </ul>
                </DocsAuthStep>

                <DocsAuthStep
                    title="Security"
                    icon={<ShieldCheck className="h-6 w-6" />}
                    description="The dashboard handles tokens for you."
                >
                    <p>
                        The web dashboard automatically authenticates API requests using your Clerk session. If you call the API directly, you’ll need to provide a valid <span className="text-[#00F0FF]">Bearer</span> token from Clerk.
                    </p>
                </DocsAuthStep>
            </div>
        </div>
    );
}

type DocsAuthStepProps = {
    title: string;
    icon: ReactNode;
    description: string;
    children: ReactNode;
};

function DocsAuthStep({ title, icon, description, children }: DocsAuthStepProps) {
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
