import { get, set, keys, del } from 'idb-keyval';

export type Verse = {
  v: number;
  text: string;
};

export type Chapter = {
  c: number;
  verses: Verse[];
};

export type Book = {
  name: string;
  chapters: Chapter[];
};

export type BibleVersion = {
  id: string; // e.g., "kjv"
  name: string;
  books: Book[];
};

// Fallback in-memory storage for iframes/sandboxes that block IndexedDB
const memoryBibles: Record<string, BibleVersion> = {};

export async function initDatabase() {
  const deletedKjv = localStorage.getItem('deleted_bible_kjv');
  if (deletedKjv) return;

  try {
    const existingKjv = await get('bible_kjv');
    if (!existingKjv) {
      // First time loading the KJV
      const response = await fetch('/kjv-formatted.json');
      if (response.ok) {
        const kjvBible = await response.json();
        await saveBible(kjvBible);
      }
    }
  } catch (e) {
    // IDB blocked, use memory
    if (!memoryBibles['bible_kjv']) {
      const response = await fetch('/kjv-formatted.json');
      if (response.ok) {
        const kjvBible = await response.json();
        memoryBibles['bible_kjv'] = kjvBible;
      }
    }
  }
}

export async function saveBible(bible: BibleVersion) {
  try {
    await set(`bible_${bible.id}`, bible);
  } catch (e) {
    console.warn("IndexedDB blocked, using memory storage", e);
  }
  memoryBibles[`bible_${bible.id}`] = bible;
}

export async function getBible(id: string): Promise<BibleVersion | undefined> {
  try {
    const b = await get(`bible_${id}`);
    if (b) return b as BibleVersion;
  } catch (e) {}
  return memoryBibles[`bible_${id}`];
}

export async function deleteBible(id: string): Promise<void> {
  try {
    await del(`bible_${id}`);
  } catch (e) {}
  delete memoryBibles[`bible_${id}`];
  
  if (id === 'kjv') {
    localStorage.setItem('deleted_bible_kjv', 'true');
  }
}

export async function getAllBibleIds(): Promise<string[]> {
  try {
    const allKeys = await keys();
    const idbKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('bible_')).map(k => (k as string).replace('bible_', ''));
    const memKeys = Object.keys(memoryBibles).map(k => k.replace('bible_', ''));
    return Array.from(new Set([...idbKeys, ...memKeys]));
  } catch (e) {
    return Object.keys(memoryBibles).map(k => k.replace('bible_', ''));
  }
}

export async function getBibleList(): Promise<{id: string, name: string}[]> {
  const ids = await getAllBibleIds();
  const list = [];
  for (const id of ids) {
    const b = await getBible(id);
    if (b) {
      list.push({ id: b.id, name: b.name });
    }
  }
  return list;
}
