"use client";

import { cn } from "@/lib/utils";

export function CornerMarkers({ className }: { className?: string }) {
    return (
        <>
            <div className={cn("corner-marker corner-tl", className)} />
            <div className={cn("corner-marker corner-tr", className)} />
            <div className={cn("corner-marker corner-bl", className)} />
            <div className={cn("corner-marker corner-br", className)} />
        </>
    );
}
