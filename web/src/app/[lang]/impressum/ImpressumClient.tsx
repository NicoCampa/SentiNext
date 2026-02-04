"use client";

import { motion } from "framer-motion";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { SupportedLocale } from "@/lib/i18n";

export function ImpressumClient({ lang }: { lang: SupportedLocale }) {
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
                        {lang === 'it' ? 'Impressum.' : 'Impressum.'}
                    </motion.h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-mono uppercase tracking-[0.2em] opacity-60">
                        {lang === 'it' ? 'Identità legale e contatti del provider.' : 'Legal identity and provider contact information.'}
                    </p>
                </div>
            </section>

            <section className="py-24 w-full flex justify-center relative">
                <div className="container px-4 md:px-6 mx-auto relative z-10 text-foreground/80 font-mono text-sm uppercase tracking-wide leading-relaxed">
                    <div className="max-w-4xl mx-auto p-12 rounded-sm border border-[#00F0FF]/10 bg-black/40 backdrop-blur-xl relative space-y-12">
                        <CornerMarkers />

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? 'Informazioni secondo § 5 TMG' : 'Information according to § 5 TMG'}</h2>
                            <p>
                                Nicolo Campagnoli<br />
                                Berlin, Germany
                            </p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? 'Contatti' : 'Contact'}</h2>
                            <p>
                                {lang === 'it' ? 'E-mail:' : 'E-mail:'} nicolocampagnoli20@icloud.com
                            </p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? 'Responsabile Editoriale' : 'Editorial Responsibility'}</h2>
                            <p>
                                Nicolo Campagnoli<br />
                                Berlin, Germany
                            </p>
                        </div>

                        <div>
                            <h2 className="text-[#00F0FF] text-xl font-bold mb-4">{lang === 'it' ? 'Risoluzione delle Controversie UE' : 'EU Dispute Resolution'}</h2>
                            <p>{lang === 'it'
                                ? 'La Commissione Europea fornisce una piattaforma per la risoluzione delle controversie online (ODR): https://ec.europa.eu/consumers/odr/. Non siamo disposti né obbligati a partecipare a procedimenti di risoluzione delle controversie dinanzi a un collegio arbitrale dei consumatori.'
                                : 'The European Commission provides a platform for online dispute resolution (ODR): https://ec.europa.eu/consumers/odr/. We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.'}</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
