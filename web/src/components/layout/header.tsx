"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, Globe } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/ui/logo";
import { usePathname } from "next/navigation";

export function Header({ lang }: { lang: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    const menuItems = [
        { name: lang === 'it' ? 'Prodotto' : lang === 'fr' ? 'Produit' : lang === 'de' ? 'Produkt' : 'Product', href: `/${lang}/product` },
        { name: lang === 'it' ? 'Processo' : lang === 'fr' ? 'Processus' : lang === 'de' ? 'Prozess' : 'Process', href: `/${lang}/how-it-works` },
        { name: lang === 'it' ? 'Prezzi' : lang === 'fr' ? 'Tarifs' : lang === 'de' ? 'Preise' : 'Pricing', href: `/${lang}/pricing` },
        { name: lang === 'it' ? 'Documentazione' : lang === 'fr' ? 'Docs' : lang === 'de' ? 'Doku' : 'Docs', href: `/${lang}/docs` },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="container mx-auto flex h-20 items-center justify-between px-4 md:px-6">
                <Link href={`/${lang}`} className="transition-opacity hover:opacity-80">
                    <Logo />
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    {menuItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-[#00F0FF]"
                        >
                            {item.name}
                        </Link>
                    ))}
                </nav>

                {/* Desktop Actions */}
                <div className="hidden md:flex items-center gap-6">
                    <LanguageSwitcher currentLang={lang} pathname={pathname} />

                    <Button asChild className="h-11 px-8 bg-transparent border border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-widest text-[10px] shadow-[0_0_15px_rgba(0,240,255,0.1)] rounded-sm">
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                            {lang === 'it' ? 'Accedi alla Dashboard' : lang === 'fr' ? 'Connexion Dashboard' : lang === 'de' ? 'Dashboard Login' : 'Log in to Dashboard'}
                        </Link>
                    </Button>
                </div>

                {/* Mobile Menu Toggle */}
                <div className="flex items-center gap-4 md:hidden">
                    <LanguageSwitcher currentLang={lang} pathname={pathname} />
                    <button className="p-2 text-muted-foreground hover:text-foreground" onClick={() => setIsOpen(!isOpen)}>
                        <Menu className="h-6 w-6" />
                    </button>
                </div>
            </div>

            {/* Mobile Nav */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden border-b border-border/40 bg-background"
                    >
                        <div className="container flex flex-col gap-4 p-4">
                            {menuItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className="text-sm font-medium text-foreground uppercase tracking-widest"
                                    onClick={() => setIsOpen(false)}
                                >
                                    {item.name}
                                </Link>
                            ))}
                            <hr className="border-border/40" />
                            <div className="flex flex-col gap-2">
                                <Button asChild className="w-full bg-transparent border border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-widest text-xs h-12">
                                    <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                                        {lang === 'it' ? 'Accedi' : lang === 'fr' ? 'Connexion' : lang === 'de' ? 'Login' : 'Log in'}
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}

function LanguageSwitcher({ currentLang, pathname }: { currentLang: string, pathname: string }) {
    const languages = [
        { code: 'en', label: 'EN' },
        { code: 'it', label: 'IT' },
        { code: 'fr', label: 'FR' },
        { code: 'de', label: 'DE' },
    ];

    const redirectedPathname = (locale: string) => {
        if (!pathname) return "/";
        const segments = pathname.split("/");
        segments[1] = locale;
        return segments.join("/");
    };

    return (
        <div className="flex items-center gap-3">
            <Globe className="h-3 w-3 text-[#00F0FF]/40" />
            <div className="flex gap-2">
                {languages.map((lang) => (
                    <Link
                        key={lang.code}
                        href={redirectedPathname(lang.code)}
                        className={cn(
                            "text-[10px] font-bold transition-colors hover:text-[#00F0FF]",
                            currentLang === lang.code ? "text-[#00F0FF]" : "text-muted-foreground/60"
                        )}
                    >
                        {lang.label}
                    </Link>
                ))}
            </div>
        </div>
    );
}
