/**
 * App colour themes. FlowShow's buttons, highlights and selections use one accent colour; a theme picks it from
 * ready-made palettes (users choose a palette, not their own colours). The accent is written in the code as
 * Tailwind's "pink" scale, and a theme repaints that scale (see index.css), so nothing else needs to change.
 */
export type AppThemeId = 'blue' | 'rose' | 'violet' | 'emerald' | 'gold' | 'cyan';

/** The 11 shades of a palette (50 … 950), light to dark */
type Scale = [string, string, string, string, string, string, string, string, string, string, string];
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

/** A theme's second colour (used to pick the screen in Design mode), with the text colour that reads on it */
export interface SecondColour { bg: string; text: string }
export interface AppTheme { id: AppThemeId; name: string; description: string; scale: Scale | null; second: SecondColour }

export const APP_THEMES: AppTheme[] = [
  { id: 'blue', name: 'FlowShow Blue', description: 'The original: blue and white', scale: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'], second: { bg: '#fbbf24', text: '#1c1917' } },
  { id: 'rose', name: 'Rose', description: 'Warm pink', scale: ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724'], second: { bg: '#8b5cf6', text: '#ffffff' } },
  { id: 'violet', name: 'Violet', description: 'Deep purple', scale: ['#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'], second: { bg: '#2dd4bf', text: '#042f2e' } },
  { id: 'emerald', name: 'Emerald', description: 'Calm green', scale: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#022c22'], second: { bg: '#facc15', text: '#1c1917' } },
  { id: 'gold', name: 'Gold', description: 'Warm amber', scale: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#451a03'], second: { bg: '#3b82f6', text: '#ffffff' } },
  { id: 'cyan', name: 'Ocean', description: 'Bright cyan', scale: ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#083344'], second: { bg: '#fb7185', text: '#1c1917' } },
];
export const DEFAULT_APP_THEME: AppThemeId = 'blue';

/** Rose (the Tailwind pink scale itself), for previews */
const ROSE: Scale = ['#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#500724'];
export const themeSwatch = (t: AppTheme) => (t.scale || ROSE);

const STYLE_ID = 'flowshow-app-theme';

/** Paint the app in a theme (the accent scale is replaced; Rose leaves it as it is) */
export function applyAppTheme(id: AppThemeId | undefined) {
  const theme = APP_THEMES.find(t => t.id === id) || APP_THEMES.find(t => t.id === DEFAULT_APP_THEME)!;
  document.documentElement.dataset.appTheme = theme.id;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
  // The accent scale, and the second colour as --fs-second / --fs-second-text
  el.textContent = `:root { ${theme.scale ? theme.scale.map((hex, i) => `--color-pink-${STEPS[i]}: ${hex};`).join(' ') : ''} --fs-second: ${theme.second.bg}; --fs-second-text: ${theme.second.text}; }`;
}
