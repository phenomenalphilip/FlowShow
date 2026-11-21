/**
 * The phone remote (desktop app): a phone or tablet on the same network opens FlowShow's remote page, types a PIN,
 * and can move through the slides, tap a slide or a setlist item, and clear (src-tauri/src/remote.rs serves it).
 * FlowShow publishes what it shows; the phones' commands come back as "remote-command" events.
 */
import { useEffect, useRef, useState } from 'react';
import { isTauri } from './tauriScreen';

export interface RemoteInfo { running: boolean; url: string | null; pin: string | null; phones: number }
export type RemoteCommand =
  | { kind: 'next' } | { kind: 'previous' }
  | { kind: 'clear-text' } | { kind: 'clear-background' } | { kind: 'clear-all' }
  | { kind: 'slide'; id: string }
  | { kind: 'setlist'; id: string };

const OFF: RemoteInfo = { running: false, url: null, pin: null, phones: 0 };
const call = async <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

// Whether the remote is on, shared by everything that shows it
let current: RemoteInfo = OFF;
const listeners = new Set<(i: RemoteInfo) => void>();
const set = (i: RemoteInfo) => { current = i; listeners.forEach(l => l(i)); };
/** Remembered on this computer: the remote comes back on when FlowShow starts */
const REMEMBER = 'fs-remote-on';

export async function startRemote(): Promise<RemoteInfo> {
  const info = await call<RemoteInfo>('remote_start');
  try { localStorage.setItem(REMEMBER, '1'); } catch { /* fine */ }
  published.clear(); // send everything again
  set(info);
  return info;
}
export async function stopRemote(): Promise<void> {
  await call('remote_stop');
  try { localStorage.removeItem(REMEMBER); } catch { /* fine */ }
  set(OFF);
}
export async function refreshRemote(): Promise<RemoteInfo> {
  if (!isTauri()) return OFF;
  const info = await call<RemoteInfo>('remote_info').catch(() => OFF);
  set(info);
  return info;
}

/** The remote's state; checks how many phones are connected every few seconds while `watch` */
export function useRemote(watch = false): RemoteInfo {
  const [info, setInfo] = useState(current);
  useEffect(() => { listeners.add(setInfo); return () => { listeners.delete(setInfo); }; }, []);
  useEffect(() => {
    if (!watch || !isTauri()) return;
    void refreshRemote();
    const t = window.setInterval(() => void refreshRemote(), 3000);
    return () => window.clearInterval(t);
  }, [watch]);
  return info;
}

/** FlowShow's window: turn the remote back on if it was on last time, and run the phones' commands */
export function useRemoteCommands(onCommand: (c: RemoteCommand) => void) {
  const handler = useRef(onCommand);
  handler.current = onCommand;
  useEffect(() => {
    if (!isTauri()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    import('@tauri-apps/api/event').then(({ listen }) => listen<RemoteCommand>('remote-command', (e) => handler.current(e.payload))).then(un => { if (gone) un(); else stop = un; });
    let wasOn = false;
    try { wasOn = localStorage.getItem(REMEMBER) === '1'; } catch { /* fine */ }
    if (wasOn) void startRemote().catch(() => {}); else void refreshRemote();
    return () => { gone = true; stop?.(); };
  }, []);
}

// What was last sent, so only changes go to the phones
const published = new Map<string, string>();
/** Send this part of FlowShow's state to the phones (only while the remote is on, and only when it changed) */
export function useRemotePublish(kind: 'show' | 'live' | 'setlist', data: unknown, on: boolean) {
  const json = JSON.stringify(data ?? null);
  useEffect(() => {
    if (!on || !isTauri() || published.get(kind) === json) return;
    const t = window.setTimeout(() => {
      published.set(kind, json);
      void call('remote_publish', { kind, json }).catch(() => published.delete(kind));
    }, 120);
    return () => window.clearTimeout(t);
  }, [kind, json, on]);
}
