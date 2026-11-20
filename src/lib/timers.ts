/**
 * Countdown timers for the stage (the Timers tab runs them; a stage layout's Timer item shows them).
 * Presets are kept with the profile. One timer runs at a time: to use another, stop the running one or let it end.
 */
import { useEffect, useState } from 'react';

export interface TimerPreset { id: string; name: string; seconds: number }

/** The timer in use (running or paused). Time left = remainingMs, minus the time since startedAt while it runs. */
export interface LiveTimer {
  presetId: string;
  name: string;
  durationMs: number;
  /** When it was (re)started, or null while paused */
  startedAt: number | null;
  /** Time left at startedAt (or now, while paused) */
  remainingMs: number;
  /** TIME UP keeps flashing on the stage screen until Stop (default on) */
  flicker?: boolean;
}

export const DEFAULT_TIMER_PRESETS: TimerPreset[] = [
  { id: 'timer-countdown', name: 'Countdown', seconds: 5 * 60 },
  { id: 'timer-worship', name: 'Worship', seconds: 20 * 60 },
  { id: 'timer-sermon', name: 'Sermon', seconds: 30 * 60 },
];

export const timeLeft = (t: LiveTimer | null | undefined, now = Date.now()): number =>
  !t ? 0 : t.startedAt === null ? t.remainingMs : Math.max(0, t.remainingMs - (now - t.startedAt));
export const timerEnded = (t: LiveTimer | null | undefined, now = Date.now()) => !!t && timeLeft(t, now) <= 0;
/** A timer is in the way of starting another while it runs or is paused, until it reaches zero */
export const timerBusy = (t: LiveTimer | null | undefined, now = Date.now()) => !!t && !timerEnded(t, now);

/** 5:00, 1:02:30 */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export const formatDuration = (seconds: number) => formatClock(seconds * 1000);

/** "5", "5:30", "1:00:00", "90s" → seconds (null if it can't be read) */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?\s*s$/.test(t)) return Math.round(parseFloat(t));
  if (/^\d+(\.\d+)?\s*(m|min|mins|minutes)?$/.test(t)) return Math.round(parseFloat(t) * 60);
  const parts = t.split(':').map(p => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  return n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
}

// ─── The timer in use, shared with stage screens in this window ───
let current: LiveTimer | null = null;
const listeners = new Set<(t: LiveTimer | null) => void>();
export function setSharedTimer(t: LiveTimer | null | undefined) {
  current = t || null;
  listeners.forEach(fn => fn(current));
}
export function useSharedTimer(): LiveTimer | null {
  const [t, setT] = useState(current);
  useEffect(() => { listeners.add(setT); setT(current); return () => { listeners.delete(setT); }; }, []);
  return t;
}

/** Redraw every `ms` while `active` (for a ticking countdown) */
export function useTicker(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
  return now;
}
