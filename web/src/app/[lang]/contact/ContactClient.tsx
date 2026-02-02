"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Mail, Github } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export function ContactClient({ dict, lang }: { dict: any, lang: string }) {
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
                        {lang === 'it' ? 'Connessione' : 'Connect'} <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">{lang === 'it' ? 'Sistema.' : 'System.'}</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it' ? 'Protocolli di interfaccia umano-agente.' : 'Human-to-agent interface protocols.'}
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                        <ContactCard
                            icon={<Mail className="h-8 w-8 text-[#00F0FF]" />}
                            title={lang === 'it' ? "Mail Diretta" : "Direct Mail"}
                            description={lang === 'it' ? "Per richieste enterprise e protocolli di partnership." : "For enterprise inquiries and partnership protocols."}
                            link="mailto:hello@sentinext.com"
                            label="hello@sentinext.com"
                        />
                        <ContactCard
                            icon={<Github className="h-8 w-8 text-[#00F0FF]" />}
                            title={lang === 'it' ? "Codice Sorgente" : "Source Code"}
                            description={lang === 'it' ? "Segnala bug o suggerisci miglioramenti della classificazione." : "Report bugs or suggest classification Improvements."}
                            link="https://github.com"
                            label={lang === 'it' ? "Apri Repository" : "Open Repository"}
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

function ContactCard({ icon, title, description, link, label }: any) {
    return (
        <motion.div
            whileHover={{ y: -5, scale: 1.01 }}
            className="flex flex-col items-center text-center p-12 rounded-sm border border-[#00F0FF]/10 bg-[#00F0FF]/[0.02] backdrop-blur-md transition-all hover:border-[#00F0FF]/40 group relative overflow-hidden"
        >
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="mb-8 p-6 rounded-sm bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] group-hover:bg-[#00F0FF] group-hover:text-black transition-all">
                {icon}
            </div>
            <h3 className="text-2xl font-bold mb-4 tracking-widest uppercase">{title}</h3>
            <p className="text-muted-foreground mb-8 font-mono text-sm uppercase opacity-70 leading-relaxed">{description}</p>
            <Button variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-widest text-[10px] rounded-none h-12 px-8" asChild>
                <Link href={link}>{label}</Link>
            </Button>
        </motion.div>
    );
}
