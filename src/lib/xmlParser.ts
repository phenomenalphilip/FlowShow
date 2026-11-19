import { BibleVersion, Book } from './bibleDb';

/**
 * Reads a Bible from an XML file. Rather than expecting one exact layout, it finds the verses and works out which
 * chapter and book each belongs to, so it reads the common Bible XML formats:
 *   Zefania / Haggai  <XMLBIBLE><BIBLEBOOK bnumber bname><CHAPTER cnumber><VERS vnumber>
 *   OpenSong          <bible><b n><c n><v n>
 *   Beblia            <bible translation><testament><book number><chapter number><verse number>
 *   OSIS              <div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">, also with
 *                     milestone verses (<verse sID/> words <verse eID/>)
 *   USFX              <book id="GEN"><c id="1"/><v id="1"/> words <ve/>
 * Books that only carry a number (Beblia, some Zefania files) or a code (OSIS, USFX) get their standard English name.
 */

/** Thrown with a message that can be shown to the person importing as it is. */
export class BibleFileError extends Error {}

/** The 66 books in order, named the way the rest of FlowShow writes references ("John 3:16"). */
export const STANDARD_BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
  'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

// OSIS and USFM book codes (lower case), in the same order as the names above
const OSIS_CODES = 'gen exod lev num deut josh judg ruth 1sam 2sam 1kgs 2kgs 1chr 2chr ezra neh esth job ps prov eccl song isa jer lam ezek dan hos joel amos obad jonah mic nah hab zeph hag zech mal matt mark luke john acts rom 1cor 2cor gal eph phil col 1thess 2thess 1tim 2tim titus phlm heb jas 1pet 2pet 1john 2john 3john jude rev'.split(' ');
const USFM_CODES = 'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos jol amo oba jon mic nam hab zep hag zec mal mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'.split(' ');
const CODE_NAMES: Record<string, string> = {
  tob: 'Tobit', jdt: 'Judith', addesth: 'Additions to Esther', esg: 'Esther (Greek)', wis: 'Wisdom', sir: 'Sirach',
  bar: 'Baruch', epjer: 'Letter of Jeremiah', lje: 'Letter of Jeremiah', prazar: 'Prayer of Azariah',
  s3y: 'Song of the Three', sus: 'Susanna', bel: 'Bel and the Dragon', '1macc': '1 Maccabees', '1ma': '1 Maccabees',
  '2macc': '2 Maccabees', '2ma': '2 Maccabees', '3macc': '3 Maccabees', '3ma': '3 Maccabees', '4macc': '4 Maccabees',
  '4ma': '4 Maccabees', prman: 'Prayer of Manasseh', man: 'Prayer of Manasseh', '1esd': '1 Esdras', '1es': '1 Esdras',
  '2esd': '2 Esdras', '2es': '2 Esdras', ps151: 'Psalm 151', ps2: 'Psalm 151',
};
STANDARD_BOOK_NAMES.forEach((name, i) => { CODE_NAMES[OSIS_CODES[i]] = name; CODE_NAMES[USFM_CODES[i]] = name; });
const nameForCode = (code: string) => CODE_NAMES[code.trim().toLowerCase().replace(/[\s.]/g, '')];

const VERSE_TAGS = new Set(['vers', 'verse', 'v']);
const CHAPTER_TAGS = new Set(['chapter', 'c']);
// Never part of the words on screen: notes, cross references, headings, titles and book information
const SKIP_TAGS = new Set([
  'note', 'xref', 'f', 'x', 'fig', 'figure', 'title', 'header', 'rdg', 'caption', 'prolog', 'remark', 'media',
  'milestone', 'index', 'catchword', 'h', 'toc', 'id', 'ide', 'rem', 'ms', 'mr', 'mt', 's', 'r', 'd', 'sp', 'cl',
  'cp', 'ca', 'va', 'vp', 'periph', 'languagecode',
]);
const BREAK_TAGS = new Set(['br', 'lb']);
const BLOCK_TAGS = new Set(['p', 'l', 'lg', 'div', 'paragraph', 'line']);

const tagOf = (el: Element) => (el.localName || el.nodeName).toLowerCase();

/** The first of these attributes (any letter case) that has a value. */
function attr(el: Element, ...names: string[]): string | null {
  const attrs = el.attributes;
  for (const want of names) {
    for (let i = 0; i < attrs.length; i++) {
      if ((attrs[i].localName || attrs[i].name).toLowerCase() === want) {
        const value = attrs[i].value.trim();
        if (value) return value;
      }
    }
  }
  return null;
}

