import { getDictionary } from "@/lib/get-dictionary";
import { HelpCircle } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default async function FaqPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    const questions = [
        {
            q: lang === 'it' ? "SentiNext è affiliato con Valve/Steam?" : "Is SentiNext affiliated with Valve/Steam?",
            a: lang === 'it'
                ? "No. SentiNext è uno strumento autonomo indipendente che consuma la telemetria pubblica della Steam Community. Operiamo come un livello di analisi ad alta precisione per gli sviluppatori, non come una filiale di Valve Corporation. Non siamo approvati o affiliati a Valve."
                : "No. SentiNext is an independent autonomous tool that consumes the public Steam Community telemetry. We operate as a high-precision analysis layer for developers, not as a branch of Valve Corporation. We are not endorsed by or affiliated with Valve."
        },
        {
            q: lang === 'it' ? "Posso analizzare la telemetria della concorrenza?" : "Can I analyze competitive telemetry?",
            a: lang === 'it'
                ? "Sì. Il sistema può inizializzare agenti per qualsiasi AppID Steam valido. Questo è un protocollo standard per il benchmarking competitivo e l'identificazione dei punti di attrito del mercato in software simili."
                : "Yes. The system can initialize agents for any valid Steam AppID. This is a standard protocol for competitive benchmarking and identifying market friction points in similar software."
        },
        {
            q: lang === 'it' ? "Perché il lavoro di analisi è in coda?" : "Why is the analysis job in queue?",
            a: lang === 'it'
                ? "L'elaborazione neurale è scalata orizzontalmente. A seconda del volume, un lavoro può richiedere 30-60 minuti per completare l'estrazione di oltre 50.000 nodi di dati. Il sistema invierà un'e-mail una volta che l'analisi è stata confermata nel database."
                : "Neural processing is horizontally scaled. Depending on volume, a job may take 30-60 minutes to complete extraction of 50,000+ data nodes. The system will dispatch an email once the analysis is committed to the database."
        },
        {
            q: lang === 'it' ? "Quando verrà abilitata la fatturazione?" : "When will billing be enabled?",
            a: lang === 'it'
                ? "Attualmente siamo in Beta Pubblica. Tutti i piani sono gratuiti durante questo periodo. Prevediamo di abilitare modelli di fatturazione basati su crediti a fine 2026. Gli utenti Beta riceveranno sconti legacy."
                : "We are currently in Public Beta. All plans are free during this period. We expect to enable credit-based billing models in Late 2026. Beta users will receive legacy discounts."
        }
    ];

    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">
                    {lang === 'it' ? 'FAQ Protocollo' : 'Protocol FAQ'}
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {lang === 'it'
                        ? 'Domande frequenti riguardanti la distribuzione degli agenti e la classificazione della telemetria.'
                        : 'Frequent queries regarding agent deployment and telemetry classification.'}
                </p>
            </section>

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

function FaqItem({ question, answer }: any) {
    return (
        <div className="group relative p-8 border border-[#00F0FF]/10 bg-[#00F0FF]/5 hover:bg-[#00F0FF]/10 transition-all rounded-sm overflow-hidden">
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
