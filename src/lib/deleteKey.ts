/**
 * The Delete key, everywhere in FlowShow: each part of the app removes what is picked in it.
 * Never while typing in a text box (there Delete edits the text).
 */
import { useEffect, useRef } from 'react';

export const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Call `onDelete` when Delete is pressed (while `active`). Return true from it when something was removed. */
export function useDeleteKey(onDelete: () => boolean | void, active = true) {
  const handler = useRef(onDelete);
  handler.current = onDelete;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (handler.current()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
