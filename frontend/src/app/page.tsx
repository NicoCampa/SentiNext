'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const BOOT_MESSAGES = [
  '> INITIALIZING SYSTEM...',
  '> LOADING NEURAL CORE...',
  '> CONNECTING TO DATA STREAMS...',
  '> SENTIMENT ANALYSIS MODULE: ONLINE',
  '> REVIEW PROCESSOR: ACTIVE',
  '> SYSTEM READY',
];

export default function RootPage() {
  const router = useRouter();
  const [bootSequence, setBootSequence] = useState<string[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (indexRef.current < BOOT_MESSAGES.length) {
        setBootSequence(prev => [...prev, BOOT_MESSAGES[indexRef.current]]);
        indexRef.current++;
      } else {
        clearInterval(interval);
        setShowLogo(true);
        setTimeout(() => {
          router.replace('/dashboard?view=home');
        }, 800);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Scan line effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1), rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)',
        }}
      />

      {/* Content */}
      <div className="text-center space-y-8 z-10 p-8">
        {/* Boot sequence terminal */}
        <div className="text-left font-mono text-xs space-y-1 mb-12 min-h-[180px]">
          {bootSequence.map((message, index) => (
            <div
              key={index}
              className={
                message.includes('ONLINE') || message.includes('ACTIVE') || message.includes('READY')
                  ? 'text-[rgb(0,255,136)]'
                  : 'text-[rgb(0,255,255)]/70'
              }
            >
              {message}
              {index === bootSequence.length - 1 && (
                <span className="inline-block w-2 h-4 bg-[rgb(0,255,255)] ml-1 animate-pulse" />
              )}
            </div>
          ))}
        </div>

        {/* Logo */}
        <div
          className={`transition-all duration-700 ${
            showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Icon */}
          <div className="mb-6">
            <div className="mx-auto w-24 h-24 border-2 border-[rgb(0,255,255)] flex items-center justify-center relative">
              {/* Corner decorations */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[rgb(0,255,255)]" />
              <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[rgb(0,255,255)]" />
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[rgb(255,0,128)]" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[rgb(255,0,128)]" />

              <span className="text-5xl text-[rgb(0,255,255)]">◆</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-5xl font-bold tracking-[0.3em] cyber-gradient-text mb-4">
            SENTINEXT
          </h1>

          {/* Subtitle */}
          <p className="text-sm uppercase tracking-[0.4em] text-[rgb(0,255,255)]/50">
            Review Intelligence System
          </p>

          {/* Loading bar */}
          <div className="mt-8 mx-auto w-64">
            <div className="h-[2px] bg-[rgb(0,255,255)]/20 overflow-hidden">
              <div className="h-full w-[30%] bg-gradient-to-r from-[rgb(0,255,255)] to-[rgb(255,0,128)] animate-loading-slide" />
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.3em] text-[rgb(0,255,255)]/40 font-mono">
              Entering System...
            </p>
          </div>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-8 left-8 w-16 h-16 border-t border-l border-[rgb(0,255,255)]/30" />
      <div className="absolute top-8 right-8 w-16 h-16 border-t border-r border-[rgb(0,255,255)]/30" />
      <div className="absolute bottom-8 left-8 w-16 h-16 border-b border-l border-[rgb(255,0,128)]/30" />
      <div className="absolute bottom-8 right-8 w-16 h-16 border-b border-r border-[rgb(255,0,128)]/30" />
    </div>
  );
}
