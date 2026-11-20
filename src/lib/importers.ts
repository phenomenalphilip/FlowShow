/**
 * Importing songs and song libraries from other programs and documents:
 *   FreeShow (.show), ProPresenter 6 (.pro6), ProPresenter 7 (.pro, .proBundle), Word (.docx), text (.txt),
 *   and .zip files holding any of these.
 * Each file becomes one or more shows of slides with groups (Verse 1, Chorus…).
 */
import { detectGroups, lyricsToSections } from './slideGroups';

export interface ImportedShow {
  title: string;
  slides: { text: string; group?: string }[];
  /** The file it came from */
  file: string;
  artist?: string;
}

export interface ImportResult {
  shows: ImportedShow[];
  /** Files that couldn't be read, with the reason */
  problems: string[];
}

export const IMPORT_ACCEPT = '.show,.pro,.pro6,.proBundle,.docx,.txt,.cho,.chopro,.chordpro,.crd,.xml,.csv,.zip';
export const IMPORT_FORMATS = 'FreeShow (.show), ProPresenter 6 and 7 (.pro6, .pro, .proBundle), Word (.docx), text (.txt), ChordPro, OpenLyrics, OpenSong, CSV, or a .zip of these';

/** The importable song formats, one per button in the Import window (accept = the file types its picker shows) */
export const IMPORT_SOURCES = {
  freeshow: { label: 'FreeShow', accept: '.show,.zip', hint: '.show files' },
  propresenter: { label: 'ProPresenter', accept: '.pro,.pro6,.proBundle,.zip', hint: 'ProPresenter 6 and 7' },
  word: { label: 'Word', accept: '.docx', hint: 'a heading above each song' },
  text: { label: 'Text file', accept: '.txt', hint: 'one song per file' },
  chordpro: { label: 'ChordPro', accept: '.cho,.chopro,.chordpro,.crd,.txt', hint: 'chords are left out' },
  openlyrics: { label: 'OpenLP / OpenLyrics', accept: '.xml,.zip', hint: 'OpenLyrics .xml' },
  opensong: { label: 'OpenSong', accept: '', hint: 'song files' },
  csv: { label: 'CSV', accept: '.csv', hint: 'title and lyrics columns' },
} as const;
export type ImportSource = keyof typeof IMPORT_SOURCES;

/** Words typed or pasted (Clipboard): one show, groups from labels or worked out from the words */
export function showFromText(title: string, text: string): ImportedShow {
  return { title: title.trim() || 'Pasted song', file: 'Clipboard', slides: lyricsToSections(text, 2) };
}

/** Does this .xml look like a song (OpenLyrics / OpenSong) rather than a Bible? */
export function isSongXml(head: string): boolean {
  return /<song[\s>]/i.test(head) && !/<(bible|XMLBIBLE|testament|BIBLEBOOK)[\s>]/i.test(head);
}

const baseName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim() || 'Untitled';
const ext = (name: string) => (name.match(/\.([^.\\/]+)$/)?.[1] || '').toLowerCase();
const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');

