'use client';

export type AdminTab = 'dashboard' | 'users' | 'analytics' | 'support' | 'chat';

interface AdminTabBarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  supportUnreadCount?: number;
}

const TABS: { key: AdminTab; label: string; mobileLabel?: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'users', label: 'Users' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'support', label: 'Support', mobileLabel: 'Support' },
  { key: 'chat', label: 'Chat Sessions', mobileLabel: 'Chat' },
];

export function AdminTabBar({ activeTab, onTabChange, supportUnreadCount = 0 }: AdminTabBarProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
            activeTab === tab.key
              ? 'border-b-2 border-cyan-400 text-cyan-300'
              : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.mobileLabel ?? tab.label}</span>
          {tab.key === 'support' && supportUnreadCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(255,0,128)] px-1 text-[9px] font-medium text-white">
              {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
