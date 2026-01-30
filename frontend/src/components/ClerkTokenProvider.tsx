'use client';

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setAuthTokenFetcher } from "@/lib/api";

export function ClerkTokenProvider() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenFetcher(null);
      return;
    }

    setAuthTokenFetcher(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });

    return () => {
      setAuthTokenFetcher(null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  return null;
}
