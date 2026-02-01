"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Gamepad2, Menu } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function Header() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                <Link href="/" className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-80">
                    <Gamepad2 className="h-6 w-6 text-primary" />
                    <span>SentiNext</span>
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-6">
                    <Link href="/product" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                        Product
                    </Link>
                    <Link href="/how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                        How it Works
                    </Link>
                    <Link href="/pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                        Pricing
                    </Link>
                    <Link href="/docs" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                        Docs
                    </Link>
                </nav>

                {/* Desktop Actions */}
                <div className="hidden md:flex items-center gap-4">
                    <Button variant="ghost" className="text-muted-foreground hover:text-foreground" asChild>
                        <Link href="https://sentinext-frontend.onrender.com" target="_blank" rel="noopener noreferrer">
                            Log in
                        </Link>
                    </Button>
                    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_0_15px_-3px_var(--primary)] hover:shadow-[0_0_20px_-3px_var(--primary)] transition-all">
                        <Link href={process.env.NEXT_PUBLIC_APP_URL || "https://sentinext-frontend.onrender.com"} target="_blank">
                            Open App
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
