'use client';

import { Card } from '@/components/ui/card';

interface UsersTabProps {
  isAdmin: boolean;
}

export function UsersTab({ isAdmin }: UsersTabProps) {
  if (!isAdmin) {
    return (
      <Card variant="glass" className="p-5">
        <p className="text-sm text-slate-400">Access denied.</p>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="p-5">
      <p className="text-sm text-slate-400">
        User management is not available in this version.
      </p>
    </Card>
  );
}
