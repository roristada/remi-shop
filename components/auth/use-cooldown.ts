"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Seconds before an auth email can be requested again. Matches Supabase Auth →
 * SMTP "Minimum interval per user", which is the real server-side limit; this is UI only.
 */
export const EMAIL_RESEND_COOLDOWN_SECONDS = 60;

/** Countdown that disables a resend button. `start()` restarts it from `seconds`. */
export function useCooldown(seconds: number = EMAIL_RESEND_COOLDOWN_SECONDS, startActive = false) {
  const [endsAt, setEndsAt] = useState<number | null>(() => (startActive ? Date.now() + seconds * 1000 : null));
  const [remaining, setRemaining] = useState(startActive ? seconds : 0);

  const start = useCallback(() => {
    setEndsAt(Date.now() + seconds * 1000);
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setEndsAt(null);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return { remaining, start };
}
