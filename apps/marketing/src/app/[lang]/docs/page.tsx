import { getDictionary } from "@/lib/get-dictionary";
import Link from "next/link";
import { Terminal, Search, BarChart2 } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";
import type { ReactNode } from "react";

export default async function DocsIndex() {
    const dict = await getDictionary("en");

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
                    href="/en/docs/getting-started"
                />
                <DocsCard
                    icon={<Search className="h-5 w-5" />}
                    title={dict.docs.dataIngestion.title}
                    description={dict.docs.dataIngestion.description}
                    href="/en/docs/ingesting-reviews"
                />
                <DocsCard
                    icon={<BarChart2 className="h-5 w-5" />}
                    title={dict.docs.aiTaxonomy.title}
                    description={dict.docs.aiTaxonomy.description}
                    href="/en/docs/insights-and-taxonomy"
                />
            </div>

            <section className="space-y-6">
                <h2 className="text-3xl font-bold tracking-tighter uppercase">
                    Product Overview
                </h2>
                <div className="prose prose-invert max-w-none space-y-6">
                    <p>
                        SENTINEXT analyzes public Steam reviews for your game and turns them into structured insights: a consistent taxonomy, evidence quotes, and metrics to decide what to do next.
                    </p>
                    <p>
                        After you analyze a game, you can:
                    </p>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0">
                        {[
                            "See top issues and requests, backed by quotes",
                            "Explore labeled reviews and drill down into details",
                            "Ask questions via chat with charts/quotes",
                            "Compare games and export datasets/reports"
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

type DocsCardProps = {
    icon: ReactNode;
    title: string;
    description: string;
    href: string;
};

function DocsCard({ icon, title, description, href }: DocsCardProps) {
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
