'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SentiNextLogo } from '@/components/SentiNextLogo';
import { fetchHealth } from '@/lib/api';

const COSMETIC_MESSAGES = [
  '> INITIALIZING SYSTEM...',
  '> LOADING NEURAL CORE...',
];

const POLL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** True once we can resolve a real backend URL (not the Tauri `/api` fallback). */
function hasResolvedApiBase(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__SENTINEXT_API_BASE__) return true;
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return true;
  if (window.location.port === '3000') return true; // Next.js dev server
  return false;
}

export default function RootPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<string[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [bootProgress, setBootProgress] = useState(0);

  useEffect(() => {
    let active = true;

    const push = (msg: string) => {
      if (active) setMessages(prev => [...prev, msg]);
    };

    async function boot() {
      // Phase 1: cosmetic boot messages
      for (const msg of COSMETIC_MESSAGES) {
        if (!active) return;
        push(msg);
        await sleep(200);
      }

      if (!active) return;
      push('> CONNECTING TO BACKEND...');

      // Phase 2: poll backend health (no timeout — wait until it starts)
      const startedAt = Date.now();
      while (active) {
        // Check for Tauri sidecar boot error (fatal — process couldn't spawn)
        if (typeof window !== 'undefined' && window.__SENTINEXT_BACKEND_BOOT_ERROR__) {
          if (active) setError(window.__SENTINEXT_BACKEND_BOOT_ERROR__);
          return;
        }

        // Asymptotic progress: climbs toward 95% but never reaches it
        const elapsed = Date.now() - startedAt;
        if (active) setBootProgress(Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 15_000)))));

        // Wait for a real API base URL (avoids tauri://localhost/api fetch failures)
        if (!hasResolvedApiBase()) {
          await sleep(POLL_MS);
          continue;
        }

        try {
          await fetchHealth();
          if (!active) return;
          setBootProgress(100);
          push('> REVIEW ANALYSIS MODULE: ONLINE');
          await sleep(200);
          if (!active) return;
          push('> SYSTEM READY');
          setShowLogo(true);
          await sleep(500);
          if (active) router.replace('/dashboard?view=home');
          return;
        } catch {
          await sleep(POLL_MS);
        }
      }
    }

    boot();
    return () => { active = false; };
  }, [router, retryKey]);

  const handleRetry = () => {
    setError(null);
    setMessages([]);
    setShowLogo(false);
    setBootProgress(0);
    setRetryKey(k => k + 1);
  };

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
          {messages.map((message, index) => (
            <div
              key={index}
              className={
                message.includes('ONLINE') || message.includes('ACTIVE') || message.includes('READY')
                  ? 'text-[rgb(0,255,136)]'
                  : 'text-[rgb(0,255,255)]/70'
              }
            >
              {message}
              {index === messages.length - 1 && !error && (
                <span className="inline-block w-2 h-4 bg-[rgb(0,255,255)] ml-1 animate-pulse" />
              )}
            </div>
          ))}
          {!error && !showLogo && bootProgress > 0 && (
            <div className="mt-3 w-64">
              <div className="h-[2px] bg-[rgb(0,255,255)]/20 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[rgb(0,255,255)] to-[rgb(255,0,128)] transition-all duration-700 ease-out"
                  style={{ width: `${bootProgress}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-[rgb(0,255,255)]/40 font-mono tracking-wider">
                {bootProgress < 100 ? `${bootProgress}%` : 'CONNECTED'}
              </p>
            </div>
          )}
          {error && (
            <div className="mt-4 space-y-3">
              <div className="text-red-400">
                {'>'} ERROR: {error}
              </div>
              <button
                onClick={handleRetry}
                className="text-[rgb(0,255,255)] hover:text-white border border-[rgb(0,255,255)]/40 hover:border-[rgb(0,255,255)] px-3 py-1 text-xs font-mono transition-colors"
              >
                [ RETRY ]
              </button>
            </div>
          )}
        </div>

        {/* Logo */}
        <div
          className={`transition-all duration-700 ${
            showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Icon */}
          <div className="mb-6">
            <SentiNextLogo size="lg" className="mx-auto" />
          </div>

          {/* Title */}
          <h1 className="text-5xl font-bold tracking-[0.3em] mb-4">
            <span className="text-white">
              SENTINEXT
            </span>
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
