import type { LegProgress } from './legProgress';

// --- Get-off Alert (stop-based, GPS with schedule fallback) ---
// The pure decision rules behind the get-off alert, kept free of any Expo/storage dependency so
// they can be exercised directly. Two cues per transit leg: 'next' — the next stop is where you
// get off — and 'now' — you're at it. They're decided from where the rider actually is relative
// to the leg's own stops, not from the scheduled arrival time: buses run minutes early or late,
// and a fixed "N minutes before scheduled arrival" fired far too early on late buses and too late
// (or never) on early ones. journeyNotification.ts supplies the inputs and fires the alerts.
export type AlightStage = 'next' | 'now';

// How far from the leg's own path a rider can be and still count as riding it.
export const ON_LEG_MAX_METERS = 150;

// Used only when a leg's stop list isn't available (its stops aren't in the bundled timetable):
// straight-line distance to the alighting stop instead.
const NEXT_STOP_FALLBACK_METERS = 500;
const AT_STOP_FALLBACK_METERS = 100;

// Used only with no usable GPS: minutes before the scheduled arrival for each cue, and how long
// after it the cue may still fire (a slightly late bus).
const SCHEDULE_NEXT_MINUTES = 2;
const SCHEDULE_NOW_MINUTES = 0.5;
const SCHEDULE_GRACE_MINUTES = 1;

// From a rider's progress along a leg whose stops are known.
export function stageFromProgress(progress: LegProgress, stopCount: number): AlightStage | null {
  if (progress.offRouteMeters > ON_LEG_MAX_METERS) return null;
  if (progress.nextIndex >= stopCount) return 'now';
  if (progress.nextIndex === stopCount - 1) return 'next';
  return null;
}

// From straight-line distance to the alighting stop, when there's no stop list to go on.
export function stageFromDistance(metersToAlightStop: number): AlightStage | null {
  if (metersToAlightStop <= AT_STOP_FALLBACK_METERS) return 'now';
  if (metersToAlightStop <= NEXT_STOP_FALLBACK_METERS) return 'next';
  return null;
}

// From the scheduled arrival alone — the fallback when there's no GPS (underground, tunnels).
export function stageFromSchedule(arrivalTimestamp: string | undefined, now: Date): AlightStage | null {
  if (!arrivalTimestamp) return null;
  const minutesToArrival = (new Date(arrivalTimestamp).getTime() - now.getTime()) / 60_000;
  if (minutesToArrival < -SCHEDULE_GRACE_MINUTES) return null;
  if (minutesToArrival <= SCHEDULE_NOW_MINUTES) return 'now';
  if (minutesToArrival <= SCHEDULE_NEXT_MINUTES) return 'next';
  return null;
}
