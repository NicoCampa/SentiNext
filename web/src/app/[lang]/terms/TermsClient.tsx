"use client";

import { motion } from "framer-motion";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { SupportedLocale } from "@/lib/i18n";

export function TermsClient({ lang }: { lang: SupportedLocale }) {
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
                        {lang === 'it' ? 'Termini' : 'Usage'} <span className="text-[#00F0FF] shadow-[#00F0FF]/50 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">{lang === 'it' ? 'Servizio.' : 'Terms.'}</span>
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it' ? 'Termini di utilizzo dei servizi SENTINEXT.' : 'Terms for using SENTINEXT services.'}
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-foreground/80 font-mono text-sm uppercase tracking-wide leading-relaxed">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative space-y-12">
                        <CornerMarkers />

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? '1. Servizio' : '1. Service'}</h2>
                            <p>{lang === 'it'
                                ? 'SENTINEXT è fornito "così com\'è" senza SLA garantiti. Possiamo modificare funzionalità e limiti operativi per mantenere il servizio stabile e sicuro.'
                                : 'SENTINEXT is provided "as is" with no guaranteed uptime SLA. We may change features and operational limits to keep the service stable and secure.'}</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? '2. Uso Consentito' : '2. Acceptable Use'}</h2>
                            <p>{lang === 'it'
                                ? 'Puoi analizzare App ID Steam per cui hai un legittimo interesse. È vietato abusare del servizio (es. automazioni aggressive o tentativi di aggirare rate limit).'
                                : 'You may analyze Steam App IDs for which you have a legitimate interest. Do not abuse the service (e.g., aggressive automation or attempts to bypass rate limits).'}</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? '3. Crediti e Piani' : '3. Credits & Plans'}</h2>
                            <p>{lang === 'it'
                                ? 'L\'uso del servizio può essere soggetto a crediti e limiti del piano. Funzioni come analisi, chat e confronti possono consumare crediti; se superi il limite, potresti dover attendere il reset o fare upgrade.'
                                : 'Service usage may be subject to credits and plan limits. Features like analysis, chat, and comparisons can consume credits; if you exceed your allowance, you may need to wait for reset or upgrade.'}</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? '4. Proprietà dei Dati' : '4. Data Ownership'}</h2>
                            <p>{lang === 'it'
                                ? 'Gli insight generati dall\'analisi rimangono di tua proprietà. Tuttavia, il testo pubblico delle recensioni Steam rimane soggetto ai termini di servizio originali di Valve Corporation.'
                                : 'Analysis insights you generate remain yours. However, public Steam review text remains subject to Valve Corporation\'s original terms of service.'}</p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? '5. Limitazioni dell’AI e Responsabilità' : '5. AI Limitations & Liability'}</h2>
                            <p>{lang === 'it'
                                ? 'L\'AI può sbagliare. Verifica sempre le citazioni di evidenza prima di prendere decisioni. SENTINEXT non è responsabile per decisioni aziendali basate esclusivamente su output AI.'
                                : 'AI can be wrong. Always verify evidence quotes before making decisions. SENTINEXT is not responsible for business decisions made solely based on AI output.'}</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
