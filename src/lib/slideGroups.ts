// Song sections ("Verse 1", "Chorus", "Bridge"…) that slides can be grouped into.

export const GROUP_PRESETS = ['Verse 1', 'Verse 2', 'Verse 3', 'Verse 4', 'Pre-Chorus', 'Chorus', 'Bridge', 'Tag', 'Intro', 'Outro'];

export type GroupKind = 'verse' | 'chorus' | 'pre-chorus' | 'bridge' | 'tag' | 'intro' | 'outro' | 'other';

export const groupKind = (group: string): GroupKind => {
  const g = group.trim().toLowerCase();
  if (g.startsWith('pre')) return 'pre-chorus';
  if (g.startsWith('verse')) return 'verse';
  if (g.startsWith('chorus') || g.startsWith('refrain')) return 'chorus';
  if (g.startsWith('bridge')) return 'bridge';
  if (g.startsWith('tag') || g.startsWith('vamp')) return 'tag';
  if (g.startsWith('intro')) return 'intro';
  if (g.startsWith('outro') || g.startsWith('ending')) return 'outro';
  return 'other';
};

/** Tailwind classes for a group's label: text colour, soft background, and a solid dot */
export const GROUP_COLORS: Record<GroupKind, { text: string; bg: string; dot: string }> = {
  verse: { text: 'text-sky-300', bg: 'bg-sky-500/15', dot: 'bg-sky-400' },
  chorus: { text: 'text-pink-300', bg: 'bg-pink-500/15', dot: 'bg-pink-400' },
  'pre-chorus': { text: 'text-orange-300', bg: 'bg-orange-500/15', dot: 'bg-orange-400' },
  bridge: { text: 'text-violet-300', bg: 'bg-violet-500/15', dot: 'bg-violet-400' },
  tag: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', dot: 'bg-emerald-400' },
  intro: { text: 'text-neutral-300', bg: 'bg-white/10', dot: 'bg-neutral-400' },
  outro: { text: 'text-neutral-300', bg: 'bg-white/10', dot: 'bg-neutral-400' },
  other: { text: 'text-amber-200', bg: 'bg-amber-500/10', dot: 'bg-amber-300' },
};

export const groupColors = (group: string) => GROUP_COLORS[groupKind(group)];

// A first line that is only a section label, e.g. "[Chorus]", "Verse 2:", "(Bridge)"
const LABEL_RE = /^\s*[[(]?\s*(verse|chorus|pre[\s-]?chorus|refrain|bridge|tag|intro|outro|ending|interlude|vamp)\s*(\d+)?\s*[\])]?\s*:?\s*$/i;

const prettyLabel = (word: string, num?: string) => {
  const w = word.toLowerCase().replace(/[\s-]+/g, '');
  const base = w.startsWith('pre') ? 'Pre-Chorus' : w.charAt(0).toUpperCase() + w.slice(1);
  return num ? `${base} ${num}` : base;
};

const sectionLabelOf = (text: string) => {
  const m = text.split('\n')[0].match(LABEL_RE);
  return m ? prettyLabel(m[1], m[2]) : undefined;
};

const normalise = (text: string) =>
  text.toLowerCase().replace(/[.,;:!?'"()[\]\-–—]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Suggest a group for each slide of a song.
 * 1. Section labels written in the lyrics ("[Chorus]", "Verse 2:") name their slide and the slides after it.
 * 2. Without labels: lyrics that appear more than once are the Chorus, and each run of other slides
 *    between choruses becomes the next verse (Verse 1, Verse 2…).
 */
export function detectGroups(texts: string[]): (string | undefined)[] {
  if (texts.some(t => sectionLabelOf(t))) {
    let current: string | undefined;
    return texts.map(t => (current = sectionLabelOf(t) ?? current));
  }
  const counts = new Map<string, number>();
  texts.forEach(t => {
    const key = normalise(t);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  let verse = 0;
  let inVerse = false;
  return texts.map(t => {
    const key = normalise(t);
    if (key && (counts.get(key) || 0) > 1) {
      inVerse = false;
      return 'Chorus';
    }
    if (!inVerse) { verse++; inVerse = true; }
    return `Verse ${verse}`;
  });
}
