'use client';

import { ReactNode, useEffect, useState } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className={`transition-opacity duration-300 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {children}
    </div>
  );
}
