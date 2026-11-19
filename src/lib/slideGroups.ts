// Song sections ("Verse 1", "Chorus", "Bridge"…) that slides can be grouped into, and working them out from lyrics.

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

// ─── Section labels written in lyrics ─────────────────────────────────────────

/** Words people write for sections (and short forms), mapped to FlowShow's group names */
const LABEL_WORDS: [RegExp, string][] = [
  [/^(pre[\s-]?chorus|prechorus|pc|pre|lift|channel|pre[\s-]?coro|pr[ée][\s-]?refr[ãa]o)$/i, 'Pre-Chorus'],
  [/^(verse|vs|v|stanza|estrofa|verso|strophe|couplet)$/i, 'Verse'],
  [/^(chorus|ch|c|refrain|ref|hook|coro|refr[ãa]o|estribillo)$/i, 'Chorus'],
  [/^(bridge|br|b|puente|ponte|middle 8)$/i, 'Bridge'],
  [/^(tag|vamp|turnaround)$/i, 'Tag'],
  [/^(intro|introduction|introducci[óo]n)$/i, 'Intro'],
  [/^(outro|ending|end|coda|final)$/i, 'Outro'],
  [/^(interlude|instrumental|break|solo)$/i, 'Interlude'],
];

/**
 * A line that is only a section label: "[Verse 1]", "Verse 1:", "(Chorus)", "V1", "Chorus x2", "PC:".
 * Returns the group name and how many times the section repeats ("x2"), or null.
 */
export function parseSectionLabel(line: string): { group: string; repeat: number } | null {
  let s = line.trim();
  if (!s || s.length > 30) return null;
  const bracketed = /^[[({].*[\])}]$/.test(s);
  s = s.replace(/^[[({]\s*|\s*[\])}]$/g, '').replace(/:\s*$/, '').trim();
  let repeat = 1;
  const rep = s.match(/\s*(?:[xх×]\s*(\d)|(\d)\s*[xх×])\s*$/i);
  if (rep) { repeat = Number(rep[1] || rep[2]) || 1; s = s.slice(0, rep.index).trim(); }
  const m = s.match(/^([a-zà-ÿ][a-zà-ÿ\s-]*?)\s*(\d{1,2})?$/i);
  if (!m) return null;
  const word = m[1].trim();
  const num = m[2];
  // Very short forms ("v", "c", "b") only count with a number or brackets/colon, so a lyric line like "B" isn't taken
  const shortForm = word.length <= 2;
  const hadColon = /:\s*$/.test(line.trim());
  if (shortForm && !num && !bracketed && !hadColon) return null;
  const hit = LABEL_WORDS.find(([re]) => re.test(word));
  if (!hit) return null;
  const base = hit[1];
  return { group: num && base !== 'Pre-Chorus' ? `${base} ${Number(num)}` : base, repeat: Math.min(9, Math.max(1, repeat)) };
}

// ─── Comparing lyrics ─────────────────────────────────────────────────────────

