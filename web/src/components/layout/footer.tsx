import Link from "next/link";
import { Gamepad2, Github, Twitter, Mail } from "lucide-react";

export function Footer() {
    return (
        <footer className="border-t border-border/40 bg-background py-12">
            <div className="container px-4 md:px-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="flex flex-col gap-4">
                        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight text-foreground">
                            <Gamepad2 className="h-5 w-5 text-primary" />
                            <span>SentiNext</span>
                        </Link>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Turn raw Steam reviews into clear, actionable product insights with AI-powered analysis.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h4 className="font-semibold text-foreground">Product</h4>
                        <Link href="/product" className="text-sm text-muted-foreground hover:text-primary transition-colors">Features</Link>
                        <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-primary transition-colors">How it Works</Link>
                        <Link href="/pricing" className="text-sm text-muted-foreground hover:text-primary transition-colors">Pricing</Link>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h4 className="font-semibold text-foreground">Resources</h4>
                        <Link href="/docs" className="text-sm text-muted-foreground hover:text-primary transition-colors">Documentation</Link>
                        <Link href="/download" className="text-sm text-muted-foreground hover:text-primary transition-colors">Download App</Link>
                        <Link href="/docs/faq" className="text-sm text-muted-foreground hover:text-primary transition-colors">FAQ</Link>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h4 className="font-semibold text-foreground">Company</h4>
                        <Link href="/contact" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact</Link>
                        <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy</Link>
                        <div className="flex items-center gap-4 mt-2">
                            <Link href="https://github.com" target="_blank" className="text-muted-foreground hover:text-foreground">
                                <Github className="h-5 w-5" />
                                <span className="sr-only">GitHub</span>
                            </Link>
                            <Link href="https://twitter.com" target="_blank" className="text-muted-foreground hover:text-foreground">
                                <Twitter className="h-5 w-5" />
                                <span className="sr-only">Twitter</span>
                            </Link>
                            <Link href="mailto:hello@sentinext.com" className="text-muted-foreground hover:text-foreground">
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-12 border-t border-border/40 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} SentiNext. All rights reserved. Not affiliated with Valve Corporation.
                    </p>
                    <div className="flex gap-4">
                        <Link href="/privacy" className="text-xs text-muted-foreground hover:underline">Privacy Policy</Link>
                        <Link href="/terms" className="text-xs text-muted-foreground hover:underline">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
