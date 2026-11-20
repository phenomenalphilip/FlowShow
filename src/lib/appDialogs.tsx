/**
 * FlowShow's own dialogs, used instead of the browser's prompt / confirm / alert boxes
 * (those show the app's web address, "tauri.localhost says…", and look out of place).
 *
 *   const name = await askText('Name for the new project', 'Sunday service');   // null if cancelled
 *   if (!(await askConfirm('Delete this?', { okLabel: 'Delete', danger: true }))) return;
 *   await showMessage('No screens were found.');
 */
import React, { useEffect, useRef, useState } from 'react';

type Request =
  | { kind: 'text'; message: string; value: string; okLabel: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; okLabel: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: 'message'; message: string; resolve: () => void };

let queue: Request[] = [];
const listeners = new Set<(q: Request[]) => void>();
const push = (r: Request) => { queue = [...queue, r]; listeners.forEach(fn => fn(queue)); };
const pop = () => { queue = queue.slice(1); listeners.forEach(fn => fn(queue)); };

/** Ask for a name or other short text. Resolves to the trimmed text, or null if cancelled or left empty. */
export function askText(message: string, value = '', opts: { okLabel?: string } = {}): Promise<string | null> {
  return new Promise(resolve => push({ kind: 'text', message, value, okLabel: opts.okLabel || 'OK', resolve }));
}
/** Ask yes or no. Resolves to true for OK. */
export function askConfirm(message: string, opts: { okLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => push({ kind: 'confirm', message, okLabel: opts.okLabel || 'OK', danger: !!opts.danger, resolve }));
}
/** Tell the user something (one OK button). */
export function showMessage(message: string): Promise<void> {
  return new Promise(resolve => push({ kind: 'message', message, resolve }));
}

/** Draws the dialogs; put it once in the app */
export function AppDialogHost() {
  const [items, setItems] = useState<Request[]>(queue);
  useEffect(() => { listeners.add(setItems); return () => { listeners.delete(setItems); }; }, []);
  const current = items[0];
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!current) return;
    if (current.kind === 'text') {
      setText(current.value);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    } else {
      setTimeout(() => okRef.current?.focus(), 0);
    }
  }, [current]);
  if (!current) return null;

  const finish = (ok: boolean) => {
    pop();
    if (current.kind === 'text') { const v = text.trim(); current.resolve(ok && v ? v : null); }
    else if (current.kind === 'confirm') current.resolve(ok);
    else current.resolve();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    if (e.key === 'Enter' && current.kind === 'text') { e.preventDefault(); finish(true); }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onKeyDown={onKey}
      onPointerDown={(e) => { if (e.target === e.currentTarget && current.kind !== 'message') finish(false); }}
      role="dialog"
      aria-modal="true"
      data-app-dialog-box={current.kind}
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#18181b] shadow-2xl p-5">
        <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-line" data-app-dialog-message>{current.message}</p>
        {current.kind === 'text' && (
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-3 w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500"
            data-app-dialog-input
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          {current.kind !== 'message' && (
            <button type="button" onClick={() => finish(false)} className="px-4 py-2 rounded-lg text-sm text-neutral-300 hover:text-white hover:bg-white/5" data-app-dialog-cancel>
              Cancel
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            onClick={() => finish(true)}
            disabled={current.kind === 'text' && !text.trim()}
            className={`px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${current.kind === 'confirm' && current.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-pink-600 hover:bg-pink-500'}`}
            data-app-dialog-ok
          >
            {current.kind === 'message' ? 'OK' : current.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
