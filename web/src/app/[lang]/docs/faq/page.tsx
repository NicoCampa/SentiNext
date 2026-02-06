"use client";

import { use } from "react";
import { HelpCircle } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import { normalizeLocale } from "@/lib/i18n";

const fadeSlideUp = (delay: number): React.CSSProperties => ({
    opacity: 0,
    animation: 'fadeSlideUp 0.5s ease-out forwards',
    animationDelay: `${delay}ms`,
});

export default function FaqPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = use(params);
    const locale = normalizeLocale(lang);

    const questions = [
        {
            q: lang === 'it' ? "SENTINEXT è affiliato con Valve/Steam?" : "Is SENTINEXT affiliated with Valve/Steam?",
            a: lang === 'it'
                ? "No. SENTINEXT è uno strumento indipendente che analizza recensioni Steam pubbliche. Non siamo approvati o affiliati a Valve Corporation."
                : "No. SENTINEXT is an independent tool that analyzes public Steam reviews. We are not endorsed by or affiliated with Valve Corporation."
        },
        {
            q: lang === 'it' ? "Devo collegare un account Steam?" : "Do I need to connect a Steam account?",
            a: lang === 'it'
                ? "No. SENTINEXT usa endpoint pubblici di Steam per recuperare recensioni. Ti basta cercare un gioco o inserire un App ID."
                : "No. SENTINEXT uses Steam's public endpoints to fetch reviews. You just search for a game or paste an App ID."
        },
        {
            q: lang === 'it' ? "Posso analizzare giochi che non possiedo (anche concorrenti)?" : "Can I analyze games I don't own (including competitors)?",
            a: lang === 'it'
                ? "Sì, se le recensioni sono pubbliche su Steam. I crediti sono necessari per l'analisi."
                : "Yes, as long as the reviews are public on Steam. Credits are required for analysis."
        },
        {
            q: lang === 'it' ? "Perché l'analisi gira in background?" : "Why does analysis run in the background?",
            a: lang === 'it'
                ? "L'analisi etichetta molte recensioni e salva risultati e citazioni. Il job gira in background e la dashboard mostra il progresso; la durata dipende dal volume e dalla coda."
                : "Analysis labels many reviews and saves results and evidence quotes. It runs in the background and the dashboard shows progress; duration depends on volume and queue."
        },
        {
            q: lang === 'it' ? "Come funzionano i crediti?" : "How do credits work?",
            a: lang === 'it'
                ? "I crediti vengono usati per etichettare recensioni e per funzioni AI come chat, riassunti e confronti. Vedi la pagina Pricing per i limiti mensili."
                : "Credits are used to label reviews and for AI features like chat, summaries, and comparisons. See the Pricing page for monthly limits."
        }
    ];

    const stats = [
        { value: "60+", label: locale === 'it' ? "Categorie" : "Categories" },
        { value: "1,000", label: locale === 'it' ? "Recensioni / Analisi" : "Reviews / Run" },
        { value: "29", label: locale === 'it' ? "Lingue" : "Languages" },
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
                    FAQ
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {locale === 'it'
                        ? 'Domande frequenti su dati, crediti e utilizzo di SENTINEXT.'
                        : 'Common questions about data sources, credits, and using SENTINEXT.'}
                </p>
            </section>

            <div className="grid grid-cols-3 gap-4">
                {stats.map((stat, i) => (
                    <div
                        key={stat.label}
                        className="p-3 bg-[rgb(10,10,25)]/50 border border-[#00F0FF]/10 rounded-sm text-center"
                        style={fadeSlideUp(i * 80)}
                    >
                        <div className="text-2xl font-bold font-mono text-[#00F0FF]">{stat.value}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            <div className="space-y-12 mt-16 max-w-3xl">
                {questions.map((item, i) => (
                    <FaqItem
                        key={i}
                        question={item.q}
                        answer={item.a}
                    />
                ))}
            </div>
        </div>
    );
}

type FaqItemProps = {
    question: string;
    answer: string;
};

function FaqItem({ question, answer }: FaqItemProps) {
    return (
        <div className="group relative p-8 border border-[#00F0FF]/10 bg-[rgb(10,10,25)]/50 hover:bg-[rgb(10,10,25)]/70 transition-all rounded-sm overflow-hidden">
            <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex gap-6 items-start">
                <div className="p-2 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm mt-1">
                    <HelpCircle className="h-4 w-4" />
                </div>
                <div className="space-y-4">
                    <h3 className="text-xl font-bold tracking-widest uppercase group-hover:text-[#00F0FF] transition-colors">{question}</h3>
                    <p className="text-foreground/70 leading-relaxed font-light">{answer}</p>
                </div>
            </div>
        </div>
    );
}
