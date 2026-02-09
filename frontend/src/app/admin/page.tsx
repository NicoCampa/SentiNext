'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { PageTransition } from '@/components/PageTransition';
import { Card } from '@/components/ui/card';
import { AdminTabBar, type AdminTab } from '@/components/admin/AdminTabBar';
import { DashboardTab } from '@/components/admin/tabs/DashboardTab';
import { UsersTab } from '@/components/admin/tabs/UsersTab';
import { AnalyticsTab } from '@/components/admin/tabs/AnalyticsTab';
import { SupportTab } from '@/components/admin/tabs/SupportTab';
import { ChatSessionsTab } from '@/components/admin/tabs/ChatSessionsTab';
import { useAdminStatus } from '@/hooks/useAdminStatus';
import { useSupportNotification } from '@/contexts/SupportNotificationContext';

function mapTabParam(param: string | null): AdminTab {
  if (param === 'inbox' || param === 'support') return 'support';
  if (param === 'users') return 'users';
  if (param === 'analytics') return 'analytics';
  if (param === 'chat') return 'chat';
  return 'dashboard';
}

function AdminPageInner() {
  const { isAdmin, isLoading: isAdminLoading } = useAdminStatus();
  const { refresh: refreshNotification, adminUnreadCount } = useSupportNotification();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<AdminTab>(() =>
    mapTabParam(searchParams?.get('tab') ?? null),
  );

  // Sync tab from URL changes (e.g. clicking inbox link from nav)
  useEffect(() => {
    const tab = searchParams?.get('tab') ?? null;
    const mapped = mapTabParam(tab);
    setActiveTab(mapped);
  }, [searchParams]);

  if (isAdminLoading) {
    return (
      <AppLayout>
        <PageTransition>
          <div className="flex items-center justify-center h-screen">
            <div className="text-slate-400">Checking admin status...</div>
          </div>
        </PageTransition>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <PageTransition>
          <div className="flex items-center justify-center h-screen">
            <Card variant="glass" className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 border-2 border-red-500/30 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
              <p className="text-slate-400">You do not have admin access to view this page.</p>
            </Card>
          </div>
        </PageTransition>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageTransition>
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="text-white">Admin</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">Platform management and analytics</p>
          </div>

          {/* Tab Bar */}
          <AdminTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            supportUnreadCount={adminUnreadCount}
          />

          {/* Tab Content */}
          {activeTab === 'dashboard' && <DashboardTab isAdmin={isAdmin} />}
          {activeTab === 'users' && <UsersTab isAdmin={isAdmin} />}
          {activeTab === 'analytics' && <AnalyticsTab isAdmin={isAdmin} />}
          {activeTab === 'support' && (
            <SupportTab isAdmin={isAdmin} refreshNotification={refreshNotification} />
          )}
          {activeTab === 'chat' && <ChatSessionsTab isAdmin={isAdmin} />}
        </div>
      </PageTransition>
    </AppLayout>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}
