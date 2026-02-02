import Link from "next/link";
import { Github, Twitter, Mail } from "lucide-react";
import { Logo } from "@/components/ui/logo";

export function Footer() {
    return (
        <footer className="border-t border-[#00F0FF]/10 bg-background py-20">
            <div className="container px-4 md:px-6 mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-16">
                    <div className="flex flex-col gap-6">
                        <Link href="/" className="transition-opacity hover:opacity-80">
                            <Logo />
                        </Link>
                        <p className="text-xs text-muted-foreground leading-relaxed font-mono uppercase tracking-widest opacity-60">
                            Next-generation autonomous feedback classification system.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Product</h4>
                        <Link href="/product" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Features</Link>
                        <Link href="/how-it-works" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Process</Link>
                        <Link href="/pricing" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Pricing</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Resources</h4>
                        <Link href="/docs" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">Documentation</Link>
                        <Link href="/docs/faq" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF] transition-colors">FAQ</Link>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00F0FF]">Connect</h4>
                        <div className="flex items-center gap-6 mt-2">
                            <Link href="https://github.com" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Github className="h-5 w-5" />
                                <span className="sr-only">GitHub</span>
                            </Link>
                            <Link href="https://twitter.com" target="_blank" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Twitter className="h-5 w-5" />
                                <span className="sr-only">Twitter</span>
                            </Link>
                            <Link href="mailto:hello@sentinext.com" className="text-muted-foreground hover:text-[#00F0FF] transition-colors">
                                <Mail className="h-5 w-5" />
                                <span className="sr-only">Email</span>
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mt-20 border-t border-[#00F0FF]/10 pt-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground opacity-50">
                        © {new Date().getFullYear()} SentiNext. Autonomous Review Intelligence.
                    </p>
                    <div className="flex gap-8">
                        <Link href="/privacy" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">Privacy</Link>
                        <Link href="/terms" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-[#00F0FF]">Terms</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