const clean = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** How alike two lyrics are, 0..1, by edit distance on the cleaned words */
function similarity(a: string, b: string): number {
  const x = clean(a), y = clean(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = Math.max(x.length, y.length);
  if (Math.abs(x.length - y.length) / longer > 0.4) return 0;
  // Levenshtein over characters, two rows
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return (longer - prev[y.length]) / longer;
}

/** Most of one block's lines appear in the other (a shortened or extended repeat) */
function sharesLines(a: string, b: string): boolean {
  const la = a.split('\n').map(clean).filter(Boolean);
  const lb = new Set(b.split('\n').map(clean).filter(Boolean));
  if (la.length < 2 || lb.size < 2) return false;
  const shared = la.filter(l => lb.has(l)).length;
  return shared / Math.min(la.length, lb.size) >= 0.75;
}

const SAME_SECTION = 0.75;
const alike = (a: string, b: string) => similarity(a, b) >= SAME_SECTION || sharesLines(a, b);

/** A block that repeats its own words a lot ("Hallelujah, hallelujah…") */
function isRepetitive(text: string): boolean {
  const words = clean(text).split(' ').filter(Boolean);
  if (words.length < 6) return false;
  const counts = new Map<string, number>();
  words.forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
  const top = [...counts.values()].sort((p, q) => q - p);
  return (top[0] + (top[1] || 0)) / words.length >= 0.5;
}

// ─── Working out groups ───────────────────────────────────────────────────────

/**
 * Suggest a group for each unit (a stanza, or a slide of an existing song).
 *  1. Labels written in the lyrics name their unit and the units after it.
 *  2. Otherwise units are compared: alike units (about 75% the same) are the same section.
 *     The section that comes back most is the Chorus; one that always comes right before it is the Pre-Chorus;
 *     a new section after the choruses have started, unlike the verses, is the Bridge; a short ending
 *     after the last chorus is the Tag; the rest are Verse 1, Verse 2… in order.
 * `stanzas`: true when each unit is a whole stanza; false for slides, where consecutive new slides form one section.
 */
export function detectGroups(texts: string[], stanzas = false): (string | undefined)[] {
  const labels = texts.map(t => parseSectionLabel(t.split('\n')[0])?.group);
  if (labels.some(Boolean)) {
    let current: string | undefined;
    const labelled = texts.map((_, i) => (current = labels[i] ?? current));
    // Units before the first label are worked out on their own
    const first = labels.findIndex(Boolean);
    if (first > 0) detectGroups(texts.slice(0, first), stanzas).forEach((g, i) => { labelled[i] = g; });
    return labelled;
  }
  if (texts.length === 0) return [];

  // Which earlier unit each unit repeats
  const cluster = texts.map((t, i) => {
    for (let j = 0; j < i; j++) if (alike(t, texts[j])) return j;
    return i;
  });
  const clusterSize = new Map<number, number>();
  cluster.forEach(c => clusterSize.set(c, (clusterSize.get(c) || 0) + 1));
  const repeated = (i: number) => (clusterSize.get(cluster[i]) || 0) > 1;

  // Blocks: runs of units that belong together
  const blocks: { start: number; units: number[] }[] = [];
  texts.forEach((_, i) => {
    const block = blocks[blocks.length - 1];
    // Each stanza is a section of its own; consecutive slides of one section stay together
    const startNew = !block
      || stanzas
      || repeated(i) !== repeated(block.units[block.units.length - 1])
      || (repeated(i) && cluster[i] === cluster[block.units[0]]);
    if (startNew) blocks.push({ start: i, units: [i] });
    else block.units.push(i);
  });
  const signature = (b: { units: number[] }) => b.units.map(u => cluster[u]).join(',');
  const blockText = (b: { units: number[] }) => b.units.map(u => texts[u]).join('\n');
  const occurrences = new Map<string, number>();
  blocks.forEach(b => occurrences.set(signature(b), (occurrences.get(signature(b)) || 0) + 1));
  const isRepeatBlock = (b: { units: number[] }) => b.units.every(repeated);

  // The chorus: the repeated block that comes back most (then the longest, then the first)
  let chorusSig: string | undefined;
  let best = -1;
  blocks.forEach(b => {
    if (!isRepeatBlock(b)) return;
    const score = (occurrences.get(signature(b)) || 0) * 10 + b.units.length + (isRepetitive(blockText(b)) ? 3 : 0);
    if (score > best) { best = score; chorusSig = signature(b); }
  });
  // No repeats at all, but one stanza is clearly a refrain
  if (!chorusSig && stanzas) {
    const refrain = blocks.find((b, i) => i > 0 && isRepetitive(blockText(b)));
    if (refrain) chorusSig = signature(refrain);
  }

  const chorusAt = blocks.map(b => signature(b) === chorusSig);
  const preChorusSigs = new Set<string>();
  blocks.forEach((b, i) => {
    if (chorusAt[i] || !isRepeatBlock(b) || !chorusAt[i + 1]) return;
    const sig = signature(b);
    // Before the chorus every time it appears
    const all = blocks.map((x, k) => signature(x) === sig ? k : -1).filter(k => k >= 0);
    if (all.every(k => chorusAt[k + 1])) preChorusSigs.add(sig);
  });

  const verseShape = (b: { units: number[] }) => blockText(b).split('\n').length;
  const firstVerse = blocks.find((b, i) => !chorusAt[i] && !preChorusSigs.has(signature(b)));
  const lastChorus = chorusAt.lastIndexOf(true);
  const firstChorus = chorusAt.indexOf(true);
  const choirCount = chorusAt.filter(Boolean).length;

  const names = new Map<string, string>();
  let verse = 0;
  let bridges = 0;
  const groupOfBlock = blocks.map((b, i) => {
    const sig = signature(b);
    if (chorusAt[i]) return 'Chorus';
    if (preChorusSigs.has(sig)) return 'Pre-Chorus';
    if (names.has(sig)) return names.get(sig)!;
    let name: string;
    const lines = verseShape(b);
    const short = lines <= 2 || clean(blockText(b)).split(' ').length <= 12;
    if (lastChorus >= 0 && i > lastChorus && i === blocks.length - 1 && short) {
      name = 'Tag';
    } else if (firstChorus >= 0 && i > (choirCount >= 2 ? chorusAt.indexOf(true, firstChorus + 1) : firstChorus) && verse >= 1
      && firstVerse && b !== firstVerse && lines !== verseShape(firstVerse)) {
      // A new section after the second chorus (or the only one), shaped unlike the verses
      bridges++;
      name = bridges === 1 ? 'Bridge' : `Bridge ${bridges}`;
    } else {
      verse++;
      name = `Verse ${verse}`;
    }
    names.set(sig, name);
    return name;
  });

  const result: (string | undefined)[] = new Array(texts.length);
  blocks.forEach((b, i) => b.units.forEach(u => { result[u] = groupOfBlock[i]; }));
  // "Verse 1" alone reads oddly when there is only one verse
  const verses = new Set(result.filter(g => g?.startsWith('Verse ')));
  if (verses.size === 1) return result.map(g => (g === 'Verse 1' ? 'Verse' : g));
  return result;
}

// ─── Turning pasted lyrics into slides ───────────────────────────────────────

const META_LINE = /(ccli|songselect|copyright|©|\(c\)\s*\d{4}|all rights reserved|admin\.?\s+by|used by permission|www\.|https?:\/\/)/i;

/**
 * Split lyrics into slides with groups. Blank lines separate stanzas; a stanza longer than `linesPerSlide`
 * becomes several slides of the same group. Labels ("[Chorus]", "Verse 2:") name the stanza and are removed;
 * "x2" repeats a stanza; a label on its own repeats that section; copyright/CCLI lines are left out.
 */
export function lyricsToSections(text: string, linesPerSlide = 2): { text: string; group?: string }[] {
  const stanzas = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(s => s.split('\n').map(l => l.trim()).filter(Boolean)).filter(s => s.length);
  // Leave out a trailing copyright / CCLI block and such lines anywhere
  const kept = stanzas
    .map(lines => lines.filter(l => !META_LINE.test(l)))
    .filter(lines => lines.length);

  type Stanza = { lines: string[]; label?: string };
  const units: Stanza[] = [];
  const byLabel = new Map<string, string[]>();
  kept.forEach(lines => {
    const label = parseSectionLabel(lines[0]);
    let body = label ? lines.slice(1) : lines;
    let repeat = label?.repeat ?? 1;
    // "x2" on the last line repeats the stanza
    const tail = body[body.length - 1]?.match(/^\(?\s*(?:[xх×]\s*(\d)|(\d)\s*[xх×])\s*\)?$/i);
    if (tail) { repeat = Number(tail[1] || tail[2]) || 1; body = body.slice(0, -1); }
    // A label with nothing under it: sing that section again
    if (label && body.length === 0) body = byLabel.get(label.group) || [];
    if (body.length === 0) return;
    if (label) byLabel.set(label.group, body);
    for (let r = 0; r < repeat; r++) units.push({ lines: body, label: label?.group });
  });

  const auto = detectGroups(units.map(u => u.lines.join('\n')), true);
  const slides: { text: string; group?: string }[] = [];
  let current: string | undefined;
  units.forEach((u, i) => {
    // Written labels win; unlabelled stanzas after a label continue it only if every stanza was labelled
    const group = u.label ?? (units.some(x => x.label) ? current : auto[i]);
    current = group;
    for (let k = 0; k < u.lines.length; k += Math.max(1, linesPerSlide)) {
      slides.push({ text: u.lines.slice(k, k + Math.max(1, linesPerSlide)).join('\n'), group });
    }
  });
  return slides;
}
