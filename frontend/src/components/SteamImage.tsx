'use client';

import { useState } from "react";
import { getSteamImageUrl } from "@/utils/steam";

interface SteamImageProps {
  appId: number;
  variant: "capsule" | "header";
  alt: string;
  className?: string;
  fallbackIcon?: string;
}

export function SteamImage({ appId, variant, alt, className, fallbackIcon = "▶" }: SteamImageProps) {
  const [error, setError] = useState(false);

  if (error) {
    const iconSize = variant === "header" ? "text-6xl" : "text-2xl";
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800 ${className}`}>
        <span className={`${iconSize} font-bold text-slate-400`}>{fallbackIcon}</span>
      </div>
    );
  }

  return (
    <img
      src={getSteamImageUrl(appId, variant)}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}