const isBookElement = (el: Element, allowB: boolean) => {
  const tag = tagOf(el);
  if (tag === 'biblebook' || tag === 'book') return true;
  if (tag === 'b') return allowB; // OpenSong; left out where <b> could be bold text
  return tag === 'div' && (attr(el, 'type') || '').toLowerCase() === 'book';
};

/** "16", "16a", "16-17", "Gen.1.16" or "Gen.1.16 Gen.1.17" → 16: the number it starts at. */
function refNumber(value: string | null): number {
  if (!value) return NaN;
  const first = value.trim().split(/\s+/)[0].split('-')[0];
  const digits = (first.split('.').pop() || '').match(/\d+/);
  return digits ? parseInt(digits[0], 10) : NaN;
}
/** The parts of an OSIS-style reference: "Gen.1.16" → ['Gen', '1', '16']. */
const refParts = (value: string | null) => (value ? value.trim().split(/\s+/)[0].split('-')[0].split('.') : []);

function bookName(el: Element, position: number): string {
  const named = attr(el, 'bname', 'name', 'longname', 'bookname', 'title');
  if (named && !/^\d+$/.test(named)) return nameForCode(named) ?? named;
  const n = attr(el, 'n');
  const numeric = (v: string | null) => (v && /^\d+$/.test(v) ? v : null);
  const number = numeric(attr(el, 'bnumber', 'number', 'booknumber', 'num')) ?? numeric(named) ?? numeric(n) ?? numeric(attr(el, 'id'));
  if (number) {
    const i = parseInt(number, 10);
    return i >= 1 && i <= STANDARD_BOOK_NAMES.length ? STANDARD_BOOK_NAMES[i - 1] : `Book ${i}`;
  }
  const code = attr(el, 'osisid', 'id', 'code', 'abbr', 'bsname', 'short') ?? n;
  if (code) return nameForCode(code) ?? code;
  return `Book ${position + 1}`;
}

// --- Gathering verses (verse number → lines, per chapter number, per book) ---
type BookAcc = { name: string; chapters: Map<number, Map<number, string[]>>; unnumbered: Map<Element, number> };

class Books {
  list: BookAcc[] = [];
  private byKey = new Map<unknown, BookAcc>();
  get(key: unknown, name: () => string): BookAcc {
    let book = this.byKey.get(key);
    if (!book) {
      book = { name: name(), chapters: new Map(), unnumbered: new Map() };
      this.byKey.set(key, book);
      this.list.push(book);
    }
    return book;
  }
  /** A chapter's number, numbering ones without a number by their place in the book. */
  chapterNumber(book: BookAcc, el: Element): number {
    const n = refNumber(attr(el, 'cnumber', 'number', 'n', 'osisid', 'sid', 'id', 'num'));
    if (!isNaN(n)) return n;
    let assigned = book.unnumbered.get(el);
    if (assigned === undefined) { assigned = book.chapters.size + 1; book.unnumbered.set(el, assigned); }
    return assigned;
  }
  addVerse(book: BookAcc, chapter: number, verse: number, lines: string[]) {
    if (!lines.length) return; // an empty verse (its words are in the verse before it)
    let verses = book.chapters.get(chapter);
    if (!verses) { verses = new Map(); book.chapters.set(chapter, verses); }
    const v = isNaN(verse) ? verses.size + 1 : verse;
    const existing = verses.get(v);
    if (existing) existing.push(...lines); else verses.set(v, lines);
  }
  finish(): Book[] {
    const byNumber = <T,>(a: [number, T], b: [number, T]) => a[0] - b[0];
    return this.list
      .map(book => ({
        name: book.name,
        chapters: [...book.chapters.entries()].sort(byNumber).map(([c, verses]) => ({
          c,
          verses: [...verses.entries()].sort(byNumber).map(([v, lines]) => ({ v, lines })),
        })).filter(chapter => chapter.verses.length > 0),
      }))
      .filter(book => book.chapters.length > 0);
  }
}

// --- Words ---
/** The words under a node as text, with "\n" where a line breaks. Notes and headings are left out. */
function gatherText(node: Node, out: string[]) {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) { out.push(n.nodeValue || ''); continue; }
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = tagOf(n as Element);
    if (SKIP_TAGS.has(tag)) continue;
    if (BREAK_TAGS.has(tag)) { out.push('\n'); continue; }
    const block = BLOCK_TAGS.has(tag);
    if (block) out.push('\n');
    gatherText(n, out);
    if (block) out.push('\n');
  }
}
const toLines = (chunks: string[]) =>
  chunks.join('').split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 0);

