import { getDictionary } from "@/lib/get-dictionary";
import Link from "next/link";
import { ArrowRight, Terminal, Search, BarChart2 } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default async function DocsIndex({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">{dict.docs.title}</h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {dict.docs.subtitle}
                </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-12">
                <DocsCard
                    icon={<Terminal className="h-5 w-5" />}
                    title={dict.docs.quickStart.title}
                    description={dict.docs.quickStart.description}
                    href={`/${lang}/docs/getting-started`}
                />
                <DocsCard
                    icon={<Search className="h-5 w-5" />}
                    title={dict.docs.dataIngestion.title}
                    description={dict.docs.dataIngestion.description}
                    href={`/${lang}/docs/ingesting-reviews`}
                />
                <DocsCard
                    icon={<BarChart2 className="h-5 w-5" />}
                    title={dict.docs.aiTaxonomy.title}
                    description={dict.docs.aiTaxonomy.description}
                    href={`/${lang}/docs/insights-and-taxonomy`}
                />
            </div>

            <section className="space-y-6">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">
                    {lang === 'it' ? 'Panoramica Protocollo' : lang === 'fr' ? 'Aperçu du Protocole' : lang === 'de' ? 'Protokoll-Übersicht' : 'Protocol Overview'}
                </h2>
                <div className="prose prose-invert max-w-none space-y-6">
                    <p>
                        {lang === 'it'
                            ? "SentiNext è un livello di intelligence ad alta precisione per il loop di feedback del tuo gioco. Supera il rumore dei punteggi medi delle recensioni per estrarre insight specifici e quantificati."
                            : "SentiNext is a high-precision intelligence layer for your game's feedback loop. It bypasses the noise of aggregate review scores to extract specific, quantified insights."}
                    </p>
                    <p>
                        {lang === 'it'
                            ? "Distribuendo agenti autonomi nella tua Steam community, ottieni visibilità su:"
                            : "By deploying autonomous agents to your Steam community, you gain visibility into:"}
                    </p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0">
                        {[
                            lang === 'it' ? "Correlazione problemi tecnici con il tempo di gioco" : "Technical issue correlation with playtime",
                            lang === 'it' ? "Scoring dell'impatto delle richieste di feature" : "Feature request impact scoring",
                            lang === 'it' ? "Analisi del sentiment post-patch" : "Post-patch sentiment drift analysis",
                            lang === 'it' ? "Mappatura tassonomica supportata da evidenze" : "Evidence-backed taxonomy mapping"
                        ].map((item, i) => (
                            <li key={i} className="flex items-center gap-3 p-4 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm m-0">
                                <span className="text-[#00F0FF] font-mono font-bold">{" >> "}</span>
                                <span className="text-sm font-mono uppercase tracking-wide opacity-80">{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}

function DocsCard({ icon, title, description, href }: any) {
    return (
        <Link href={href} className="group relative block h-full no-underline">
            <div className="h-full p-8 border border-[#00F0FF]/10 bg-[#00F0FF]/5 hover:bg-[#00F0FF]/10 transition-all rounded-sm overflow-hidden">
                <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="mb-6 p-3 w-fit bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm group-hover:bg-[#00F0FF] group-hover:text-black transition-all">
                    {icon}
                </div>
                <h3 className="text-lg font-bold mb-3 tracking-widest uppercase flex items-center gap-2 group-hover:text-[#00F0FF] transition-colors">
                    {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed no-underline opacity-70 font-mono uppercase tracking-wider">{description}</p>
            </div>
        </Link>
    )
}
