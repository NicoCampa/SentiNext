'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ComingSoonProps {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export function ComingSoon({ title, description, ctaHref = '/dashboard?view=home', ctaLabel = 'Back to dashboard' }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Card variant="glass" className="p-10 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-300">Coming soon</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
        <div className="mt-6 flex justify-center">
          <Link href={ctaHref}>
            <Button variant="secondary">{ctaLabel}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