// --- Layouts where each verse element holds its words (Zefania, OpenSong, Beblia, most OSIS) ---
function readVerseElements(verseEls: Element[], books: Books) {
  for (const el of verseEls) {
    let chapterEl: Element | null = null;
    let bookEl: Element | null = null;
    let nested = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const tag = tagOf(p);
      if (VERSE_TAGS.has(tag)) { nested = true; break; }
      if (!chapterEl && CHAPTER_TAGS.has(tag)) chapterEl = p;
      else if (isBookElement(p, true)) { bookEl = p; break; }
    }
    if (nested || attr(el, 'eid')) continue;
    const chunks: string[] = [];
    gatherText(el, chunks);
    const lines = toLines(chunks);
    if (!lines.length) continue;

    const ref = refParts(attr(el, 'osisid', 'sid', 'bcv'));
    const bookKey = bookEl ?? (ref.length >= 3 ? `code:${ref[0]}` : attr(el, 'book', 'bnumber', 'b') ?? 'book');
    const book = books.get(bookKey, () => {
      if (bookEl) return bookName(bookEl, books.list.length);
      const loose = typeof bookKey === 'string' ? bookKey.replace(/^code:/, '') : '';
      if (/^\d+$/.test(loose) && +loose >= 1 && +loose <= STANDARD_BOOK_NAMES.length) return STANDARD_BOOK_NAMES[+loose - 1];
      return nameForCode(loose) ?? `Book ${books.list.length + 1}`;
    });
    const chapter = chapterEl
      ? books.chapterNumber(book, chapterEl)
      : refNumber(ref.length >= 3 ? ref[ref.length - 2] : attr(el, 'chapter', 'cnumber', 'c')) || 1;
    const verse = refNumber(attr(el, 'vnumber', 'number', 'n', 'osisid', 'sid', 'id', 'vid', 'num'));
    books.addVerse(book, chapter, verse, lines);
  }
}

// --- Layouts where verses are markers and the words follow them (OSIS milestones, USFX) ---
function readMilestones(root: Element, books: Books) {
  const at: { book: BookAcc | null; chapter: number | null; verse: { n: number; chunks: string[] } | null } =
    { book: null, chapter: null, verse: null };
  const endVerse = () => {
    if (at.verse && at.book && at.chapter !== null) books.addVerse(at.book, at.chapter, at.verse.n, toLines(at.verse.chunks));
    at.verse = null;
  };
  const walk = (node: Node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) { at.verse?.chunks.push(n.nodeValue || ''); continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      const tag = tagOf(el);
      if (isBookElement(el, false)) {
        endVerse();
        const outer = { book: at.book, chapter: at.chapter };
        at.book = books.get(el, () => bookName(el, books.list.length));
        at.chapter = null;
        walk(el);
        endVerse();
        at.book = outer.book; at.chapter = outer.chapter;
        continue;
      }
      if (CHAPTER_TAGS.has(tag)) {
        endVerse();
        if (attr(el, 'eid')) { at.chapter = null; continue; }
        if (!at.book) {
          const code = refParts(attr(el, 'osisid', 'sid'))[0];
          if (code) at.book = books.get(`code:${code}`, () => nameForCode(code) ?? code);
        }
        if (!at.book) continue;
        const number = books.chapterNumber(at.book, el);
        if (el.firstChild) { // a chapter that holds its verses
          const outer = at.chapter;
          at.chapter = number;
          walk(el);
          endVerse();
          at.chapter = outer;
        } else at.chapter = number;
        continue;
      }
      if (VERSE_TAGS.has(tag)) {
        endVerse();
        if (attr(el, 'eid')) continue;
        at.verse = { n: refNumber(attr(el, 'vnumber', 'number', 'n', 'osisid', 'sid', 'id', 'bcv')), chunks: [] };
        if (el.firstChild) { walk(el); endVerse(); }
        continue;
      }
      if (tag === 've') { endVerse(); continue; }
      if (SKIP_TAGS.has(tag)) continue;
      if (BREAK_TAGS.has(tag)) { at.verse?.chunks.push('\n'); continue; }
      const block = BLOCK_TAGS.has(tag);
      if (block) at.verse?.chunks.push('\n');
      walk(el);
      if (block) at.verse?.chunks.push('\n');
    }
  };
  walk(root);
  endVerse();
}

