'use client';

import { useEffect, useMemo, useState } from "react";
import { getSteamImageFallbacks } from "@/utils/steam";

interface SteamImageProps {
  appId: number;
  variant: "capsule" | "header";
  alt: string;
  className?: string;
  fallbackIcon?: string;
  imageUrl?: string | null;
}

export function SteamImage({
  appId,
  variant,
  alt,
  className,
  fallbackIcon = "?",
  imageUrl,
}: SteamImageProps) {
  const [error, setError] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const fallbacks = useMemo(() => {
    const defaultFallbacks = getSteamImageFallbacks(appId, variant);
    const primary = imageUrl ? imageUrl.trim() : "";
    const combined = primary ? [primary, ...defaultFallbacks] : defaultFallbacks;
    const seen = new Set<string>();
    return combined.filter((url) => {
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [appId, imageUrl, variant]);

  useEffect(() => {
    setError(false);
    setImageIndex(0);
  }, [appId, imageUrl, variant]);

  const currentSrc = fallbacks[imageIndex];

  if (error || !currentSrc) {
    const iconSize = variant === "header" ? "text-6xl" : "text-2xl";
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800 ${className}`}>
        <span className={`${iconSize} font-bold text-slate-400`}>{fallbackIcon}</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      onLoad={(event) => {
        const img = event.currentTarget;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          if (imageIndex < fallbacks.length - 1) {
            setImageIndex((prev) => prev + 1);
          } else {
            setError(true);
          }
        }
      }}
      onError={() => {
        if (imageIndex < fallbacks.length - 1) {
          setImageIndex((prev) => prev + 1);
        } else {
          setError(true);
        }
      }}
      loading="lazy"
    />
  );
}
