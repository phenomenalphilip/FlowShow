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

export const IMPORT_ACCEPT = '.show,.pro,.pro6,.proBundle,.docx,.txt,.zip';
export const IMPORT_FORMATS = 'FreeShow (.show), ProPresenter 6 and 7 (.pro6, .pro, .proBundle), Word (.docx), text (.txt), or a .zip of these';

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
    case 'txt': return [fromText(name, decodeText(bytes))];
    case 'probundle':
    case 'zip': {
      const entries = await readZip(bytes);
      const shows: ImportedShow[] = [];
      for (const [path, data] of entries) {
        if (/(^|\/)(__MACOSX|\.)/.test(path) || !/\.(show|pro6?|docx|txt)$/i.test(path)) continue;
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
