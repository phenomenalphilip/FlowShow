import { BrowserRouter, Routes, Route } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, 
  Plus, Search, List, Grid, X, LayoutTemplate, Layers, Play,
  SquareSquare, MonitorOff, MonitorUp, EyeOff, FileText,
  Activity, Upload, ExternalLink, Edit2, Copy, Trash, GripVertical
} from 'lucide-react';

import { AudioModule } from './components/AudioModule';
import { AddSongModal } from './components/AddSongModal';
import { EditSongPage } from './components/EditSongPage';
import { SmartTextLayout } from './components/SmartTextLayout';
import { BibleVersion, getBibleList, getBible, saveBible, deleteBible, initDatabase } from './lib/bibleDb';
import { parseBibleXml } from './lib/xmlParser';
import { BIBLE_BOOKS } from './lib/parser';

export type SlideType = 'lyrics' | 'scripture' | 'blank' | 'media';

export type SlideDefinition = {
  id: string;
  text: string;
  source?: string;
  backgroundUrl?: string;
  type: SlideType;
  disabled?: boolean;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
  };
};


export type PresentState = {
  slide: SlideDefinition | null;
  globalBackground: string | null;
  clearText: boolean;
};

const CHANNEL_NAME = 'flowshow_presence_channel';

// Mock Data
const MOCK_SONGS = [
  {
    id: 'song1',
    title: 'Amazing Grace',
    slides: [
      { id: 's1-1', text: 'Amazing grace! How sweet the sound', type: 'lyrics' },
      { id: 's1-2', text: 'That saved a wretch like me', type: 'lyrics' },
      { id: 's1-3', text: 'I once was lost, but now am found', type: 'lyrics' },
      { id: 's1-4', text: 'Was blind, but now I see.', type: 'lyrics' },
    ] as SlideDefinition[]
  },
  {
    id: 'song2',
    title: 'How Great Thou Art',
    slides: [
      { id: 's2-1', text: 'O Lord my God, When I in awesome wonder', type: 'lyrics' },
      { id: 's2-2', text: 'Consider all the worlds Thy Hands have made', type: 'lyrics' },
      { id: 's2-3', text: 'I see the stars, I hear the rolling thunder', type: 'lyrics' },
      { id: 's2-4', text: 'Thy power throughout the universe displayed', type: 'lyrics' },
    ] as SlideDefinition[]
  }
];

const MOCK_BIBLES = [
  {
    title: 'Genesis 1',
    slides: [
      { id: 'b1', text: 'In the beginning God created the heaven and the earth.', source: 'Genesis 1:1', type: 'scripture' },
      { id: 'b2', text: 'And the earth was without form, and void; and darkness was upon the face of the deep.', source: 'Genesis 1:2', type: 'scripture' },
    ] as SlideDefinition[]
  },
  {
    title: 'John 3',
    slides: [
      { id: 'b3', text: 'For God so loved the world, that he gave his only begotten Son...', source: 'John 3:16', type: 'scripture' },
    ] as SlideDefinition[]
  }
];

