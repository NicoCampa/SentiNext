"use client";

import Link from "next/link";
import { Terminal, Rocket, Container, Wrench } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";

const fadeSlideUp = (delay: number): React.CSSProperties => ({
    opacity: 0,
    animation: 'fadeSlideUp 0.5s ease-out forwards',
    animationDelay: `${delay}ms`,
});

export default function GettingStartedPage() {
    return (
        <div className="space-y-12 pb-20">
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">
                    Getting Started
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    Deploy SentiNext on your own infrastructure and start analyzing Steam reviews.
                </p>
            </section>

            {/* Banner */}
            <div className="relative p-8 border border-[#00F0FF]/20 bg-[#00F0FF]/5 rounded-sm flex gap-6 items-start group overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 rounded-sm text-[#00F0FF]">
                    <Terminal className="h-6 w-6" />
                </div>
                <div>
                    <h4 className="font-mono text-xs font-bold text-[#00F0FF] mb-2 uppercase tracking-[0.2em]">
                        Deployment: Self-Hosted
                    </h4>
                    <p className="text-sm text-foreground/70 m-0 font-mono uppercase tracking-wide leading-relaxed">
                        SentiNext runs on your infrastructure. Choose Docker Compose for quick setup or manual deployment for full control.
                    </p>
                </div>
                <div className="absolute -top-1 -right-1 w-24 h-24 bg-[#00F0FF]/5 blur-3xl rounded-full" />
            </div>

            <div className="space-y-16 mt-16">
                <StepSection
                    number="01"
                    title="Docker Compose (Recommended)"
                    description="One-command deployment with PostgreSQL, backend, and frontend."
                    icon={<Container className="h-5 w-5 text-[#00F0FF]" />}
                >
                    <div className="grid gap-6">
                        <div className="p-4 bg-black/40 border border-[#00F0FF]/10 rounded-sm font-mono text-xs text-[#00F0FF]/80 space-y-2">
                            <p className="text-[#00F0FF]/40"># Clone and configure</p>
                            <p>git clone https://github.com/nicolo-nico/SentiNext.git</p>
                            <p>cd SentiNext</p>
                            <p>cp .env.example .env.local</p>
                            <p className="text-[#00F0FF]/40"># Edit .env.local with your LLM API key</p>
                            <p>&nbsp;</p>
                            <p className="text-[#00F0FF]/40"># Start everything</p>
                            <p>docker compose up --build</p>
                        </div>
                        <p>
                            This starts PostgreSQL, the FastAPI backend, and the Next.js frontend. The dashboard will be available at{' '}
                            <span className="font-bold text-[#00F0FF]">http://localhost:3000</span>.
                        </p>
                    </div>
                </StepSection>

                <StepSection
                    number="02"
                    title="Manual Setup (Alternative)"
                    description="Run the frontend and backend separately for development or custom deployments."
                    icon={<Wrench className="h-5 w-5 text-[#00F0FF]" />}
                >
                    <div className="grid gap-6">
                        <div className="p-4 bg-black/40 border border-[#00F0FF]/10 rounded-sm font-mono text-xs text-[#00F0FF]/80 space-y-2">
                            <p className="text-[#00F0FF]/40"># Backend</p>
                            <p>conda env create -f environment.yml</p>
                            <p>conda activate SentiNext</p>
                            <p>./run_backend_local.sh</p>
                            <p>&nbsp;</p>
                            <p className="text-[#00F0FF]/40"># Frontend (separate terminal)</p>
                            <p>./run_frontend_local.sh</p>
                        </div>
                        <p>
                            See{' '}
                            <Link href="https://github.com/nicolo-nico/SentiNext" target="_blank" className="font-bold underline decoration-[#00F0FF]/30 hover:decoration-[#00F0FF]">
                                LOCAL_DEVELOPMENT.md
                            </Link>{' '}
                            in the repository for full setup instructions.
                        </p>
                    </div>
                </StepSection>

                <StepSection
                    number="03"
                    title="Analyze Your First Game"
                    description="Search a game and start a review analysis run."
                >
                    <div className="grid gap-6">
                        <ul className="space-y-4 list-none p-0">
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Search for a game</strong> by name or paste a Steam App ID.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Start the analysis</strong>: the dashboard uses the latest 1,000 reviews by default.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Wait for completion</strong>: you&#39;ll see progress, then a dashboard with insights and quotes.</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Explore & share</strong>: use Reviews, Chat, Compare, Reports, and exports when needed.</div>
                            </li>
                        </ul>

                        <div className="p-4 bg-black/40 border border-[#00F0FF]/10 rounded-sm font-mono text-xs text-[#00F0FF]/60 flex items-center gap-3">
                            <Rocket className="h-4 w-4" />
                            <span>System: Analysis started. Progress is visible in the dashboard.</span>
                        </div>
                    </div>
                </StepSection>
            </div>

            {/* Pipeline visual */}
            <div className="space-y-6 mt-8">
                <div className="p-6 bg-[rgb(10,10,25)]/50 border border-[#00F0FF]/10 rounded-sm space-y-4" style={fadeSlideUp(0)}>
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Analysis Progress</div>
                        <div className="font-mono text-xs text-[#00F0FF]">847 / 1,000 reviews</div>
                    </div>
                    <div className="h-2 bg-[#00F0FF]/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00F0FF]/60 rounded-full" style={{ width: '85%' }} />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: "Recommendation", value: "87%", color: "border-l-emerald-500", delay: 80 },
                        { label: "Issue Rate", value: "23%", color: "border-l-amber-500", delay: 160 },
                        { label: "Reviews", value: "1,000", color: "border-l-cyan-500", delay: 240 },
                    ].map((kpi) => (
                        <div
                            key={kpi.label}
                            className={`p-4 bg-[rgb(10,10,25)]/50 border border-[#00F0FF]/10 border-l-2 ${kpi.color} rounded-sm`}
                            style={fadeSlideUp(kpi.delay)}
                        >
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</div>
                            <div className="text-2xl font-bold font-mono mt-1">{kpi.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

type StepSectionProps = {
    number: string;
    title: string;
    description: string;
    icon?: ReactNode;
    children: ReactNode;
};

function StepSection({ number, title, description, children }: StepSectionProps) {
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
