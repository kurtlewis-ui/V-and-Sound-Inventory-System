'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { warmUpBackend } from '@/lib/api';

const HEARTBEAT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Pings the backend's /health endpoint every 10 minutes while a user is
 * logged in, keeping Render's free-tier from sleeping. Also silently
 * refreshes the auth token to prevent session expiry on idle tabs.
 *
 * Renders nothing — mount once at the app root.
 */
export function Heartbeat() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // Not logged in — stop pinging.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial ping on mount / login.
    warmUpBackend();

    // Keep pinging every 10 minutes.
    intervalRef.current = setInterval(() => {
      warmUpBackend();
    }, HEARTBEAT_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [accessToken]);

  return null;
}