const MOCK_MEDIA = [
  { id: 'm1', url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?q=80&w=1000&auto=format&fit=crop', name: 'Blue Abstract' },
  { id: 'm2', url: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=1000&auto=format&fit=crop', name: 'Dark Particles' },
  { id: 'm3', url: 'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=1000&auto=format&fit=crop', name: 'Space Stars' },
];

function ProjectorWindow({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const extWin = window.open('', '', 'width=1280,height=720,menubar=no,toolbar=no');
    if (!extWin) {
      alert('Please allow popups for this site to open the Projector Window');
      onClose();
      return;
    }

    extWin.document.title = 'Live Projector Display';
    extWin.document.body.style.margin = '0';
    extWin.document.body.style.backgroundColor = 'black';
    extWin.document.body.style.overflow = 'hidden';

    // Clone styles from parent to child
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    styles.forEach(style => {
      extWin.document.head.appendChild(style.cloneNode(true));
    });

    const div = extWin.document.createElement('div');
    div.style.width = '100vw';
    div.style.height = '100vh';
    extWin.document.body.appendChild(div);

    setContainer(div);

    extWin.addEventListener('unload', () => {
      onClose();
    });

    return () => {
      extWin.close();
    };
  }, []);

  return container ? createPortal(children, container) : null;
}

function ControlPanel() {
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'bibles' | 'media' | 'audio'>('songs');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [projectorOpen, setProjectorOpen] = useState(false);
  
  // Songs Data
  const [songsList, setSongsList] = useState(MOCK_SONGS);
  
  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'song'|'bible'|'slide', id: string | number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Bibles Data
  const [bibleList, setBibleList] = useState<{id: string, name: string}[]>([]);
  const [activeBibleId, setActiveBibleId] = useState<string | null>(null);
  const [activeBibleData, setActiveBibleData] = useState<BibleVersion | null>(null);
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleSearchResults, setBibleSearchResults] = useState<SlideDefinition[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeBibleBookIndex, setActiveBibleBookIndex] = useState<number | null>(null);
  const [activeBibleChapterIndex, setActiveBibleChapterIndex] = useState<number | null>(null);
  
  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  
  // Slide operations state
  const [isEditingSong, setIsEditingSong] = useState(false);
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);
  const [editingSlideText, setEditingSlideText] = useState('');
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null,
    globalBackground: MOCK_MEDIA[0].url,
    clearText: false
  });

  // Load bibles list on mount
  useEffect(() => {
    initDatabase().then(() => {
      getBibleList().then(list => {
        setBibleList(list);
        if (list.length > 0) {
          setActiveBibleId(list[0].id);
        }
      });
    });
  }, []);

  // Load actual bible data when selected bible changes
  useEffect(() => {
    if (activeBibleId) {
      getBible(activeBibleId).then(data => {
        if (data) {
          setActiveBibleData(data);
          setActiveBibleBookIndex(0);
          setActiveBibleChapterIndex(0);
        }
      });
    } else {
      setActiveBibleData(null);
      setActiveBibleBookIndex(null);
      setActiveBibleChapterIndex(null);
    }
  }, [activeBibleId]);

  // Sync state to projector when it changes
  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(liveState);
    return () => channel.close();
  }, [liveState]);

  const openProjector = () => {
    setProjectorOpen(true);
  };

  const goLive = (slide: SlideDefinition) => {
    setLiveState(prev => ({ ...prev, slide, clearText: false }));
  };

  const handleVerseDetected = (reference: any) => {
     const bookSearch = reference.book;
     const chapterSearch = reference.chapters[0];
     const verseSearch = reference.verses?.[0]?.[0] || 1;

     const sourceString = `${bookSearch} ${chapterSearch}:${verseSearch}`;
     let foundText = `Finding: ${sourceString}...`;

     if (activeBibleData) {
       // Try to find the actual verse text
       const book = activeBibleData.books.find(b => 
         b.name.toLowerCase() === bookSearch.toLowerCase() || 
         b.name.toLowerCase().startsWith(bookSearch.toLowerCase()) ||
         bookSearch.toLowerCase().startsWith(b.name.toLowerCase())
       );
       if (book) {
         const chapter = book.chapters.find(c => c.c === chapterSearch);
         if (chapter) {
           const verse = chapter.verses.find(v => v.v === verseSearch);
           if (verse) {
             foundText = verse.text;
           } else {
             foundText = `[Verse ${verseSearch} not found in chapter ${chapterSearch}]`;
           }
         } else {
           foundText = `[Chapter ${chapterSearch} not found]`;
         }
       } else {
         foundText = `[Book ${bookSearch} not found in active Bible]`;
       }
     }

     goLive({
       id: `auto-${Date.now()}`,
       type: 'scripture',
       text: foundText,
       source: sourceString
     });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setIsUploading(true);
      const newBible = await parseBibleXml(file);
      await saveBible(newBible);
      
      const list = await getBibleList();
      setBibleList(list);
      setActiveBibleId(newBible.id);
      
    } catch (err) {
      alert("Failed to parse Bible XML. " + err);
    } finally {
      setIsUploading(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'song' | 'bible' | 'slide', id: string | number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const deleteSong = (id: string | number) => {
    let indexToRemove = -1;
    setSongsList(prev => {
      indexToRemove = prev.findIndex(s => s.id === id);
      return prev.filter(s => s.id !== id);
    });
    if (indexToRemove !== -1) {
      setActiveItemIndex(prevIndex => (prevIndex >= indexToRemove && prevIndex > 0 ? prevIndex - 1 : prevIndex));
    }
  };

  const handleDeleteBible = async (id: string) => {
    await deleteBible(id);
    const list = await getBibleList();
    setBibleList(list);
    if (activeBibleId === id) {
       setActiveBibleId(list.length > 0 ? list[0].id : null);
    }
  };

  // Basic verse search (e.g. Genesis 1:1)
  const performBibleSearch = (query: string) => {
    setBibleSearchQuery(query);
    if (!activeBibleData || !query.trim()) {
      setBibleSearchResults([]);
      return;
    }

    // Try parsing something like "Gen 1:1" or "Genesis 1"
    const match = query.match(/^([1-3]?\s*[a-zA-Z]+)\s+(\d+)(?:[:\s]+(\d+))?/);
    if (!match) {
      setBibleSearchResults([]);
      return;
    }

    const bNameQuery = match[1].toLowerCase().trim();
    const cNum = parseInt(match[2], 10);
    const vNum = match[3] ? parseInt(match[3], 10) : null;

    const matchedBook = activeBibleData.books.find(b => b.name.toLowerCase().startsWith(bNameQuery));
    if (!matchedBook) return;

    const matchedChapter = matchedBook.chapters.find(c => c.c === cNum);
    if (!matchedChapter) return;

    let results: SlideDefinition[] = [];
    
    if (vNum !== null) {
      // Find specific verse + next 3 verses just in case
      let startIdx = matchedChapter.verses.findIndex(v => v.v === vNum);
      if (startIdx !== -1) {
        for (let i = startIdx; i < Math.min(startIdx + 5, matchedChapter.verses.length); i++) {
           const v = matchedChapter.verses[i];
           results.push({
             id: `b-${matchedBook.name}-${cNum}-${v.v}`,
             text: v.text,
             source: `${matchedBook.name} ${cNum}:${v.v}`,
             type: 'scripture'
           });
        }
      }
    } else {
      // Show first few verses of the chapter
      results = matchedChapter.verses.slice(0, 10).map(v => ({
             id: `b-${matchedBook.name}-${cNum}-${v.v}`,
             text: v.text,
             source: `${matchedBook.name} ${cNum}:${v.v}`,
             type: 'scripture'
      }));
    }

    setBibleSearchResults(results);
  };

  const setGlobalBackground = (url: string) => {
    setLiveState(prev => ({ ...prev, globalBackground: url }));
  };

  const toggleClearText = () => {
    setLiveState(prev => ({ ...prev, clearText: !prev.clearText }));
  };

  const clearAll = () => {
    setLiveState(prev => ({ ...prev, slide: null, globalBackground: null, clearText: false }));
  };

  // --- Slide Operations for Songs ---
  const handleSaveSlideEdit = (index: number) => {
    if (editingSlideIndex === null || activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    
    setSongsList(prev => {
      const newList = [...prev];
      const song = { ...newList[activeItemIndex] };
      const slides = [...song.slides];
      
      slides[index] = { ...slides[index], text: editingSlideText };
      song.slides = slides;
      newList[activeItemIndex] = song;
      
      return newList;
    });
    
    setEditingSlideIndex(null);
  };

  const handleDuplicateSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    
    setSongsList(prev => {
      const newList = [...prev];
      const song = { ...newList[activeItemIndex] };
      const slides = [...song.slides];
      
      const slideToDuplicate = slides[index];
      const newSlide = { ...slideToDuplicate, id: `slide-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
      
      slides.splice(index + 1, 0, newSlide);
      song.slides = slides;
      newList[activeItemIndex] = song;
      
      return newList;
    });
  };

  const handleDeleteSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    
    setSongsList(prev => {
      const newList = [...prev];
      const song = { ...newList[activeItemIndex] };
      let slides = [...song.slides];
      
      if (slides.length <= 1) {
        // Option to just blank it instead of removing last slide
        slides[index] = { ...slides[index], text: '' };
      } else {
        slides.splice(index, 1);
      }
      
      song.slides = slides;
      newList[activeItemIndex] = song;
      
      return newList;
    });
  };

  const handleDropSlide = (targetIndex: number) => {
    if (draggedSlideIndex === null || draggedSlideIndex === targetIndex || activeTab !== 'songs' || !songsList[activeItemIndex]) {
      setDraggedSlideIndex(null);
      setDragOverSlideIndex(null);
      return;
    }
    
    setSongsList(prev => {
      const newList = [...prev];
      const song = { ...newList[activeItemIndex] };
      const slides = [...song.slides];
      
      const [draggedSlide] = slides.splice(draggedSlideIndex, 1);
      slides.splice(targetIndex, 0, draggedSlide);
      
      song.slides = slides;
      newList[activeItemIndex] = song;
      
      return newList;
    });
    
    setDraggedSlideIndex(null);
    setDragOverSlideIndex(null);
  };

  // Render current workspace slides
  const renderWorkspace = () => {
    let slides: SlideDefinition[] = [];
    if (activeTab === 'songs' && songsList[activeItemIndex]) {
      slides = songsList[activeItemIndex].slides;
    }

    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full bg-[#141414]">
           <div className="flex justify-end p-2 border-b border-neutral-800 shrink-0">
              <div className="relative w-64">
                 <Search size={14} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleSearchQuery}
                   onChange={e => performBibleSearch(e.target.value)}
                   placeholder="Search (e.g. Gen 1:1)" 
                   className="w-full bg-[#1a1a1a] border border-neutral-700 rounded text-sm px-9 py-1.5 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-neutral-600"
                 />
              </div>
           </div>

           {bibleSearchQuery ? (
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                 {bibleSearchResults.length === 0 ? (
                    <div className="text-center text-neutral-500 text-sm mt-10">
                       No verses found for "{bibleSearchQuery}".<br/>
                       Make sure you type book, chapter, and verse correctly.
                    </div>
                 ) : (
                    <div className="flex flex-wrap gap-3">
                       {bibleSearchResults.map((slide, i) => {
                         const isLive = liveState.slide?.id === slide.id;
                         return (
                           <div 
                             key={slide.id}
                             onClick={() => goLive(slide)}
                             className={`w-48 aspect-video rounded-md p-3 cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2
                               ${isLive ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-white'}
                             `}
                           >
                             <p className="text-sm font-medium line-clamp-4 whitespace-pre-wrap leading-tight">{slide.text}</p>
                             {slide.source && <span className="text-xs mt-2 text-blue-300">{slide.source}</span>}
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : (
              <div className="flex flex-1 min-h-0 overflow-hidden">
                 {/* Books Column */}
                 <div className="w-48 border-r border-neutral-800 overflow-y-auto custom-scrollbar shrink-0">
                    {activeBibleData?.books.map((book, idx) => (
                       <button 
                         key={book.name} 
                         onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(null); }}
                         className={`w-full text-left px-4 py-2 text-sm border-b border-neutral-800/30 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-neutral-300 hover:bg-[#2a2a2a]'}`}
                         title={book.name}
                       >
                         {book.name}
                       </button>
                    ))}
                 </div>
                 {/* Chapters Column */}
                 <div className="w-20 border-r border-neutral-800 overflow-y-auto custom-scrollbar shrink-0">
                    {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                       <button
                         key={chapter.c}
                         onClick={() => setActiveBibleChapterIndex(idx)}
                         className={`w-full text-center px-2 py-2 text-sm border-b border-neutral-800/30 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600/20 text-blue-400 font-medium' : 'text-neutral-300 hover:bg-[#2a2a2a]'}`}
                       >
                         {chapter.c}
                       </button>
                    ))}
                 </div>
                 {/* Verses Column */}
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
                    {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map(verse => {
                       const slide: SlideDefinition = {
                          id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`,
                          text: verse.text,
                          source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`,
                          type: 'scripture'
                       };
                       const isLive = liveState.slide?.id === slide.id;

                       return (
                          <div 
                            key={verse.v}
                            onClick={() => goLive(slide)}
                            className={`p-3 rounded-md cursor-pointer border transition-all group ${isLive ? 'bg-blue-600/20 border-blue-500' : 'bg-[#1a1a1a] border-neutral-800 hover:border-neutral-600'}`}
                          >
                             <div className="flex gap-4">
                                <span className={`text-xs font-bold mt-0.5 shrink-0 w-6 text-right ${isLive ? 'text-blue-400' : 'text-neutral-500 group-hover:text-neutral-400'}`}>{verse.v}</span>
                                <p className={`text-sm ${isLive ? 'text-white' : 'text-neutral-300 group-hover:text-white'}`}>{verse.text}</p>
                             </div>
                          </div>
                       );
                    })}
                 </div>
              </div>
           )}
        </div>
      );
    }

    if (activeTab === 'media') {
      return (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_MEDIA.map(media => (
            <div 
              key={media.id}
              onClick={() => setGlobalBackground(media.url)}
              className="relative aspect-video rounded-md overflow-hidden cursor-pointer group border-2 border-transparent hover:border-blue-500"
            >
              <img src={media.url} alt={media.name} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-xs truncate">
                {media.name}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'audio') {
      return (
        <AudioModule onVerseDetected={handleVerseDetected} />
      );
    }

    if (isEditingSong && activeTab === 'songs' && songsList[activeItemIndex]) {
      return (
        <EditSongPage 
          song={songsList[activeItemIndex]}
          initialSlideIndex={editingSlideIndex || 0}
          onSave={(songId, updatedSlides) => {
            setSongsList(prev => {
               const next = [...prev];
               const idx = next.findIndex(s => s.id === songId);
               if (idx !== -1) {
                  next[idx] = { ...next[idx], slides: updatedSlides };
               }
               return next;
            });
          }}
          onClose={() => {
            setIsEditingSong(false);
          }}
        />
      );
    }

    return (
      <div className="flex flex-wrap gap-3">
        {slides.map((slide, i) => {
          const isLive = liveState.slide?.id === slide.id;
          return (
            <div 
              key={slide.id}
              draggable
              onDragStart={(e) => {
                setDraggedSlideIndex(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverSlideIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropSlide(i);
              }}
              onContextMenu={(e) => handleContextMenu(e, 'slide', i)}
              onClick={() => {
                 if (!slide.disabled) goLive(slide);
              }}
              className={`group w-40 aspect-video rounded-md p-3 cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none
                ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''}
                ${isLive ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-white'}
                ${dragOverSlideIndex === i ? 'border-dashed border-blue-400 opacity-70' : ''}
              `}
            >
              <p className="text-sm font-medium line-clamp-4 pointer-events-none whitespace-pre-wrap leading-tight">{slide.text}</p>
              {slide.source && <span className="text-xs mt-2 text-blue-300 pointer-events-none">{slide.source}</span>}
              <div className="absolute bottom-1 right-2 text-[10px] text-neutral-500 pointer-events-none">{i + 1}</div>
              
              {/* Action Bar (Top Right) */}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center bg-black/60 rounded overflow-hidden transition-opacity">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingSong(true);
                    setEditingSlideIndex(i);
                    setEditingSlideText(slide.text);
                  }}
                  className="p-1 hover:bg-white/20 text-neutral-300 hover:text-white"
                  title="Edit"
                >
                  <Edit2 size={12} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicateSlide(i);
                  }}
                  className="p-1 hover:bg-white/20 text-neutral-300 hover:text-white"
                  title="Duplicate"
                >
                  <Copy size={12} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSlide(i);
                  }}
                  className="p-1 hover:bg-red-500/50 text-neutral-300 hover:text-white"
                  title="Delete"
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-neutral-200 overflow-hidden font-sans select-none">
      
      {/* Main App Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header/Toolbar */}
        <header className="h-12 bg-[#1a1a1a] border-b border-neutral-800 flex items-center justify-between px-4">
          <div className="flex items-center space-x-4">
            <span className="font-semibold text-neutral-100 uppercase tracking-widest text-sm flex items-center gap-2">
              <Layers size={18} className="text-blue-500" />
              FlowShow
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {/* Quick Clear Controls in top bar like Freeshow */}
            <div className="flex bg-[#252525] rounded border border-neutral-800 overflow-hidden mr-4">
              <button 
                onClick={toggleClearText} 
                className={`px-3 py-1 text-sm border-r border-neutral-800 hover:bg-neutral-700 flex items-center gap-2 transition-colors ${liveState.clearText ? 'bg-red-500/20 text-red-400' : ''}`}
                title="Clear Text"
              >
                <EyeOff size={14} /> Text
              </button>
              <button 
                onClick={() => setGlobalBackground(null)} 
                className="px-3 py-1 text-sm border-r border-neutral-800 hover:bg-neutral-700 flex items-center gap-2"
                title="Clear Background"
              >
                <MonitorOff size={14} /> BG
              </button>
              <button 
                onClick={clearAll} 
                className="px-3 py-1 text-sm hover:bg-red-900/50 hover:text-red-300 transition-colors flex items-center gap-2"
                title="Clear All"
              >
                <X size={14} /> All
              </button>
            </div>
            
            <button 
              onClick={openProjector}
              className="flex items-center space-x-2 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors shadow-sm font-medium"
            >
              <MonitorUp size={16} />
              <span>Project Output</span>
            </button>
          </div>
        </header>

        {/* Multi-Row Layout: Previews Top, Content Bottom */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Top Row: Preview & Live Displays */}
          <div className="h-48 lg:h-64 bg-[#141414] border-b border-neutral-800 flex items-center justify-center gap-8 lg:gap-16 shrink-0 p-4 shadow-sm z-10 pb-6">
             {/* Preview (Next) */}
             <div className="flex flex-col h-full aspect-video">
               <div className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Preview (Next)</div>
               <div className="flex-1 relative bg-[#1a1a1a] rounded-lg border border-neutral-800 overflow-hidden flex items-center justify-center shadow-inner">
                 <span className="text-neutral-600 text-sm font-medium">Select a slide...</span>
               </div>
             </div>

             {/* Live Panel */}
             <div className="flex flex-col h-full aspect-video">
               <div className="mb-2 flex justify-between items-center">
                 <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Live Output</span>
                 <div className={`h-2 w-2 rounded-full ${liveState.slide || liveState.globalBackground ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]' : 'bg-neutral-700'}`}></div>
               </div>
               <div className="flex-1 relative bg-black rounded-lg border border-neutral-600 overflow-hidden shadow-2xl ring-1 ring-black ring-opacity-50">
                 {/* Background */}
                 {liveState.globalBackground && (
                    <img 
                       src={liveState.globalBackground} 
                       className="absolute inset-0 w-full h-full object-cover opacity-60"
                       alt="Live BG"
                     />
                 )}
                 {/* Text Layer */}
                 {!liveState.clearText && liveState.slide && (
                   <div className="absolute inset-0 z-10 flex">
                     <SmartTextLayout 
                       text={liveState.slide.text}
                       source={liveState.slide.source}
                       type={liveState.slide.type}
                       styleOverrides={liveState.slide.styleOverrides}
                     />
                   </div>
                 )}
                 
                 {/* Placeholder if empty */}
                 {!liveState.globalBackground && (!liveState.slide || liveState.clearText) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
                      <span className="text-neutral-700 font-bold tracking-widest uppercase text-3xl">Black</span>
                    </div>
                 )}
               </div>
             </div>
          </div>

          {/* Horizontal Navigation Bar */}
          <div className="bg-[#141414] border-b border-neutral-800 flex items-center px-4 py-2 space-x-2 shrink-0 z-10 overflow-x-auto custom-scrollbar">
            <button 
              onClick={() => setActiveTab('shows')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'shows' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-[#252525] border border-transparent'}`}
              title="Shows"
            >
              <LayoutTemplate size={18} />
              <span className="text-sm font-medium">Shows</span>
            </button>
            <button 
              onClick={() => setActiveTab('songs')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'songs' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-[#252525] border border-transparent'}`}
              title="Songs"
            >
              <Music size={18} />
              <span className="text-sm font-medium">Songs</span>
            </button>
            <button 
              onClick={() => setActiveTab('bibles')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'bibles' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-[#252525] border border-transparent'}`}
              title="Bibles"
            >
              <BookOpen size={18} />
              <span className="text-sm font-medium">Bibles</span>
            </button>
            <button 
              onClick={() => setActiveTab('media')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap ${activeTab === 'media' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-[#252525] border border-transparent'}`}
              title="Media"
            >
              <ImageIcon size={18} />
              <span className="text-sm font-medium">Media</span>
            </button>
            
            <div className="w-px h-6 bg-neutral-800 mx-2 shrink-0"></div>
            
            <button 
              onClick={() => setActiveTab('audio')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors relative whitespace-nowrap ${activeTab === 'audio' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-[#252525] border border-transparent'}`}
              title="Audio Detection"
            >
              <Mic size={18} />
              <span className="text-sm font-medium">Transcriber</span>
            </button>
            
            <div className="flex-grow"></div>
            
            <button className="px-3 py-2 text-neutral-400 hover:text-white hover:bg-[#252525] rounded-lg transition-colors flex items-center gap-2 border border-transparent shrink-0" title="Settings">
              <Settings size={18} />
              <span className="text-sm font-medium">Settings</span>
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
          
          {/* List Panel (Left) */}
          <div className="w-64 bg-[#1a1a1a] border-r border-neutral-800 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-neutral-800">
               <div className="relative">
                 <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   placeholder={`Search ${activeTab}...`} 
                   className="w-full bg-[#252525] border border-neutral-700 rounded text-sm px-8 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                 />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto relative">
              {activeTab === 'songs' && songsList.map((song, i) => (
                <div 
                  key={song.id}
                  onContextMenu={(e) => handleContextMenu(e, 'song', song.id)}
                  onClick={() => setActiveItemIndex(i)}
                  className={`group relative px-4 py-3 cursor-pointer border-b border-neutral-800/50 flex items-center transition-colors ${activeItemIndex === i ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : 'hover:bg-[#252525] border-l-2 border-l-transparent'}`}
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                     <FileText size={16} className="text-neutral-500 shrink-0" />
                     <span className="text-sm font-medium truncate">{song.title}</span>
                  </div>
                </div>
              ))}
              {activeTab === 'songs' && (
                <button
                  onClick={() => setIsAddSongModalOpen(true)}
                  className="absolute bottom-4 right-4 w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-900/20 transition-all hover:scale-105"
                  title="Add New Song"
                >
                  <Plus size={24} />
                </button>
              )}
               {activeTab === 'bibles' && (
                 <div className="flex flex-col h-full">
                    <div className="p-3 border-b border-neutral-800">
                       <label className="flex items-center justify-center gap-2 w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-sm py-2 rounded border border-blue-500/30 cursor-pointer transition-colors">
                          {isUploading ? <Activity size={14} className="animate-spin" /> : <Upload size={14} />}
                          {isUploading ? 'Parsing XML...' : 'Import XML Bible'}
                          <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                       </label>
                    </div>
                    {bibleList.length === 0 ? (
                       <div className="p-6 text-center text-sm text-neutral-500">
                          No Bibles imported.<br/>Upload a Zefania or OpenSong XML file.
                       </div>
                    ) : (
                       bibleList.map((bible) => (
                        <div 
                          key={bible.id}
                          onContextMenu={(e) => handleContextMenu(e, 'bible', bible.id)}
                          onClick={() => setActiveBibleId(bible.id)}
                          className={`group relative px-4 py-3 cursor-pointer border-b border-neutral-800/50 flex items-center transition-colors ${activeBibleId === bible.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : 'hover:bg-[#252525] border-l-2 border-l-transparent'}`}
                        >
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                             <BookOpen size={16} className="text-neutral-500 shrink-0" />
                             <span className="text-sm font-medium truncate">{bible.name}</span>
                          </div>
                        </div>
                      ))
                    )}
                 </div>
              )}
            </div>
          </div>

          {/* Workspace Panel (Middle) */}
          <div className="flex-1 flex flex-col bg-[#141414] overflow-hidden min-w-0">
            <div className="h-10 px-4 bg-[#1a1a1a] border-b border-neutral-800 flex items-center justify-between shadow-sm z-10 shrink-0">
               <span className="text-sm font-semibold capitalize text-neutral-300 flex items-center gap-2">
                 {activeTab === 'songs' && songsList[activeItemIndex]?.title}
                 {activeTab === 'bibles' && activeBibleData ? `Bible: ${activeBibleData.name}` : ''}
                 {activeTab === 'bibles' && !activeBibleData ? `Bibles` : ''}
                 {activeTab === 'media' && 'Media Library'}
                 {activeTab === 'audio' && 'Live Audio Transcriber'}
                 
                 {activeTab === 'bibles' && isUploading && <Activity size={14} className="animate-spin text-blue-500" />}
               </span>
               <div className="flex space-x-1 text-neutral-500">
                 <button className="p-1 hover:text-white hover:bg-neutral-800 rounded"><List size={16} /></button>
                 <button className="p-1 hover:text-white hover:bg-neutral-800 rounded"><Grid size={16} /></button>
               </div>
            </div>
            <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'bibles' ? '' : 'p-4 overflow-y-auto'} custom-scrollbar`}>
              {renderWorkspace()}
            </div>
          </div>

          </div>

        </div>
      </div>
      {projectorOpen && (
        <ProjectorWindow onClose={() => setProjectorOpen(false)}>
          <ProjectorView />
        </ProjectorWindow>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#252525] border border-neutral-700 rounded shadow-lg overflow-hidden py-1 w-40"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'slide' ? (
             <>
               <button
                 className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2"
                 onClick={() => {
                   setIsEditingSong(true);
                   setEditingSlideIndex(contextMenu.id as number);
                   setEditingSlideText(songsList[activeItemIndex].slides[contextMenu.id as number].text);
                   setContextMenu(null);
                 }}
               >
                 <Edit2 size={14}/> Edit
               </button>
               <button
                 className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2"
                 onClick={() => {
                   handleDuplicateSlide(contextMenu.id as number);
                   setContextMenu(null);
                 }}
               >
                 <Copy size={14}/> Duplicate
               </button>
               <button
                 className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-500 text-sm transition-colors flex items-center gap-2"
                 onClick={() => {
                   handleDeleteSlide(contextMenu.id as number);
                   setContextMenu(null);
                 }}
               >
                 <Trash size={14}/> Delete
               </button>
             </>
          ) : (
            <button
              className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-500 text-sm transition-colors"
              onClick={() => {
                if (contextMenu.type === 'song') {
                  deleteSong(contextMenu.id);
                } else if (contextMenu.type === 'bible') {
                  handleDeleteBible(contextMenu.id as string);
                }
                setContextMenu(null);
              }}
            >
              Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}
            </button>
          )}
        </div>
      )}

      <AddSongModal 
        isOpen={isAddSongModalOpen} 
        onClose={() => setIsAddSongModalOpen(false)} 
        onAddSong={(newSong) => {
          setSongsList(prev => [...prev, newSong]);
          setActiveTab('songs');
          setActiveItemIndex(songsList.length);
        }} 
      />
    </div>
  );
}

function ProjectorView() {
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null,
    globalBackground: null,
    clearText: false
  });

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
    
    channel.onmessage = (event) => {
      if (event.data && !event.data.type?.startsWith('REQUEST_')) {
         setLiveState(event.data);
      }
    };
    return () => channel.close();
  }, []);

  return (
    <div className="w-screen h-screen bg-black flex flex-col items-center justify-center overflow-hidden relative cursor-none select-none">
      {liveState.globalBackground && (
        <img 
          src={liveState.globalBackground} 
          className="absolute inset-0 w-full h-full object-cover opacity-80 transition-opacity duration-500 ease-in-out"
          alt="bg"
        />
      )}
      
      {!liveState.clearText && liveState.slide && (
         <SmartTextLayout 
            text={liveState.slide.text}
            source={liveState.slide.source}
            type={liveState.slide.type}
            styleOverrides={liveState.slide.styleOverrides}
            className="relative z-10 w-full h-full animate-in fade-in duration-300"
         />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ControlPanel />} />
        <Route path="/projector" element={<ProjectorView />} />
      </Routes>
    </BrowserRouter>
  );
}

