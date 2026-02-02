'use client';

import { useState, useEffect } from 'react';
import { fetchAuthStatus, type AuthStatus } from '@/lib/api';

interface AdminStatusState {
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAdminStatus(): AdminStatusState {
  const [state, setState] = useState<AdminStatusState>({
    isAdmin: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;

    async function checkAdminStatus() {
      try {
        const status: AuthStatus = await fetchAuthStatus();
        if (active) {
          setState({
            isAdmin: status.is_admin,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (active) {
          setState({
            isAdmin: false,
            isLoading: false,
            error: (err as Error).message || 'Failed to check admin status',
          });
        }
      }
    }

    checkAdminStatus();

    return () => {
      active = false;
    };
  }, []);

  return state;
}
