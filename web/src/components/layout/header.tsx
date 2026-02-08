"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/ui/logo";

export function Header({ lang }: { lang: string }) {
    const [isOpen, setIsOpen] = useState(false);

    const menuItems = [
        { name: 'Product', href: `/${lang}/product` },
        { name: 'Process', href: `/${lang}/how-it-works` },
        { name: 'Pricing', href: `/${lang}/pricing` },
        { name: 'Docs', href: `/${lang}/docs` },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="container mx-auto flex h-20 items-center px-4 md:px-6 relative">
                <div className="flex-1 flex justify-start">
                    <Link href={`/${lang}`} className="transition-opacity hover:opacity-80">
                        <Logo />
                    </Link>
                </div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
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
                <div className="hidden md:flex items-center justify-end gap-6 flex-1">
                    <Button asChild className="h-11 px-8 bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(0,240,255,0.3)] rounded-sm border-none">
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"} target="_blank">
                            Log in to Dashboard
                        </Link>
                    </Button>
                </div>

                {/* Mobile Menu Toggle */}
                <div className="flex items-center gap-4 md:hidden">
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
                                <Button asChild className="w-full bg-[#00F0FF] text-black hover:bg-[#00F0FF]/90 font-bold uppercase tracking-widest text-xs h-12 rounded-sm border-none shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                                    <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://app.sentinext.nicolocampagnoli.com"} target="_blank">
                                        Log in
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
