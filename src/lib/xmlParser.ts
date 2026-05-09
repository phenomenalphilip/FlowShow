import { BibleVersion, Book, Chapter, Verse } from './bibleDb';

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
        
        let format = 'unknown';
        if (xmlDoc.querySelector('XMLBIBLE') || xmlDoc.querySelector('xmlbible')) format = 'zefania';
        else if (xmlDoc.querySelector('bible') || xmlDoc.querySelector('BIBLE')) format = 'opensong';

        if (format === 'unknown') {
          throw new Error("Unknown XML Bible format. We support Zefania and OpenSong XML formats.");
        }

        const bible: BibleVersion = {
          id: file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_'),
          name: file.name.replace(/\.[^/.]+$/, ""),
          books: []
        };

        const getElements = (node: Element | Document, names: string[]) => {
            const lowerNames = names.map(n => n.toLowerCase());
            return Array.from(node.querySelectorAll('*')).filter(el => lowerNames.includes(el.tagName.toLowerCase()));
        };

        if (format === 'zefania') {
          const bookNodes = getElements(xmlDoc, ['BIBLEBOOK']);
          bookNodes.forEach(bNode => {
            const bname = bNode.getAttribute('bname') || bNode.getAttribute('BNAME') || bNode.getAttribute('bName') || '';
            const book: Book = { name: bname, chapters: [] };
            
            const chapterNodes = getElements(bNode, ['CHAPTER']);
            chapterNodes.forEach(cNode => {
              const cnumber = parseInt(cNode.getAttribute('cnumber') || cNode.getAttribute('CNUMBER') || cNode.getAttribute('cNumber') || '0', 10);
              const chapter: Chapter = { c: cnumber, verses: [] };
              
              const verseNodes = getElements(cNode, ['VERS', 'V']);
              verseNodes.forEach(vNode => {
                const vnumber = parseInt(vNode.getAttribute('vnumber') || vNode.getAttribute('VNUMBER') || vNode.getAttribute('vNumber') || vNode.getAttribute('n') || '0', 10);
                chapter.verses.push({ v: vnumber, lines: parseLines(vNode) });
              });
              
              book.chapters.push(chapter);
            });
            bible.books.push(book);
          });
        } else if (format === 'opensong') {
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
        
        resolve(bible);

      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}
