"use client";

import { cn } from "@/lib/utils";

export function Logo({ className, textClassName }: { className?: string, textClassName?: string }) {
    return (
        <div className={cn("flex items-center gap-3 group", className)}>
            <div className="relative w-10 h-10 flex items-center justify-center font-bold text-lg bg-[#00F0FF]/10 border border-[#00F0FF]/40 rounded-sm">
                <span className="text-[#00F0FF] tracking-tighter shadow-[0_0_10px_rgba(0,240,255,0.5)]">SN</span>
                <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-[#00F0FF]" />
                <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-[#00F0FF]" />
            </div>
            <span className={cn("font-bold tracking-widest text-xl uppercase text-foreground group-hover:text-[#00F0FF] transition-colors", textClassName)}>
                SentiNext
            </span>
        </div>
    );
}
