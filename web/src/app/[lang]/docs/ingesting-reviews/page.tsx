"use client";

import { use } from "react";
import { Search, Database, ShieldCheck } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import { normalizeLocale } from "@/lib/i18n";
import type { ReactNode } from "react";

const fadeSlideUp = (delay: number): React.CSSProperties => ({
    opacity: 0,
    animation: 'fadeSlideUp 0.5s ease-out forwards',
    animationDelay: `${delay}ms`,
});

export default function IngestingReviewsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = use(params);
    const locale = normalizeLocale(lang);
    const langBars = [
        { lang: "English", pct: 45 },
        { lang: "Chinese", pct: 18 },
        { lang: "Russian", pct: 12 },
        { lang: "German", pct: 8 },
        { lang: "Other", pct: 17 },
    ];

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
                    {locale === 'it' ? 'Importazione Recensioni' : 'Review Ingestion'}
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {locale === 'it'
                        ? <>SENTINEXT recupera le recensioni Steam pubbliche per un dato <code>AppID</code> e le salva per analisi, ricerca ed esportazione.</>
                        : <>SENTINEXT fetches public Steam reviews for a given <code>AppID</code> and stores them so you can analyze, search, and export them later.</>}
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsStep
                    number="01"
                    title={locale === 'it' ? 'Recupero da Steam' : 'Fetch From Steam'}
                    icon={<Search className="h-6 w-6" />}
                    description={locale === 'it'
                        ? "Paginiamo l'endpoint delle recensioni di Steam e raccogliamo testo e metadati utili."
                        : "We paginate Steam's reviews endpoint and collect review text plus useful metadata."}
                >
                    <p>
                        {locale === 'it'
                            ? "Le recensioni vengono recuperate dall'API pubblica di Steam (non è richiesto alcun login Steam). Salviamo campi come lingua, raccomandazione, timestamp, voti utili e tempo di gioco per consentirti di filtrare e approfondire in seguito."
                            : "Reviews are pulled from the public Steam reviews API (no Steam login required). We store fields like language, recommendation, timestamps, helpful votes, and playtime so you can filter and drill down later."}
                    </p>
                </DocsStep>

                <DocsStep
                    number="02"
                    title={locale === 'it' ? 'Filtri e Sicurezza' : 'Filters & Safety'}
                    icon={<ShieldCheck className="h-6 w-6" />}
                    description={locale === 'it'
                        ? "Rate limit, deduplica e filtri opzionali mantengono le esecuzioni affidabili."
                        : "Rate limits, deduplication, and optional filters keep runs reliable."}
                >
                    <p>
                        {locale === 'it'
                            ? "Il backend supporta il recupero di recensioni recenti, aggiornate, migliori o di tutte le recensioni e può operare in più lingue. La dashboard hosted si concentra sulle recensioni recenti e mantiene limiti attivi per restare veloce e stabile."
                            : "The backend supports fetching recent, updated, best, or all reviews and can work across multiple languages. The hosted dashboard focuses on recent reviews and keeps limits in place to stay fast and stable."}
                    </p>
                </DocsStep>

                <DocsStep
                    number="03"
                    title={locale === 'it' ? 'Livello di Persistenza' : 'Persistence Layer'}
                    icon={<Database className="h-6 w-6" />}
                    description={locale === 'it'
                        ? "Archiviazione PostgreSQL per ricerca, esportazioni e analisi ripetute."
                        : "PostgreSQL storage for search, exports, and repeat analyses."}
                >
                    <p>
                        {locale === 'it'
                            ? "I dati vengono salvati in PostgreSQL insieme alle etichette AI e alle citazioni di evidenza. Se analizzi di nuovo lo stesso gioco, le etichette memorizzate possono essere riutilizzate senza richiamare il modello."
                            : "Data is persisted to PostgreSQL along with the AI labels and evidence quotes. If you analyze the same game again, cached labels can be reused instead of re-calling the model."}
                    </p>
                </DocsStep>
            </div>

            <section className="p-10 border border-[#00F0FF]/10 bg-[rgb(10,10,25)]/50 rounded-sm relative overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <h2 className="text-2xl font-bold tracking-widest uppercase mb-6">
                    {locale === 'it' ? 'Valori Predefiniti e Limiti' : 'Defaults & Limits'}
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">
                            {locale === 'it' ? 'Default Dashboard' : 'Dashboard Default'}
                        </div>
                        <div className="text-3xl font-bold font-mono">1,000 REV/RUN</div>
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] font-mono text-[#00F0FF] uppercase tracking-[0.3em]">
                            {locale === 'it' ? 'Limite Recupero Backend (Default)' : 'Backend Fetch Cap (Default)'}
                        </div>
                        <div className="text-3xl font-bold font-mono">5,000 REV</div>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="mt-8 space-y-3" style={fadeSlideUp(0)}>
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {locale === 'it' ? 'Recupero recensioni...' : 'Fetching reviews...'}
                        </div>
                        <div className="font-mono text-xs text-[#00F0FF]">74%</div>
                    </div>
                    <div className="h-2 bg-[#00F0FF]/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#00F0FF]/60 rounded-full" style={{ width: '74%' }} />
                    </div>
                </div>

                {/* Language distribution */}
                <div className="mt-8 space-y-3" style={fadeSlideUp(100)}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
                        {locale === 'it' ? 'Distribuzione Recensioni per Lingua' : 'Review Distribution by Language'}
                    </div>
                    {langBars.map((item, i) => (
                        <div key={item.lang} className="flex items-center gap-3" style={fadeSlideUp(160 + i * 80)}>
                            <div className="w-16 text-xs font-mono text-foreground/60 text-right">{item.lang}</div>
                            <div className="flex-1 h-4 bg-[#00F0FF]/10 rounded-sm overflow-hidden">
                                <div className="h-full bg-[#00F0FF]/40 rounded-sm" style={{ width: `${item.pct}%` }} />
                            </div>
                            <div className="w-10 text-xs font-mono text-[#00F0FF]/70 text-right">{item.pct}%</div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

type DocsStepProps = {
    number: string;
    title: string;
    icon: ReactNode;
    description: string;
    children: ReactNode;
};

function DocsStep({ number, title, icon, description, children }: DocsStepProps) {
    return (
        <section className="space-y-6 group">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm transition-colors group-hover:bg-[#00F0FF] group-hover:text-black">
                    {icon}
                </div>
                <h3 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
                <div className="text-sm font-mono text-[#00F0FF]/40 font-bold tracking-widest">PHASE {number}</div>
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
