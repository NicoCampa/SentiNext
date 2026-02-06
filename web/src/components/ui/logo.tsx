"use client";

import { cn } from "@/lib/utils";

export function Logo({ className, textClassName }: { className?: string, textClassName?: string }) {
    return (
        <div className={cn("flex items-center gap-3 group", className)}>
            <div className="relative w-10 h-10 flex items-center justify-center font-bold text-lg border border-[#00F0FF]/40 rounded-sm">
                {/* Corner decorations — cyan top, magenta bottom */}
                <div className="absolute -top-[2px] -left-[2px] w-2 h-2 border-t border-l border-[#00F0FF]" />
                <div className="absolute -top-[2px] -right-[2px] w-2 h-2 border-t border-r border-[#00F0FF]" />
                <div className="absolute -bottom-[2px] -left-[2px] w-2 h-2 border-b border-l border-[#FF0080]" />
                <div className="absolute -bottom-[2px] -right-[2px] w-2 h-2 border-b border-r border-[#FF0080]" />
                <span className="text-white font-bold tracking-tighter">SN</span>
            </div>
            <span className={cn("font-bold tracking-widest text-xl uppercase text-foreground group-hover:text-[#00F0FF] transition-colors", textClassName)}>
                SENTINEXT
            </span>
        </div>
    );
}
