import React, { useState } from 'react';
import { X, Search, Activity } from 'lucide-react';
import { SlideDefinition } from '../App';
import { lyricsToSections } from '../lib/slideGroups';

/** A show is a Song or a Declaration (each kind uses its own template) */
export type ShowCategory = 'Songs' | 'Declarations';
export const SHOW_CATEGORIES: { value: ShowCategory; label: string; hint: string }[] = [
  { value: 'Songs', label: 'Song', hint: 'Song slides use the lyrics template of the screens’ styles.' },
  { value: 'Declarations', label: 'Declaration', hint: 'Declaration slides use the Declarations template of the screens’ styles.' },
];

type AddSongModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: { id: string, title: string, slides: SlideDefinition[], category: ShowCategory }) => void;
};

export function AddSongModal({ isOpen, onClose, onAddSong }: AddSongModalProps) {
  const [title, setTitle] = useState('');
  // No category until one is chosen: every show has to say what it is
  const [category, setCategory] = useState<ShowCategory | null>(null);
  const isSong = category === 'Songs';
  const [method, setMethod] = useState<'quick' | 'web'>('quick');
  const [lyrics, setLyrics] = useState('');
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any | null>(null);
  
  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    setSelectedResult(null);
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(title)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  // Stanzas become slides with groups (labels like [Chorus] are read, repeats found, CCLI lines left out)
  const processLyricsToSlides = (text: string): SlideDefinition[] =>
    lyricsToSections(text, linesPerSlide).map((s, i) => ({
      id: `slide-${Date.now()}-${i}`,
      text: s.text,
      type: 'lyrics' as const,
      ...(category === 'Songs' && s.group ? { group: s.group } : {}),
    }));

  const handleSubmit = () => {
    if (!title.trim() || !category) return;
    let textToProcess = '';
    
    if (method === 'quick' || !isSong) {
      textToProcess = lyrics;
    } else {
      if (!selectedResult || !selectedResult.plainLyrics) {
         // Fallback if they didn't select or song has no lyrics
         return;
      }
      textToProcess = selectedResult.plainLyrics;
    }
    
    const newSong = {
      id: `song-${Date.now()}`,
      title: title.trim(),
      slides: processLyricsToSlides(textToProcess),
      category,
    };
    
    onAddSong(newSong);
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setCategory(null);
    setLyrics('');
    setMethod('quick');
    setLinesPerSlide(2);
    setSearchResults([]);
    setSelectedResult(null);
    setIsSearching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#09090B] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#09090B]">
          <h2 className="text-lg font-bold text-white tracking-tight">New Show</h2>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Category: every show is a Song or a Declaration (chosen here, changed later by right-click) */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Category</label>
            <div className="flex bg-[#030303] rounded-lg p-1.5 border border-white/5 shadow-inner" data-show-category>
              {SHOW_CATEGORIES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  data-show-category-choice={value}
                  className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${category === value ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className={`text-[11px] mt-1.5 pl-1 ${category ? 'text-neutral-500' : 'text-amber-300/90'}`}>{category ? SHOW_CATEGORIES.find(c => c.value === category)!.hint : 'Choose what this show is: each kind uses its own template.'}</p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">{category === 'Declarations' ? 'Declaration Title' : 'Song Title'}</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isSong ? 'e.g. Amazing Grace' : 'e.g. Our Confession of Faith'}
              className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all font-medium"
            />
          </div>

          {/* Methods (the lyrics web search is for songs) */}
          {isSong && <div>
            <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Input Method</label>
            <div className="flex bg-[#030303] rounded-lg p-1.5 border border-white/5 shadow-inner">
              <button 
                onClick={() => setMethod('quick')}
                className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${method === 'quick' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
              >
                Quick Lyrics
              </button>
              <button 
                onClick={() => setMethod('web')}
                className={`flex-1 text-sm font-semibold py-2 rounded-md transition-all ${method === 'web' ? 'bg-white/10 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'}`}
              >
                Web Search
              </button>
            </div>
          </div>}

          {/* Lines per slide */}
          <div className="flex items-center space-x-4 bg-[#030303] rounded-xl p-4 border border-white/5">
            <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex-1">Max Lines Per Slide</label>
            <div className="flex items-center space-x-3">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={linesPerSlide} 
                onChange={(e) => setLinesPerSlide(parseInt(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-sm font-bold bg-[#121214] px-3 py-1.5 rounded-lg border border-white/5 min-w-[36px] text-center text-white">
                {linesPerSlide}
              </span>
            </div>
          </div>

          {/* Dynamic Content area */}
          {method === 'quick' || !isSong ? (
            <div className="flex flex-col flex-1">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">{isSong ? 'Lyrics' : 'Words'}</label>
              <textarea 
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={isSong ? 'Paste lyrics here...' : 'Type or paste the declaration. A blank line starts a new slide.'}
                className="w-full h-48 bg-white/5 border border-white/10 rounded-lg text-sm px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all resize-none leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex flex-col space-y-4">
              <button 
                onClick={handleSearch}
                disabled={!title.trim() || isSearching}
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-sm font-bold text-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div> : <Search size={16} />}
                {isSearching ? 'Searching...' : 'Search Setlist / SongSelect'}
              </button>

              {searchResults.length > 0 && (
                <div className="space-y-2 mt-4 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1 mb-2">Results</label>
                  {searchResults.map(result => (
                    <div 
                      key={result.id}
                      onClick={() => setSelectedResult(result)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedResult?.id === result.id ? 'bg-blue-600/20 border-blue-500/50 shadow-inner' : 'bg-[#030303] border-white/5 hover:border-white/20 hover:bg-white/5 shadow-sm'}`}
                    >
                      <div className="font-bold text-sm text-white tracking-tight truncate">{result.name}</div>
                      <div className="text-xs font-medium text-neutral-400 mt-1.5 truncate">{result.artistName} {result.albumName ? `• ${result.albumName}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedResult && !selectedResult.plainLyrics && (
                <div className="text-xs text-red-400 font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                  This song does not have lyrics available.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 bg-[#09090B] flex justify-end gap-3">
          <button 
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            title={category ? undefined : 'Choose a category first'}
            data-show-create
            disabled={
              !category ||
              !title.trim() || 
              ((method === 'quick' || !isSong) && !lyrics.trim()) || 
              (isSong && method === 'web' && (!selectedResult || !selectedResult.plainLyrics))
            }
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isSong ? 'Add Song' : 'Add Declaration'}
          </button>
        </div>
      </div>
    </div>
  );
}
