'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  grantCredits,
  fetchUserSubscriptions,
  updateUserTier,
  type UserSubscriptionInfo,
} from '@/lib/api';

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  indie: 'Indie',
  max: 'Enterprise',
};

interface UsersTabProps {
  isAdmin: boolean;
}

export function UsersTab({ isAdmin }: UsersTabProps) {
  // Credits management state
  const [creditUserId, setCreditUserId] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [grantingCredits, setGrantingCredits] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  // User subscriptions state
  const [users, setUsers] = useState<UserSubscriptionInfo[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [updatingTier, setUpdatingTier] = useState<string | null>(null);
  const [tierUpdateSuccess, setTierUpdateSuccess] = useState<string | null>(null);
  const [tierUpdateError, setTierUpdateError] = useState<string | null>(null);

  async function loadUserSubscriptions() {
    if (!isAdmin) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const data = await fetchUserSubscriptions(100);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load user subscriptions:', err);
      setUsersError((err as Error).message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUserSubscriptions();
  }, [isAdmin]);

  async function handleGrantCredits(e: React.FormEvent) {
    e.preventDefault();
    setGrantingCredits(true);
    setGrantSuccess(null);
    setGrantError(null);

    try {
      const amount = parseInt(creditAmount, 10);
      if (!creditUserId || !amount || !creditReason) {
        setGrantError('All fields are required');
        return;
      }
      if (amount === 0 || amount < -100000 || amount > 100000) {
        setGrantError('Amount must be between -100,000 and 100,000 (non-zero)');
        return;
      }

      const result = await grantCredits({
        user_id: creditUserId,
        amount,
        reason: creditReason,
      });

      const action = amount < 0 ? 'deducted' : 'granted';
      setGrantSuccess(
        `Successfully ${action} ${Math.abs(result.amount_granted)} credits. New balance: ${result.new_balance}`,
      );
      setCreditUserId('');
      setCreditAmount('');
      setCreditReason('');
    } catch (err) {
      console.error('Failed to grant credits:', err);
      setGrantError((err as Error).message || 'Failed to grant credits');
    } finally {
      setGrantingCredits(false);
    }
  }

  async function handleUpdateTier(userId: string, newTier: 'free' | 'indie' | 'pro' | 'max') {
    setUpdatingTier(userId);
    setTierUpdateSuccess(null);
    setTierUpdateError(null);

    try {
      const result = await updateUserTier({ user_id: userId, tier: newTier });
      setTierUpdateSuccess(
        `Updated ${userId.slice(0, 12)}... to ${result.tier}. New limit: ${result.credits_monthly_limit}`,
      );
      await loadUserSubscriptions();
    } catch (err) {
      console.error('Failed to update tier:', err);
      setTierUpdateError((err as Error).message || 'Failed to update tier');
    } finally {
      setUpdatingTier(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Credits Management */}
      <Card variant="glass" className="p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Manage Credits</h2>
        <form onSubmit={handleGrantCredits} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">User ID</label>
              <input
                type="text"
                value={creditUserId}
                onChange={(e) => setCreditUserId(e.target.value)}
                placeholder="user_xxx"
                className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                disabled={grantingCredits}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount</label>
              <input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="1000"
                min="-100000"
                max="100000"
                className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                disabled={grantingCredits}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Reason</label>
              <input
                type="text"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="bonus"
                className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                disabled={grantingCredits}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {grantSuccess && <p className="text-xs text-green-400">{grantSuccess}</p>}
              {grantError && <p className="text-xs text-red-400">{grantError}</p>}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={grantingCredits || !creditUserId || !creditAmount || !creditReason}
            >
              {grantingCredits ? 'Processing...' : 'Submit'}
            </Button>
          </div>
        </form>
      </Card>

      {/* User Subscriptions */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">User Subscriptions</h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={loadUserSubscriptions}
            disabled={loadingUsers}
          >
            {loadingUsers ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {tierUpdateSuccess && (
          <div className="mb-3 p-2 bg-green-500/20 border border-green-500/30 rounded text-xs text-green-400">
            {tierUpdateSuccess}
          </div>
        )}

        {tierUpdateError && (
          <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400">
            {tierUpdateError}
          </div>
        )}

        {loadingUsers ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white/5 rounded" />
            ))}
          </div>
        ) : usersError ? (
          <p className="text-xs text-red-400">{usersError}</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-slate-500">No users found</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {users.map((user) => (
              <div
                key={user.user_id}
                className="p-3 bg-slate-950/40 border border-white/10 rounded-lg"
              >
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center">
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-slate-300 truncate">
                      {user.user_id}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Balance: {user.credits_balance.toLocaleString()} | Used:{' '}
                      {user.credits_used_this_period.toLocaleString()}/
                      {user.credits_monthly_limit.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {(['free', 'indie', 'pro', 'max'] as const).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => handleUpdateTier(user.user_id, tier)}
                        disabled={updatingTier === user.user_id || user.tier === tier}
                        className={`flex-1 px-2 py-1 text-xs font-medium rounded transition ${
                          user.tier === tier
                            ? tier === 'free'
                              ? 'bg-slate-600 text-white border border-slate-500'
                              : tier === 'indie'
                                ? 'bg-emerald-600 text-white border border-emerald-500'
                                : tier === 'pro'
                                  ? 'bg-sky-600 text-white border border-sky-500'
                                  : 'bg-purple-600 text-white border border-purple-500'
                            : 'bg-slate-900/50 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {TIER_LABELS[tier] ?? tier}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500">
                    {user.updated_at
                      ? new Date(user.updated_at).toLocaleDateString()
                      : 'Never'}
                  </div>
                  {updatingTier === user.user_id && (
                    <div className="text-xs text-amber-400">Updating...</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
