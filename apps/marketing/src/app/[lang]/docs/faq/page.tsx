"use client";

import { HelpCircle } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

const fadeSlideUp = (delay: number): React.CSSProperties => ({
    opacity: 0,
    animation: 'fadeSlideUp 0.5s ease-out forwards',
    animationDelay: `${delay}ms`,
});

export default function FaqPage() {
    const questions = [
        {
            q: "Is SENTINEXT affiliated with Valve/Steam?",
            a: "No. SENTINEXT is an independent open-source tool that analyzes public Steam reviews. We are not endorsed by or affiliated with Valve Corporation."
        },
        {
            q: "Do I need to connect a Steam account?",
            a: "No. SENTINEXT uses Steam's public endpoints to fetch reviews. You just search for a game or paste an App ID."
        },
        {
            q: "Can I analyze games I don't own (including competitors)?",
            a: "Yes, as long as the reviews are public on Steam. SENTINEXT is free and open-source -- there are no usage limits beyond your LLM API quota."
        },
        {
            q: "Why does analysis run in the background?",
            a: "Analysis labels many reviews and saves results and evidence quotes. It runs in the background and the dashboard shows progress; duration depends on volume and your LLM provider speed."
        },
        {
            q: "What LLM providers are supported?",
            a: "SentiNext supports xAI (Grok), Google Gemini, OpenAI, and Ollama for local models. You bring your own API key."
        },
        {
            q: "How do I deploy SentiNext?",
            a: "The recommended method is Docker Compose: clone the repo, add your API key to .env.local, and run docker compose up --build. See the Getting Started guide for details."
        },
        {
            q: "Is my data sent anywhere?",
            a: "SentiNext is self-hosted. All data stays on your infrastructure. Review text is sent to the LLM provider you configure for classification."
        }
    ];

    const stats = [
        { value: "60+", label: "Categories" },
        { value: "1,000", label: "Reviews / Run" },
        { value: "29", label: "Languages" },
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
                    Common questions about deployment, data, and using SENTINEXT.
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
