"use client";

import Link from "next/link";
import { Github, Mail, Info, Linkedin } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import type { SupportedLocale } from "@/lib/i18n";

type FooterLabels = {
    product: string;
    features: string;
    process: string;
    pricing: string;
    resources: string;
    docs: string;
    faq: string;
    taxonomy: string;
    connect: string;
    impressum: string;
    privacy: string;
    terms: string;
    desc: string;
    valve: string;
};

const labels: Record<SupportedLocale, FooterLabels> = {
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
            desc: "Intelligence delle recensioni Steam per team di gioco.",
            valve: "SentiNext è uno strumento indipendente che analizza recensioni Steam pubbliche tramite le API di Steam. Non siamo approvati, affiliati o supportati da Valve Corporation. Steam e il logo Steam sono marchi di Valve Corporation."
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
            desc: "Intelligence des avis Steam pour équipes de jeu.",
            valve: "SentiNext est un outil indépendant qui analyse des avis Steam publics via les API de Steam. Nous ne sommes pas approuvés, affiliés ou soutenus par Valve Corporation. Steam et le logo Steam sont des marques de Valve Corporation."
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
            desc: "Steam-Review-Intelligence für Game-Teams.",
            valve: "SentiNext ist ein unabhängiges Tool, das öffentliche Steam-Reviews über Steam-APIs analysiert. Wir sind nicht von Valve Corporation unterstützt oder mit ihr verbunden. Steam und das Steam-Logo sind Marken der Valve Corporation."
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
            desc: "Steam review intelligence for game teams.",
            valve: "SentiNext is an independent tool that analyzes public Steam reviews via Steam APIs. We are not endorsed by, affiliated with, or supported by Valve Corporation. Steam and the Steam logo are trademarks of Valve Corporation."
        }
};

export function Footer({ lang }: { lang: SupportedLocale }) {
    const l = labels[lang];

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
                            <Link href="https://github.com/NicoCampa/SentiNext" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Github className="h-5 w-5" />
                                <span className="sr-only">GitHub</span>
                            </Link>
                            <Link href="https://x.com/NicoGrigio" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors font-bold text-lg">
                                𝕏
                            </Link>
                            <Link href="https://www.linkedin.com/in/nicolo-campagnoli" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Linkedin className="h-5 w-5" />
                                <span className="sr-only">LinkedIn</span>
                            </Link>
                            <Link href="mailto:nicolocampagnoli20@icloud.com" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
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
                        © {new Date().getFullYear()} SentiNext. Steam Review Intelligence. Based in Berlin, EU.
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
