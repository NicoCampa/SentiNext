"use client";

import Link from "next/link";
import { Github, Mail, Info } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export function Footer({ lang }: { lang: string }) {
    const labels: any = {
        it: {
            product: "Prodotto",
            features: "Caratteristiche",
            process: "Processo",
            pricing: "Prezzi",
            resources: "Risorse",
            docs: "Documentazione",
            faq: "FAQ",
            taxonomy: "Rif. Tassonomia",
            connect: "Contatti",
            impressum: "Impressum",
            privacy: "Privacy",
            terms: "Termini",
            desc: "Sistema autonomo di classificazione dei feedback di nuova generazione.",
            valve: "SentiNext è un protocollo autonomo di intelligence indipendente. Consumiamo la telemetria pubblica della Steam Community tramite API. Non siamo approvati, affiliati o supportati da Valve Corporation. Steam e il logo Steam sono marchi di Valve Corporation."
        },
        fr: {
            product: "Produit",
            features: "Fonctionnalités",
            process: "Processus",
            pricing: "Tarifs",
            resources: "Ressources",
            docs: "Documentation",
            faq: "FAQ",
            taxonomy: "Réf. Taxonomie",
            connect: "Contact",
            impressum: "Mentions Légales",
            privacy: "Confidentialité",
            terms: "Termes",
            desc: "Système autonome de classification des feedbacks de nouvelle génération.",
            valve: "SentiNext est un protocole d'intelligence autonome indépendant. Nous consommons la télémétrie publique de la communauté Steam via API. Nous ne sommes pas approuvés, affiliés ou soutenus par Valve Corporation. Steam et le logo Steam sont des marques de Valve Corporation."
        },
        de: {
            product: "Produkt",
            features: "Funktionen",
            process: "Prozess",
            pricing: "Preise",
            resources: "Ressourcen",
            docs: "Dokumentation",
            faq: "FAQ",
            taxonomy: "Taxonomie-Ref",
            connect: "Kontakt",
            impressum: "Impressum",
            privacy: "Datenschutz",
            terms: "Bedingungen",
            desc: "Autonomes Feedback-Klassifizierungssystem der nächsten Generation.",
            valve: "SentiNext ist ein unabhängiges autonomes Intelligenzprotokoll. Wir nutzen öffentliche Steam Community-Telemetrie über API. Wir werden nicht von der Valve Corporation unterstützt, sind nicht mit ihr verbunden und werden nicht von ihr unterstützt. Steam und das Steam-Logo sind Marken der Valve Corporation."
        },
        en: {
            product: "Product",
            features: "Features",
            process: "Process",
            pricing: "Pricing",
            resources: "Resources",
            docs: "Documentation",
            faq: "FAQ",
            taxonomy: "Taxonomy Ref",
            connect: "Connect",
            impressum: "Impressum",
            privacy: "Privacy",
            terms: "Terms",
            desc: "Next-generation autonomous feedback classification system.",
            valve: "SentiNext is an independent autonomous intelligence protocol. We consume public Steam Community telemetry via API. We are not endorsed by, affiliated with, or supported by Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation."
        }
    };

    const l = labels[lang] || labels.en;

    return (
        <footer className="border-t border-[#00F0FF]/10 bg-background py-20">
            <div className="container px-4 md:px-6 mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-16">
                    <div className="flex flex-col gap-6">
                        <Link href={`/${lang}`} className="transition-opacity hover:opacity-80">
                            <Logo />
                        </Link>
                        <p className="text-xs text-muted-foreground leading-relaxed font-mono uppercase tracking-widest opacity-60">
                            {l.desc}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">{l.product}</h4>
                        <Link href={`/${lang}/product`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.features}</Link>
                        <Link href={`/${lang}/how-it-works`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.process}</Link>
                        <Link href={`/${lang}/pricing`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.pricing}</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">{l.resources}</h4>
                        <Link href={`/${lang}/docs`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.docs}</Link>
                        <Link href={`/${lang}/docs/faq`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.faq}</Link>
                        <Link href={`/${lang}/docs/taxonomy-reference`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">{l.taxonomy}</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">{l.connect}</h4>
                        <div className="flex items-center gap-6 mt-2">
                            <Link href="https://github.com" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Github className="h-5 w-5" />
                                <span className="sr-only">GitHub</span>
                            </Link>
                            <Link href="https://x.com" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors font-bold text-lg">
                                𝕏
                            </Link>
                            <Link href="mailto:hello@sentinext.com" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Valve Disclaimer */}
                <div className="mt-16 p-4 border border-[#00F0FF]/10 bg-[#00F0FF]/5 rounded-sm flex gap-4 items-start opacity-40 hover:opacity-100 transition-opacity">
                    <Info className="h-4 w-4 text-[#00F0FF] mt-0.5" />
                    <p className="text-[9px] font-mono uppercase tracking-widest leading-relaxed">
                        {l.valve}
                    </p>
                </div>

                <div className="mt-16 border-t border-[#00F0FF]/10 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground opacity-50">
                        © {new Date().getFullYear()} SentiNext. Autonomous Review Intelligence. Based in Berlin, EU.
                    </p>
                    <div className="flex gap-8">
                        <Link href={`/${lang}/impressum`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">{l.impressum}</Link>
                        <Link href={`/${lang}/privacy`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">{l.privacy}</Link>
                        <Link href={`/${lang}/terms`} className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">{l.terms}</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
