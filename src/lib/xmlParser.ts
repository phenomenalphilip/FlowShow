import { BibleVersion, Book, Chapter, Verse } from './bibleDb';

const STANDARD_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

function parseLines(node: Element): string[] {
  const lines: string[] = [];
  let currentLine = '';

  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      currentLine += n.textContent || '';
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        lines.push(currentLine);
        currentLine = '';
      } else if (tag === 'p') {
        if (currentLine.trim()) {
          lines.push(currentLine);
          currentLine = '';
        }
        Array.from(el.childNodes).forEach(walk);
        if (currentLine.trim()) {
          lines.push(currentLine);
          currentLine = '';
        }
      } else {
        Array.from(el.childNodes).forEach(walk);
      }
    }
  };

  Array.from(node.childNodes).forEach(walk);
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  const result = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (result.length === 0 && node.textContent?.trim()) {
      return [node.textContent.trim()];
  }
  return result;
}

export async function parseBibleXml(file: File): Promise<BibleVersion> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        
        // Quick helper to fetch tags efficiently
        const getElements = (node: Element | Document, names: string[]) => {
            const results: Element[] = [];
            Array.from(node.children || node.childNodes).forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const el = child as Element;
                    if (names.includes(el.tagName.toLowerCase())) {
                        results.push(el);
                    }
                    results.push(...getElements(el, names));
                }
            });
            return results;
        };

        let format = 'unknown';
        if (xmlDoc.querySelector('XMLBIBLE') || xmlDoc.querySelector('xmlbible')) format = 'zefania';
        else if (xmlDoc.querySelector('bible > b') || xmlDoc.querySelector('BIBLE > B') || xmlDoc.querySelector('v[n]') || xmlDoc.querySelector('V[N]')) format = 'opensong';
        else if (xmlDoc.querySelector('verse') || xmlDoc.querySelector('book') || xmlDoc.querySelector('testament')) format = 'generic';

        if (format === 'unknown') {
          throw new Error("Unknown XML Bible format. Could not detect Zefania, OpenSong, or standard Generic tags.");
        }

        const bible: BibleVersion = {
          id: file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_'),
          name: file.name.replace(/\.[^/.]+$/, ""),
          books: []
        };

        if (format === 'zefania') {
          const bookNodes = getElements(xmlDoc, ['biblebook']);
          bookNodes.forEach(bNode => {
            const bname = bNode.getAttribute('bname') || bNode.getAttribute('BNAME') || bNode.getAttribute('bName') || '';
            const book: Book = { name: bname, chapters: [] };
            
            const chapterNodes = getElements(bNode, ['chapter']);
            chapterNodes.forEach(cNode => {
              const cnumber = parseInt(cNode.getAttribute('cnumber') || cNode.getAttribute('CNUMBER') || cNode.getAttribute('cNumber') || '0', 10);
              const chapter: Chapter = { c: cnumber, verses: [] };
              
              const verseNodes = getElements(cNode, ['vers', 'v']);
              verseNodes.forEach(vNode => {
                const vnumber = parseInt(vNode.getAttribute('vnumber') || vNode.getAttribute('VNUMBER') || vNode.getAttribute('vNumber') || vNode.getAttribute('n') || '0', 10);
                chapter.verses.push({ v: vnumber, lines: parseLines(vNode) });
              });
              
              book.chapters.push(chapter);
            });
            bible.books.push(book);
          });
        } 
        else if (format === 'opensong') {
             const bookNodes = getElements(xmlDoc, ['b']);
             bookNodes.forEach(bNode => {
                const bname = bNode.getAttribute('n') || bNode.getAttribute('N') || '';
                const book: Book = { name: bname, chapters: [] };
                
                const chapterNodes = getElements(bNode, ['c']);
                chapterNodes.forEach(cNode => {
                  const cnumber = parseInt(cNode.getAttribute('n') || cNode.getAttribute('N') || '0', 10);
                  const chapter: Chapter = { c: cnumber, verses: [] };
                  
                  const verseNodes = getElements(cNode, ['v']);
                  verseNodes.forEach(vNode => {
                    const vnumber = parseInt(vNode.getAttribute('n') || vNode.getAttribute('N') || '0', 10);
                    chapter.verses.push({ v: vnumber, lines: parseLines(vNode) });
                  });
                  
                  book.chapters.push(chapter);
                });
                bible.books.push(book);
             });
        }
        else if (format === 'generic') {
             // Handles <testament><book number="1"><chapter number="1"><verse number="1">
             const bookNodes = getElements(xmlDoc, ['book']);
             bookNodes.forEach((bNode, index) => {
                let bname = bNode.getAttribute('name') || bNode.getAttribute('title') || '';
                
                if (!bname) {
                    const numAttr = bNode.getAttribute('number') || bNode.getAttribute('num');
                    if (numAttr) {
                        const bNum = parseInt(numAttr, 10);
                        bname = (bNum >= 1 && bNum <= 66) ? STANDARD_BOOKS[bNum - 1] : `Book ${bNum}`;
                    } else {
                        bname = (index < 66) ? STANDARD_BOOKS[index] : `Book ${index + 1}`;
                    }
                }
                
                const book: Book = { name: bname, chapters: [] };
                
                const chapterNodes = getElements(bNode, ['chapter']);
                chapterNodes.forEach((cNode, cIdx) => {
                  const cnumber = parseInt(cNode.getAttribute('number') || cNode.getAttribute('num') || String(cIdx + 1), 10);
                  const chapter: Chapter = { c: cnumber, verses: [] };
                  
                  const verseNodes = getElements(cNode, ['verse']);
                  verseNodes.forEach((vNode, vIdx) => {
                    const vnumber = parseInt(vNode.getAttribute('number') || vNode.getAttribute('num') || String(vIdx + 1), 10);
                    chapter.verses.push({ v: vnumber, lines: parseLines(vNode) });
                  });
                  
                  if (chapter.verses.length > 0) book.chapters.push(chapter);
                });

                if (book.chapters.length > 0) bible.books.push(book);
             });
        }
        
        if (bible.books.length === 0) {
            throw new Error("Parsed successfully but no books/verses were found. Please verify the XML structure.");
        }

        resolve(bible);

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}