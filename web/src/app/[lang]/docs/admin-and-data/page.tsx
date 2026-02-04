"use client";

import { ShieldAlert, Database } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default function AdminAndDataPage() {
    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">Data Governance</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    How data is stored, exported, and (optionally) deleted via admin-only endpoints.
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <section className="space-y-8">
                    <div className="flex items-center gap-6">
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-sm">
                            <ShieldAlert className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-widest uppercase m-0 text-red-500/80">Destructive Actions</h2>
                        <div className="h-px flex-1 bg-gradient-to-r from-red-500/20 to-transparent" />
                    </div>

                    <div className="pl-16 space-y-6">
                        <p className="font-light text-foreground/70 leading-relaxed max-w-2xl">
                            Destructive endpoints (delete game data / clear labels / clear database) are disabled by default. When enabled, they require explicit server configuration and admin authorization.
                        </p>
                        <div className="grid gap-4 max-w-2xl">
                            <div className="p-6 border border-red-500/10 bg-red-500/5 rounded-sm">
                                <div className="text-[10px] font-mono text-red-500 uppercase tracking-[0.3em] mb-2">Requirement 01</div>
                                <code className="text-sm">SENTINEXT_ENABLE_DESTRUCTIVE=1</code>
                            </div>
                            <div className="p-6 border border-red-500/10 bg-red-500/5 rounded-sm">
                                <div className="text-[10px] font-mono text-red-500 uppercase tracking-[0.3em] mb-2">Requirement 02</div>
                                <code className="text-sm">x-admin-token: ...</code>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-8">
                    <div className="flex items-center gap-6">
                        <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                            <Database className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-widest uppercase m-0">Database & Exports</h2>
                        <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
                    </div>

                    <div className="pl-16 space-y-8">
                        <p className="font-light text-foreground/70 leading-relaxed max-w-2xl">
                            SENTINEXT stores raw Steam reviews, AI labels (including evidence quotes), and analysis results in PostgreSQL. You can search and export your dataset from the in-app Database view.
                        </p>
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="p-8 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm relative">
                                <CornerMarkers className="opacity-30" />
                                <h4 className="text-sm font-bold uppercase tracking-widest mb-4">User Scope</h4>
                                <div className="text-3xl font-bold font-mono text-[#00F0FF]">ME</div>
                                <p className="text-xs text-muted-foreground mt-4 font-mono uppercase tracking-wider leading-relaxed">
                                    Browse and export reviews for the games you analyzed.
                                </p>
                            </div>
                            <div className="p-8 border border-white/10 bg-white/5 rounded-sm relative">
                                <CornerMarkers className="opacity-30" />
                                <h4 className="text-sm font-bold uppercase tracking-widest mb-4">Admin Scope</h4>
                                <div className="text-3xl font-bold font-mono">ALL</div>
                                <p className="text-xs text-muted-foreground mt-4 font-mono uppercase tracking-wider leading-relaxed">
                                    Admins can inspect the full database and run cleanup actions when enabled.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