/** Import the given files; each can hold one show or a whole library */
export async function importShowFiles(files: { name: string; bytes: Uint8Array }[]): Promise<ImportResult> {
  const result: ImportResult = { shows: [], problems: [] };
  for (const f of files) {
    try {
      const shows = await importOne(f.name, f.bytes);
      if (!shows.length) result.problems.push(`${f.name}: no song words found`);
      result.shows.push(...shows.filter(s => s.slides.length));
    } catch (err) {
      result.problems.push(`${f.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

async function importOne(name: string, bytes: Uint8Array): Promise<ImportedShow[]> {
  switch (ext(name)) {
    case 'show': return [fromFreeShow(name, utf8(bytes))];
    case 'pro6': return [fromProPresenter6(name, utf8(bytes))];
    case 'pro': return [fromProPresenter7(name, bytes)];
    case 'docx': return fromWord(name, await readZip(bytes));
    case 'txt': {
      const text = decodeText(bytes);
      return [/^\s*\{\s*(title|t)\s*:/im.test(text) ? fromChordPro(name, text) : fromText(name, text)];
    }
    case 'cho': case 'chopro': case 'chordpro': case 'crd': return [fromChordPro(name, decodeText(bytes))];
    case 'csv': return fromCsv(name, decodeText(bytes));
    case 'xml': case '': {
      const xml = decodeText(bytes);
      if (/openlyrics/i.test(xml.slice(0, 2000))) return [fromOpenLyrics(name, xml)];
      if (/<song[\s>]/i.test(xml.slice(0, 2000)) && /<lyrics/i.test(xml)) return [fromOpenSong(name, xml)];
      throw new Error(ext(name) === 'xml' ? 'not an OpenLyrics or OpenSong song' : 'not a supported file');
    }
    case 'probundle':
    case 'zip': {
      const entries = await readZip(bytes);
      const shows: ImportedShow[] = [];
      for (const [path, data] of entries) {
        if (/(^|\/)(__MACOSX|\.)/.test(path) || !/\.(show|pro6?|docx|txt|cho|chopro|chordpro|crd|xml|csv)$/i.test(path)) continue;
        try { shows.push(...await importOne(path, data)); } catch { /* skip files inside that can't be read */ }
      }
      if (!shows.length) throw new Error('no songs inside');
      return shows;
    }
    case 'ewsx': case 'db': case 'ews':
      throw new Error('EasyWorship files are not supported yet. In EasyWorship, export the songs as text files and import those.');
    default:
      throw new Error(`not a supported file. FlowShow imports ${IMPORT_FORMATS}.`);
  }
}

/** Text files may be UTF-8 or (older Windows files) Windows-1252 */
function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  const text = new TextDecoder('utf-8').decode(bytes);
  return (text.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : text).replace(/^﻿/, '');
}

// ─── Text ───
function fromText(name: string, text: string): ImportedShow {
  return { title: baseName(name), file: name, slides: lyricsToSections(text, 2) };
}

// ─── ChordPro: {directives}, [chords] inside the words, sections marked with {start_of_chorus} / {comment: Verse 1} ───
function fromChordPro(name: string, text: string): ImportedShow {
  let title = '', artist = '';
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const d = line.match(/^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i);
    if (d) {
      const key = d[1].toLowerCase(), val = (d[2] || '').trim();
      if (key === 'title' || key === 't') title = val;
      else if (key === 'artist' || key === 'subtitle' || key === 'st' || key === 'composer') artist = artist || val;
      else if (key === 'soc' || key === 'start_of_chorus') out.push('', val || 'Chorus');
      else if (key === 'sov' || key === 'start_of_verse') out.push('', val || 'Verse');
      else if (key === 'sob' || key === 'start_of_bridge') out.push('', val || 'Bridge');
      else if (key === 'chorus') out.push('', 'Chorus', '');
      else if (key === 'comment' || key === 'c' || key === 'ci' || key === 'comment_italic') { if (val && val.length <= 30) out.push('', val); }
      else if (/^(end_of_|eo)/.test(key)) out.push('');
      continue;
    }
    // Leave out the chords; a line that was only chords goes away
    const words = line.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
    if (line && !words) continue;
    out.push(words);
  }
  return { title: title || baseName(name), artist: artist || undefined, file: name, slides: lyricsToSections(out.join('\n'), 2) };
}

// ─── OpenLyrics (OpenLP and others): <verse name="v1"><lines>…<br/>…</lines></verse>, sung in <verseOrder> ───
function fromOpenLyrics(name: string, xml: string): ImportedShow {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not a readable OpenLyrics file');
  const byTag = (el: Document | Element, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));
  const title = byTag(doc, 'title')[0]?.textContent?.trim();
  const artist = byTag(doc, 'author')[0]?.textContent?.trim();
  const verses = new Map<string, string[]>();
  byTag(doc, 'verse').forEach(v => {
    const id = (v.getAttribute('name') || '').toLowerCase();
    const parts = byTag(v, 'lines').map(l => {
      // <br/> starts a new line; chords stay as their words, comments are left out
      const clone = l.cloneNode(true) as Element;
      Array.from(clone.getElementsByTagNameNS('*', 'br')).forEach(br => br.replaceWith('\n'));
      Array.from(clone.getElementsByTagNameNS('*', 'comment')).forEach(c => c.remove());
      return (clone.textContent || '').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
    }).filter(Boolean);
    if (parts.length) verses.set(id, parts);
  });
  const order = (byTag(doc, 'verseOrder')[0]?.textContent || '').toLowerCase().split(/\s+/).filter(id => verses.has(id));
  const slides: { text: string; group?: string }[] = [];
  (order.length ? order : [...verses.keys()]).forEach(id => verses.get(id)!.forEach(text => slides.push({ text, group: groupFromCode(id) })));
  return { title: title || baseName(name), artist: artist || undefined, file: name, slides: splitLong(slides) };
}

// ─── OpenSong: <lyrics> with [V1] section marks; lines starting with "." are chords, ";" comments ───
function fromOpenSong(name: string, xml: string): ImportedShow {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not a readable OpenSong file');
  const get = (tag: string) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const sections = new Map<string, string[]>();
  let current = '';
  get('lyrics').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    const mark = line.match(/^\s*\[([^\]]+)\]/);
    if (mark) { current = mark[1].trim().toLowerCase(); if (!sections.has(current)) sections.set(current, []); return; }
    if (/^[.;]/.test(line)) return;
    // A leading digit numbers verse lines on shared music; | and _ mark slide breaks / spacing
    const words = line.replace(/^\s?\d?\s?/, '').replace(/[|_]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current)!.push(words);
  });
  const order = get('presentation').toLowerCase().split(/\s+/).filter(id => sections.has(id));
  const slides: { text: string; group?: string }[] = [];
  (order.length ? order : [...sections.keys()]).forEach(id => {
    sections.get(id)!.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
      .forEach(text => slides.push({ text, group: id ? groupFromCode(id) : undefined }));
  });
  return { title: get('title') || baseName(name), artist: get('author') || undefined, file: name, slides: splitLong(slides) };
}

/** v1 → Verse 1, c → Chorus, b → Bridge, p → Pre-chorus, t → Tag, e → Ending, i → Intro */
function groupFromCode(code: string): string | undefined {
  const m = code.match(/^([a-z]+)\s*(\d*)/i);
  if (!m) return undefined;
  const names: Record<string, string> = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-chorus', t: 'Tag', e: 'Ending', o: 'Outro', i: 'Intro' };
  const word = names[m[1][0].toLowerCase()] || m[1];
  return m[2] ? `${word} ${m[2]}` : word;
}

/** Long sections become slides of 2 lines, keeping their group */
function splitLong(slides: { text: string; group?: string }[]): { text: string; group?: string }[] {
  return slides.flatMap(s => {
    const lines = s.text.split('\n');
    if (lines.length <= 2) return [s];
    const out: { text: string; group?: string }[] = [];
    for (let i = 0; i < lines.length; i += 2) out.push({ text: lines.slice(i, i + 2).join('\n'), group: s.group });
    return out;
  });
}

// ─── CSV: a header row naming the columns (title, lyrics/words/text, author/artist); one song per row ───
function fromCsv(name: string, text: string): ImportedShow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('no rows under the header');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
  const ti = col('title', 'name', 'song'), li = col('lyrics', 'words', 'text', 'content'), ai = col('author', 'artist');
  if (li < 0) throw new Error('needs a column called "lyrics" (or "words" / "text") and one called "title"');
  return rows.slice(1).filter(r => r[li]?.trim()).map((r, i) => ({
    title: (ti >= 0 && r[ti]?.trim()) || `${baseName(name)} ${i + 1}`,
    artist: ai >= 0 ? r[ai]?.trim() || undefined : undefined,
    file: name,
    slides: lyricsToSections(r[li].replace(/\\n/g, '\n'), 2),
  }));
}

function parseCsv(text: string): string[][] {
  const first = text.split('\n')[0];
  const delim = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// ─── FreeShow (.show): [id, show] JSON; the first layout gives the order, slides keep their groups ───
function fromFreeShow(name: string, json: string): ImportedShow {
  const data = JSON.parse(json);
  const show = Array.isArray(data) ? data[1] : data;
  if (!show?.slides) throw new Error('not a FreeShow show');
  const slides: Record<string, any> = show.slides;
  const layout = Object.values(show.layouts || {})[0] as any;
  const textOf = (slide: any) => (slide?.items || [])
    .filter((item: any) => (item.type || 'text') === 'text' && item.lines)
    .map((item: any) => item.lines.map((line: any) => (line.text || []).map((t: any) => t.value || '').join('').replace(/<br\s*\/?>/gi, '\n')).join('\n'))
    .filter((t: string) => t.trim())
    .join('\n')
    .trim();
  const groupOf = (slide: any) => {
    const g = slide?.group || slide?.globalGroup;
    return g ? String(g).replace(/_/g, '-').replace(/^\w/, (c: string) => c.toUpperCase()) : undefined;
  };
  // Order: the layout (a slide can come back, e.g. the chorus); a slide's children follow it in its group
  const order: string[] = layout?.slides?.map((s: any) => s.id).filter((id: string) => slides[id]) || Object.keys(slides).filter(id => !Object.values(slides).some((s: any) => s.children?.includes(id)));
  const out: { text: string; group?: string; source: string }[] = [];
  order.forEach(id => {
    const parent = slides[id];
    const group = groupOf(parent);
    [id, ...(parent.children || [])].forEach((cid: string) => {
      const text = textOf(slides[cid]);
      if (text) out.push({ text, group, source: id });
    });
  });
  // Several different slides with the same group name are numbered: Verse 1, Verse 2…
  const distinct = new Map<string, string[]>();
  out.forEach(s => { if (s.group) { const list = distinct.get(s.group) || []; if (!list.includes(s.source)) list.push(s.source); distinct.set(s.group, list); } });
  return {
    title: show.meta?.title || show.name || baseName(name),
    artist: show.meta?.artist || show.meta?.author,
    file: name,
    slides: out.map(s => {
      const list = s.group ? distinct.get(s.group)! : [];
      return { text: s.text, group: s.group && list.length > 1 ? `${s.group} ${list.indexOf(s.source) + 1}` : s.group };
    }),
  };
}

// ─── ProPresenter 6 (.pro6): XML with groups of slides; the words are base64 plain text or RTF ───
function fromProPresenter6(name: string, xml: string): ImportedShow {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not a readable ProPresenter 6 file');
  const root = doc.documentElement;
  const b64 = (s: string) => { try { return utf8(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0))); } catch { return ''; } };
  const slides: { text: string; group?: string }[] = [];
  const groups = Array.from(doc.getElementsByTagName('RVSlideGrouping'));
  const slideText = (slideEl: Element) => Array.from(slideEl.getElementsByTagName('RVTextElement')).map(el => {
    const plain = Array.from(el.children).find(c => c.getAttribute('rvXMLIvarName') === 'PlainText')?.textContent || el.getAttribute('PlainText');
    if (plain) return b64(plain);
    const rtf = Array.from(el.children).find(c => c.getAttribute('rvXMLIvarName') === 'RTFData')?.textContent || el.getAttribute('RTFData');
    return rtf ? rtfToText(b64(rtf)) : '';
  }).map(t => t.replace(/\r\n?/g, '\n').trim()).filter(Boolean).join('\n');
  (groups.length ? groups : [root]).forEach(g => {
    const group = g === root ? undefined : g.getAttribute('name') || undefined;
    Array.from(g.getElementsByTagName('RVDisplaySlide')).forEach(s => {
      const text = slideText(s);
      if (text) slides.push({ text, group });
    });
  });
  return { title: root.getAttribute('CCLISongTitle') || baseName(name), artist: root.getAttribute('CCLIAuthor') || undefined, file: name, slides };
}

// ─── ProPresenter 7 (.pro): a binary file; each slide's words are stored as RTF, which is read in order ───
function fromProPresenter7(name: string, bytes: Uint8Array): ImportedShow {
  const raw = new TextDecoder('latin1').decode(bytes);
  const texts: string[] = [];
  const start = /\{\\rtf1/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(raw))) {
    // Find the matching closing brace of this RTF document
    let depth = 0, i = m.index;
    for (; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) break;
    }
    const rtf = raw.slice(m.index, i + 1);
    start.lastIndex = i + 1;
    const text = rtfToText(rtf).trim();
    if (text) texts.push(text);
  }
  if (!texts.length) throw new Error('no slide words found (is it a ProPresenter 7 presentation?)');
  // Pro 7 keeps one copy of each slide; groups are worked out from the words
  const groups = detectGroups(texts);
  return { title: baseName(name), file: name, slides: texts.map((text, i) => ({ text, group: groups[i] })) };
}

/** Plain text from RTF: paragraphs become lines; formatting, fonts and colours are dropped */
export function rtfToText(rtf: string): string {
  let out = '';
  let i = 0;
  const skipDepth: number[] = [];
  let depth = 0;
  let ucSkip = 1;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') { depth++; i++; continue; }
    if (ch === '}') { if (skipDepth[skipDepth.length - 1] === depth) skipDepth.pop(); depth--; i++; continue; }
    if (ch === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') { if (!skipDepth.length) out += next; i += 2; continue; }
      if (next === '\'') { const hex = rtf.slice(i + 2, i + 4); if (!skipDepth.length) out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)])); i += 4; continue; }
      if (next === '*') { skipDepth.push(depth); i += 2; continue; }
      if (next === '\n' || next === '\r') { if (!skipDepth.length) out += '\n'; i += 2; continue; }
      const word = rtf.slice(i + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (!word) { i += 2; continue; }
      i += 1 + word[0].length;
      const [, name, arg] = word;
      if (['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'expandedcolortbl', 'listtable', 'listoverridetable', 'header', 'footer'].includes(name)) { skipDepth.push(depth); continue; }
      if (skipDepth.length) continue;
      if (name === 'par' || name === 'line' || name === 'sect') out += '\n';
      else if (name === 'tab') out += ' ';
      else if (name === 'uc') ucSkip = Number(arg) || 0;
      else if (name === 'u') {
        let code = Number(arg);
        if (code < 0) code += 65536;
        out += String.fromCharCode(code);
        // Skip the fallback characters that follow \uN
        for (let k = 0; k < ucSkip && i < rtf.length; k++) {
          if (rtf[i] === '\\' && rtf[i + 1] === '\'') i += 4; else i++;
        }
      }
      continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    if (!skipDepth.length) out += ch;
    i++;
  }
  return out.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Word (.docx): paragraphs; a Heading or Title paragraph starts a new song (a song book in one document) ───
function fromWord(name: string, zip: Map<string, Uint8Array>): ImportedShow[] {
  const xml = zip.get('word/document.xml');
  if (!xml) throw new Error('not a Word document');
  const doc = new DOMParser().parseFromString(utf8(xml), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const songs: { title: string; lines: string[] }[] = [];
  let current = { title: baseName(name), lines: [] as string[] };
  Array.from(doc.getElementsByTagNameNS(W, 'p')).forEach(p => {
    const style = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || '';
    let text = '';
    p.querySelectorAll('*').forEach(el => {
      if (el.namespaceURI !== W) return;
      if (el.localName === 't') text += el.textContent || '';
      else if (el.localName === 'tab') text += ' ';
      else if (el.localName === 'br' || el.localName === 'cr') text += '\n';
    });
    const isHeading = /^(heading|title|berschrift|titre|t[íi]tulo)/i.test(style) && text.trim().length > 0;
    if (isHeading) {
      if (current.lines.some(l => l.trim())) songs.push(current);
      current = { title: text.trim(), lines: [] };
      return;
    }
    current.lines.push(text);
  });
  if (current.lines.some(l => l.trim())) songs.push(current);
  return songs.map(s => ({ title: s.title, file: name, slides: lyricsToSections(s.lines.join('\n'), 2) }));
}

// ─── Reading .zip files (and .docx / .proBundle, which are zips) with the browser's own decompression ───
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(start, start + compressedSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
  }
  return files;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
