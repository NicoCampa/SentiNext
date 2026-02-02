import { getDictionary } from "@/lib/get-dictionary";
import Link from "next/link";
import { AlertTriangle, Terminal, Rocket } from "lucide-react";
import { CornerMarkers } from "@/components/ui/corner-markers";

export default async function GettingStartedPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang as any);

    return (
        <div className="space-y-12 pb-20">
            <section className="space-y-4">
                <h1 className="text-5xl font-bold tracking-tighter uppercase mb-4">
                    {lang === 'it' ? 'Guida Rapida' : lang === 'fr' ? 'Démarrage Rapide' : lang === 'de' ? 'Schnellstart' : 'Getting Started'}
                </h1>
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {lang === 'it'
                        ? 'Benvenuti nella SentiNext Closed Beta. Questo protocollo ti guiderà attraverso l\'inizializzazione del tuo primo agente AI e la quantificazione dell\'intelligence delle recensioni.'
                        : 'Welcome to the SentiNext Closed Beta. This protocol will guide you through initializing your first AI agent and quantifying review intelligence.'}
                </p>
            </section>

            {/* Banner */}
            <div className="relative p-8 border border-[#00F0FF]/20 bg-[#00F0FF]/5 rounded-sm flex gap-6 items-start group overflow-hidden">
                <CornerMarkers className="opacity-40" />
                <div className="p-3 bg-[#00F0FF]/10 border border-[#00F0FF]/20 rounded-sm text-[#00F0FF]">
                    <Terminal className="h-6 w-6" />
                </div>
                <div>
                    <h4 className="font-mono text-xs font-bold text-[#00F0FF] mb-2 uppercase tracking-[0.2em]">
                        {lang === 'it' ? 'Distribuzione: Cloud Ospitato' : 'Deployment: Hosted Cloud'}
                    </h4>
                    <p className="text-sm text-foreground/70 m-0 font-mono uppercase tracking-wide leading-relaxed">
                        {lang === 'it'
                            ? 'Nessun hardware locale o GPU necessaria. Il sistema opera in modalità cloud-agent autonoma.'
                            : 'No local hardware or GPU required. The system is operating in autonomous cloud-agent mode.'}
                    </p>
                </div>
                <div className="absolute -top-1 -right-1 w-24 h-24 bg-[#00F0FF]/5 blur-3xl rounded-full" />
            </div>

            <div className="space-y-16 mt-16">
                <StepSection
                    number="01"
                    title={lang === 'it' ? "Accedi alla Piattaforma" : "Access the Platform"}
                    description={lang === 'it' ? "La dashboard è il fulcro centrale per tutte le operazioni degli agenti." : "The dashboard is the central hub for all agent operations."}
                >
                    <p>
                        {lang === 'it' ? 'Naviga verso la ' : 'Navigate to the '}
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank" className="font-bold underline decoration-[#00F0FF]/30 hover:decoration-[#00F0FF]">
                            SentiNext App Dashboard
                        </Link>. {lang === 'it' ? 'Verifica la tua connessione al server sicuro su ' : 'Verify your connection to the secure server at '}
                        <code>sentinext-frontend.onrender.com</code>.
                    </p>
                </StepSection>

                <StepSection
                    number="02"
                    title={lang === 'it' ? "Inizializza Identità" : "Initialize Identity"}
                    description={lang === 'it' ? "L'autenticazione sicura è richiesta per la persistenza dei job." : "Secure authentication is required for job persistence."}
                >
                    <p>
                        {lang === 'it'
                            ? "Autenticati usando le tue credenziali da sviluppatore. Il sistema utilizza l'autenticazione gestita da Clerk per garantire la gestione crittografata della sessione e l'isolamento del progetto."
                            : "Authenticate using your developer credentials. The system uses Clerk-managed authentication to ensure encrypted session handling and project isolation."}
                    </p>
                </StepSection>

                <StepSection
                    number="03"
                    title={lang === 'it' ? "Distribuisci il Primo Agente" : "Deploy First Agent"}
                    description={lang === 'it' ? "Configura i parametri di estrazione per il tuo progetto Steam." : "Configure the extraction parameters for your Steam project."}
                >
                    <div className="grid gap-6">
                        <ul className="space-y-4 list-none p-0">
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>{lang === 'it' ? 'Clicca "Nuova Analisi"' : 'Click "New Analysis"'}</strong> {lang === 'it' ? 'nel centro di comando principale.' : 'on the main command center.'}</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>Target Steam App ID</strong>: {lang === 'it' ? 'Ad esempio, usa ' : 'For example, use '} <code>1086940</code> {lang === 'it' ? 'per la telemetria di Baldur\'s Gate 3.' : 'for Baldur\'s Gate 3 telemetry.'}</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>{lang === 'it' ? 'Seleziona "Recensioni Recenti"' : 'Select "Recent Reviews"'}</strong>: {lang === 'it' ? 'Ottimizzato per i cambiamenti di sentiment in tempo reale dopo gli aggiornamenti.' : 'Optimized for real-time sentiment shifts after updates.'}</div>
                            </li>
                            <li className="flex items-start gap-4">
                                <span className="text-[#00F0FF] font-bold font-mono">{" > "}</span>
                                <div><strong>{lang === 'it' ? 'Inizializza (Commit)' : 'Initialize (Commit)'}</strong>: {lang === 'it' ? 'Conferma i parametri e distribuisci l\'agente.' : 'Confirm parameters and deploy the agent.'}</div>
                            </li>
                        </ul>

                        <div className="p-4 bg-black/40 border border-[#00F0FF]/10 rounded-sm font-mono text-xs text-[#00F0FF]/60 flex items-center gap-3">
                            <Rocket className="h-4 w-4" />
                            <span>{lang === 'it' ? 'Sistema: Agente distribuito con successo nel cluster. ID Job: SN_ALPHA_001' : 'System: Agent successfully deployed to cluster. Job ID: SN_ALPHA_001'}</span>
                        </div>
                    </div>
                </StepSection>
            </div>
        </div>
    );
}

function StepSection({ number, title, description, children }: any) {
    return (
        <section className="space-y-6">
            <div className="flex items-center gap-6">
                <div className="text-4xl font-bold font-mono text-[#00F0FF]/20 leading-none">
                    {number}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-[#00F0FF]/20 to-transparent" />
            </div>
            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-widest uppercase m-0">{title}</h2>
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-[0.2em]">{description}</p>
                <div className="pt-4 border-l-2 border-[#00F0FF]/10 pl-8">
                    {children}
                </div>
            </div>
        </section>
    );
}
