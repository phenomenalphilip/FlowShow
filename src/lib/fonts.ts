/** Fonts FlowShow offers everywhere, plus the fonts installed on this computer */

export const FONT_OPTIONS = [
  { label: 'Inter (Clean Sans)', value: 'Inter, sans-serif' },
  { label: 'Montserrat (Modern Bold)', value: 'Montserrat, sans-serif' },
  { label: 'Cinzel (Majestic Serif)', value: 'Cinzel, Georgia, serif' },
  { label: 'Space Grotesk (Tech Geometric)', value: 'Space Grotesk, sans-serif' },
  { label: 'Playfair Display (Elegant Serif)', value: 'Playfair Display, serif' },
  { label: 'Bebas Neue (Heavy Condensed)', value: 'Bebas Neue, sans-serif' },
  { label: 'Oswald (Strong Headline)', value: 'Oswald, sans-serif' },
  { label: 'Outfit (Sleek Minimal)', value: 'Outfit, sans-serif' },
  { label: 'Georgia (Classic Editorial)', value: 'Georgia, serif' },
  { label: 'Plus Jakarta Sans (Crisp UI)', value: 'Plus Jakarta Sans, sans-serif' },
];

// ─── Fonts on this computer (the Local Font Access API in Chrome, Edge and FlowShow's desktop window) ───
type FontData = { family: string };
let families: string[] | null = null;
const listeners = new Set<() => void>();

export const canListLocalFonts = () => typeof window !== 'undefined' && 'queryLocalFonts' in window;
/** The font families on this computer, once they have been listed (null before) */
export const getLocalFonts = () => families;
export function subscribeLocalFonts(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** List the installed fonts. The first time, the browser asks for permission, so call this from a click. */
export async function loadLocalFonts(): Promise<string[]> {
  if (families) return families;
  const query = (window as any).queryLocalFonts as (() => Promise<FontData[]>) | undefined;
  if (!query) throw new Error("This window can't list the fonts on your computer. Choose \"Type a font name…\" instead.");
  const fonts = await query();
  families = [...new Set(fonts.map(f => f.family).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  listeners.forEach(fn => fn());
  return families;
}

/** Load the list quietly when permission was given before (no prompt) */
export async function loadLocalFontsIfAllowed(): Promise<void> {
  if (families || !canListLocalFonts()) return;
  try {
    const status = await (navigator as any).permissions?.query({ name: 'local-fonts' });
    if (status?.state === 'granted') await loadLocalFonts();
  } catch { /* not supported: the button stays */ }
}

/** The CSS font-family for an installed font, with a fallback for screens that don't have it */
export const localFontValue = (family: string) => `"${family.replace(/"/g, '').trim()}", sans-serif`;

/** A readable name for any font-family value, e.g. '"Segoe UI", sans-serif' → 'Segoe UI' */
export const fontLabel = (value: string) => {
  const known = FONT_OPTIONS.find(f => f.value === value);
  if (known) return known.label;
  return (value.split(',')[0] || value).replace(/["']/g, '').trim() || 'Default font';
};

/** The first font a font-family names (what a screen needs installed) */
export const primaryFont = (value: string | undefined) => (value || '').split(',')[0].replace(/["']/g, '').trim();
