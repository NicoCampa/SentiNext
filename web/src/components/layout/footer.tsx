"use client";

import Link from "next/link";
import { Github, Mail, Info, Linkedin } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import type { SupportedLocale } from "@/lib/i18n";

export function Footer({ lang }: { lang: SupportedLocale }) {
    return (
        <footer className="border-t border-[#00F0FF]/10 bg-background py-20">
            <div className="container px-4 md:px-6 mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-16">
                    <div className="flex flex-col gap-6">
                        <Link href={`/${lang}`} className="transition-opacity hover:opacity-80">
                            <Logo />
                        </Link>
                        <p className="text-xs text-muted-foreground leading-relaxed font-mono uppercase tracking-widest opacity-60">
                            Steam review intelligence for game teams.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Product</h4>
                        <Link href={`/${lang}/product`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Features</Link>
                        <Link href={`/${lang}/pricing`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Pricing</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Resources</h4>
                        <Link href={`/${lang}/docs`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Documentation</Link>
                        <Link href={`/${lang}/docs/faq`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">FAQ</Link>
                        <Link href={`/${lang}/docs/taxonomy-reference`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Taxonomy Ref</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Connect</h4>
                        <div className="flex items-center gap-6 mt-2">
                            <Link href="https://github.com/NicoCampa/SentiNext" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Github className="h-5 w-5" />
                                <span className="sr-only">GitHub</span>
                            </Link>
                            <Link href="https://x.com/NicoGrigio" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors font-bold text-lg">
                                𝕏
                            </Link>
                            <Link href="https://www.linkedin.com/in/nicolo-campagnoli" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Linkedin className="h-5 w-5" />
                                <span className="sr-only">LinkedIn</span>
                            </Link>
                            <Link href="mailto:nicolocampagnoli20@icloud.com" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Valve Disclaimer */}
                <div className="mt-16 p-4 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm flex gap-4 items-start opacity-40 hover:opacity-100 transition-opacity">
                    <Info className="h-4 w-4 text-[#00F0FF] mt-0.5" />
                    <p className="text-[9px] font-mono uppercase tracking-widest leading-relaxed">
                        SENTINEXT is an independent tool that analyzes public Steam reviews via Steam APIs. We are not endorsed by, affiliated with, or supported by Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation.
                    </p>
                </div>

                <div className="mt-16 border-t border-[#00F0FF]/10 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground opacity-50">
                        © {new Date().getFullYear()} SENTINEXT. Steam Review Intelligence. Based in Berlin, EU.
                    </p>
                    <div className="flex gap-8">
                        <Link href={`/${lang}/impressum`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">Impressum</Link>
                        <Link href={`/${lang}/privacy`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">Privacy</Link>
                        <Link href={`/${lang}/terms`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">Terms</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
