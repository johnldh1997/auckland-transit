import { useEffect, useState } from 'react';

// Ticks down the seconds remaining until syncedAt + periodMs — used to show "Updates in Ns"
// next to data that's refetched on its own poll interval, so it's clear the number on
// screen isn't stuck, just waiting for the next scheduled fetch. Takes syncedAt (the
// timestamp the relevant poll last actually fired) rather than owning its own reset/timer:
// an independently-owned timer here previously drifted out of phase with the poll it was
// meant to describe (e.g. a vehicle's on-map position refreshing on one interval while this
// counted down on an unrelated one, so the marker visibly moved before the count hit 0) —
// keying off the same timestamp the poll itself stamps keeps the two in sync by construction.
export function useCountdown(periodMs: number, syncedAt: number): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return Math.max(0, Math.ceil((syncedAt + periodMs - Date.now()) / 1000));
}
