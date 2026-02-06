"use client";

import { use } from "react";
import Link from "next/link";
import { ShieldCheck, UserCheck, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { normalizeLocale } from "@/lib/i18n";
import { CornerMarkers } from "@/components/ui/corner-markers";

const fadeSlideUp = (delay: number): React.CSSProperties => ({
    opacity: 0,
    animation: 'fadeSlideUp 0.5s ease-out forwards',
    animationDelay: `${delay}ms`,
});

export default function AuthenticationPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = use(params);
    const locale = normalizeLocale(lang);

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
                    {locale === 'it' ? 'Autenticazione' : 'Authentication'}
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {locale === 'it'
                        ? 'SENTINEXT utilizza Clerk per l\'accesso. L\'autenticazione è necessaria per salvare le analisi, gestire i crediti e mantenere i dati separati per utente.'
                        : 'SENTINEXT uses Clerk for sign-in. Authentication is required to save analyses, manage credits, and keep data separated per user.'}
                </p>
            </section>

            <div className="space-y-16 mt-16">
                <DocsAuthStep
                    title={locale === 'it' ? 'Accedi con Clerk' : 'Sign In With Clerk'}
                    icon={<UserCheck className="h-6 w-6" />}
                    description={locale === 'it' ? 'Clerk gestisce sessioni e account per SENTINEXT.' : 'Clerk handles sessions and account management for SENTINEXT.'}
                >
                    <p>
                        {locale === 'it'
                            ? <>Ti autentichi tramite <Link href="https://clerk.com" target="_blank" className="text-[#00F0FF] underline decoration-[#00F0FF]/30">Clerk</Link>. Cronologia analisi, giochi salvati e utilizzo crediti sono legati al tuo account.</>
                            : <>You authenticate via <Link href="https://clerk.com" target="_blank" className="text-[#00F0FF] underline decoration-[#00F0FF]/30">Clerk</Link>. Your analysis history, saved games, and credit usage are tied to your account.</>}
                    </p>
                </DocsAuthStep>

                <DocsAuthStep
                    title={locale === 'it' ? 'Perché è Necessario Accedere' : 'Why Sign In Is Required'}
                    icon={<Lock className="h-6 w-6" />}
                    description={locale === 'it' ? 'L\'accesso abilita persistenza, esportazioni e tracciamento dell\'utilizzo.' : 'Sign-in enables persistence, exports, and usage tracking.'}
                >
                    <p>{locale === 'it' ? 'L\'autenticazione è necessaria per:' : 'Authentication is required to:'}</p>
                    <ul className="space-y-3 list-none p-0 mt-6">
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> {locale === 'it' ? 'Salvare giochi e risultati analizzati' : 'Save analyzed games and results'}
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> {locale === 'it' ? 'Tracciare crediti e abbonamenti' : 'Track credits and subscriptions'}
                        </li>
                        <li className="flex items-center gap-3 font-mono text-sm uppercase opacity-70">
                            <span className="text-[#00F0FF] font-bold">{">"}</span> {locale === 'it' ? 'Esportare dataset e generare report' : 'Export datasets and generate reports'}
                        </li>
                    </ul>
                </DocsAuthStep>

                <DocsAuthStep
                    title={locale === 'it' ? 'Sicurezza' : 'Security'}
                    icon={<ShieldCheck className="h-6 w-6" />}
                    description={locale === 'it' ? 'La dashboard gestisce i token per te.' : 'The dashboard handles tokens for you.'}
                >
                    <p>
                        {locale === 'it'
                            ? <>La dashboard web autentica automaticamente le richieste API usando la tua sessione Clerk. Se chiami l&apos;API direttamente, dovrai fornire un token <span className="text-[#00F0FF]">Bearer</span> valido da Clerk.</>
                            : <>The web dashboard automatically authenticates API requests using your Clerk session. If you call the API directly, you&apos;ll need to provide a valid <span className="text-[#00F0FF]">Bearer</span> token from Clerk.</>}
                    </p>
                </DocsAuthStep>
            </div>

            {/* Auth Flow Visual */}
            <div className="grid grid-cols-3 gap-4 mt-8">
                {[
                    {
                        step: "01",
                        label: locale === 'it' ? 'Accesso' : 'Sign In',
                        icon: <UserCheck className="h-5 w-5" />,
                        color: "border-l-emerald-500",
                        accent: "text-emerald-400",
                        delay: 0
                    },
                    {
                        step: "02",
                        label: locale === 'it' ? 'Token Sessione' : 'Session Token',
                        icon: <Lock className="h-5 w-5" />,
                        color: "border-l-cyan-500",
                        accent: "text-cyan-400",
                        delay: 100
                    },
                    {
                        step: "03",
                        label: locale === 'it' ? 'Accesso API' : 'API Access',
                        icon: <ShieldCheck className="h-5 w-5" />,
                        color: "border-l-sky-500",
                        accent: "text-sky-400",
                        delay: 200
                    },
                ].map((item) => (
                    <div
                        key={item.step}
                        className={`p-6 bg-[rgb(10,10,25)]/50 border border-[#00F0FF]/10 border-l-2 ${item.color} rounded-sm relative group`}
                        style={fadeSlideUp(item.delay)}
                    >
                        <CornerMarkers className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.3em] mb-3">
                            {locale === 'it' ? 'Passo' : 'Step'} {item.step}
                        </div>
                        <div className={`${item.accent} mb-2`}>{item.icon}</div>
                        <div className="font-bold uppercase tracking-widest text-sm">{item.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

type DocsAuthStepProps = {
    title: string;
    icon: ReactNode;
    description: string;
    children: ReactNode;
};

function DocsAuthStep({ title, icon, description, children }: DocsAuthStepProps) {
    return (
        <section className="space-y-6">
            <div className="flex items-center gap-6">
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] rounded-sm">
                    {icon}
                </div>
                <h2 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
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
