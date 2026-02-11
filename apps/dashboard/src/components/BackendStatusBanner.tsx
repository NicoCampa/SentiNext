'use client';

import { useEffect, useState } from 'react';
import { useBackendHealth } from '@/hooks/useBackendHealth';

export function BackendStatusBanner() {
  const { health } = useBackendHealth(5_000);
  const [wasOnline, setWasOnline] = useState(false);

  useEffect(() => {
    if (health.state === 'online') {
      setWasOnline(true);
    }
  }, [health.state]);

  // Don't show during initial load — the splash page handles that
  if (!wasOnline) return null;
  // Don't show when online
  if (health.state === 'online') return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-900/90 text-amber-100 text-xs px-4 py-1.5 flex items-center justify-center gap-2 backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>
      Backend offline — reconnecting...
    </div>
  );
}
