"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, Terminal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/ui/logo";

export function Header() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="container mx-auto flex h-20 items-center justify-between px-4 md:px-6">
                <Link href="/" className="transition-opacity hover:opacity-80">
                    <Logo />
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8">
                    <Link href="/product" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-[#00F0FF]">
                        Product
                    </Link>
                    <Link href="/how-it-works" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-[#00F0FF]">
                        How it Works
                    </Link>
                    <Link href="/pricing" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-[#00F0FF]">
                        Pricing
                    </Link>
                    <Link href="/docs" className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-[#00F0FF]">
                        Docs
                    </Link>
                </nav>

                {/* Desktop Actions */}
                <div className="hidden md:flex items-center gap-6">
                    <Button variant="ghost" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]" asChild>
                        <Link href="https://sentinext-frontend.onrender.com" target="_blank" rel="noopener noreferrer">
                            Log in
                        </Link>
                    </Button>
                    <Button asChild className="h-11 px-8 bg-transparent border border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 font-bold uppercase tracking-widest text-[10px] shadow-[0_0_15px_rgba(0,240,255,0.1)] rounded-sm">
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                            Entering System...
                        </Link>
                    </Button>
                </div>

                {/* Mobile Menu Toggle */}
                <button className="md:hidden p-2 text-muted-foreground hover:text-foreground" onClick={() => setIsOpen(!isOpen)}>
                    <Menu className="h-6 w-6" />
                </button>
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
                            <Link href="/product" className="text-sm font-medium text-foreground" onClick={() => setIsOpen(false)}>
                                Product
                            </Link>
                            <Link href="/how-it-works" className="text-sm font-medium text-foreground" onClick={() => setIsOpen(false)}>
                                How it Works
                            </Link>
                            <Link href="/pricing" className="text-sm font-medium text-foreground" onClick={() => setIsOpen(false)}>
                                Pricing
                            </Link>
                            <Link href="/docs" className="text-sm font-medium text-foreground" onClick={() => setIsOpen(false)}>
                                Docs
                            </Link>
                            <hr className="border-border/40" />
                            <div className="flex flex-col gap-2">
                                <Button variant="ghost" className="justify-start px-0" asChild>
                                    <Link href="https://sentinext-frontend.onrender.com" target="_blank" rel="noopener noreferrer">
                                        Log in
                                    </Link>
                                </Button>
                                <Button asChild className="w-full bg-primary text-primary-foreground">
                                    <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                                        Open SentiNext
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