// --- The file itself ---
/** Text from the file's bytes, honouring a byte-order mark or the XML declaration's encoding. */
function decodeXml(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const utf8Mark = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (bytes[0] === 0x3c && bytes[1] === 0x00) encoding = 'utf-16le';
  else if (bytes[0] === 0x00 && bytes[1] === 0x3c) encoding = 'utf-16be';
  else if (!utf8Mark) {
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 256));
    const declared = head.match(/^\s*<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/);
    if (declared) encoding = declared[1].toLowerCase();
  }
  let text: string;
  try { text = new TextDecoder(encoding).decode(bytes); } catch { text = new TextDecoder('utf-8').decode(bytes); encoding = 'utf-8'; }
  // Files saved in Windows' Western encoding but labelled UTF-8 come out with replacement marks
  if (!utf8Mark && ['utf-8', 'utf8'].includes(encoding) && text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes);
  return text.replace(/^﻿/, '').trimStart();
}

const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);
const parseError = (doc: Document) => doc.getElementsByTagName('parsererror')[0] as Element | undefined;

function parseXml(text: string, fileName: string): Document {
  const parse = (t: string) => new DOMParser().parseFromString(t, 'application/xml');
  let doc = parse(text);
  if (!parseError(doc)) return doc;
  // Common faults in Bible files: a bare "&" in a verse, or web entities such as &nbsp; that XML doesn't know
  const decoder = document.createElement('textarea');
  const repaired = text
    .replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][\w.-]*);)/g, '&amp;')
    .replace(/&([A-Za-z][\w.-]*);/g, (entity, name: string) => {
      if (XML_ENTITIES.has(name)) return entity;
      decoder.innerHTML = entity;
      return decoder.value !== entity ? decoder.value : `&amp;${name};`;
    });
  doc = parse(repaired);
  const error = parseError(doc);
  if (!error) return doc;
  // Chromium puts the error line in a <div>, followed by "Below is a rendering of the page…"
  const detail = (error.querySelector('div')?.textContent || error.textContent || '')
    .replace(/Below is a rendering[\s\S]*$/, '').match(/line (\d+) at column \d+: ([^\n]+)/);
  throw new BibleFileError(`“${fileName}” isn't a readable XML file${detail ? ` (line ${detail[1]}: ${detail[2].trim()})` : ''}.`);
}

/** The Bible's own name, if the file gives one. */
function bibleTitle(doc: Document, elements: Element[]): string | null {
  const fromRoot = attr(doc.documentElement, 'translation', 'biblename', 'name', 'title');
  if (fromRoot) return fromRoot;
  for (const el of elements) {
    const tag = tagOf(el);
    if (VERSE_TAGS.has(tag) || isBookElement(el, true)) break; // the book information comes first
    const parent = el.parentElement ? tagOf(el.parentElement) : '';
    if ((tag === 'title' || tag === 'biblename') && ['information', 'work', 'header', 'identification', 'metadata'].includes(parent)) {
      const title = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (title) return title;
    }
  }
  return null;
}

const SUPPORTED = 'FlowShow reads Bible XML files in the Zefania, OpenSong, Beblia, OSIS and USFX formats.';

export async function parseBibleXml(file: File): Promise<BibleVersion> {
  const doc = parseXml(decodeXml(await file.arrayBuffer()), file.name);
  const elements = Array.from(doc.getElementsByTagName('*'));
  const verseEls = elements.filter(el => VERSE_TAGS.has(tagOf(el)));
  const noVerses = () => new BibleFileError(`No Bible verses found in “${file.name}”. ${SUPPORTED}`);
  if (!verseEls.length) throw noVerses();

  // Verses usually hold their words; in milestone layouts they are empty markers with the words after them
  const holdingWords = verseEls.filter(el => !attr(el, 'eid') && (el.textContent || '').trim()).length;
  const books = new Books();
  if (holdingWords * 2 >= verseEls.length) readVerseElements(verseEls, books);
  else readMilestones(doc.documentElement, books);
  const bookList = books.finish();
  if (!bookList.length) throw noVerses();

  const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Bible';
  const title = bibleTitle(doc, elements);
  return {
    id: baseName.replace(/\s+/g, '_'),
    name: title && title.length <= 80 ? title : baseName,
    books: bookList,
  };
}

/** How many verses a Bible holds. */
export const countVerses = (bible: BibleVersion) =>
  bible.books.reduce((total, book) => total + book.chapters.reduce((n, chapter) => n + chapter.verses.length, 0), 0);
