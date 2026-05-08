import { BibleVersion, Book, Chapter, Verse } from './bibleDb';

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

        if (format === 'zefania') {
          const bookNodes = xmlDoc.querySelectorAll('BIBLEBOOK, biblebook');
          bookNodes.forEach(bNode => {
            const bname = bNode.getAttribute('bname') || bNode.getAttribute('BNAME') || '';
            const book: Book = { name: bname, chapters: [] };
            
            const chapterNodes = bNode.querySelectorAll('CHAPTER, chapter');
            chapterNodes.forEach(cNode => {
              const cnumber = parseInt(cNode.getAttribute('cnumber') || cNode.getAttribute('CNUMBER') || '0', 10);
              const chapter: Chapter = { c: cnumber, verses: [] };
              
              const verseNodes = cNode.querySelectorAll('VERS, vers');
              verseNodes.forEach(vNode => {
                const vnumber = parseInt(vNode.getAttribute('vnumber') || vNode.getAttribute('VNUMBER') || '0', 10);
                chapter.verses.push({ v: vnumber, text: vNode.textContent || '' });
              });
              
              book.chapters.push(chapter);
            });
            bible.books.push(book);
          });
        } else if (format === 'opensong') {
             const bookNodes = xmlDoc.querySelectorAll('b, B');
             bookNodes.forEach(bNode => {
                const bname = bNode.getAttribute('n') || bNode.getAttribute('N') || '';
                const book: Book = { name: bname, chapters: [] };
                
                const chapterNodes = bNode.querySelectorAll('c, C');
                chapterNodes.forEach(cNode => {
                  const cnumber = parseInt(cNode.getAttribute('n') || cNode.getAttribute('N') || '0', 10);
                  const chapter: Chapter = { c: cnumber, verses: [] };
                  
                  const verseNodes = cNode.querySelectorAll('v, V');
                  verseNodes.forEach(vNode => {
                    const vnumber = parseInt(vNode.getAttribute('n') || vNode.getAttribute('N') || '0', 10);
                    chapter.verses.push({ v: vnumber, text: vNode.textContent || '' });
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
