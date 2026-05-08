import React, { useState } from 'react';
import { X, Search, Activity } from 'lucide-react';
import { SlideDefinition } from '../App';

type AddSongModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: { id: string, title: string, slides: SlideDefinition[] }) => void;
};

export function AddSongModal({ isOpen, onClose, onAddSong }: AddSongModalProps) {
  const [title, setTitle] = useState('');
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

  const processLyricsToSlides = (text: string) => {
    // Normalize newlines to \n, remove carriage returns
    const normalizedText = text.replace(/\r\n/g, '\n');
    
    // Split lyrics by empty lines to find stanzas
    const stanzas = normalizedText.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 0);
    
    const slides: SlideDefinition[] = [];
    let globalSlideIndex = 0;
    
    for (const stanza of stanzas) {
      // Split stanza into lines
      const rawLines = stanza.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Keep headers like [Chorus] out of the final slides if they are the only thing
      // Better yet, just filter out lines that start with [ and end with ]
      const lines = rawLines.filter(l => !(l.startsWith('[') && l.endsWith(']')));
      
      if (lines.length === 0) continue;
      
      for (let i = 0; i < lines.length; i += linesPerSlide) {
        const chunk = lines.slice(i, i + linesPerSlide);
        slides.push({
          id: `slide-${Date.now()}-${globalSlideIndex++}`,
          text: chunk.join('\n'),
          type: 'lyrics'
        });
      }
    }
    
    return slides;
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    let textToProcess = '';
    
    if (method === 'quick') {
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
      slides: processLyricsToSlides(textToProcess)
    };
    
    onAddSong(newSong);
    handleClose();
  };

  const handleClose = () => {
    setTitle('');
    setLyrics('');
    setMethod('quick');
    setLinesPerSlide(2);
    setSearchResults([]);
    setSelectedResult(null);
    setIsSearching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-[#1e1e1e]">
          <h2 className="text-lg font-semibold text-white">Add New Song</h2>
          <button onClick={handleClose} className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-[#2a2a2a] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Song Title</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amazing Grace"
              className="w-full bg-[#252525] border border-neutral-700 rounded-lg text-sm px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Methods */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Input Method</label>
            <div className="flex bg-[#252525] rounded-lg p-1 border border-neutral-700">
              <button 
                onClick={() => setMethod('quick')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${method === 'quick' ? 'bg-[#333] text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                Quick Lyrics
              </button>
              <button 
                onClick={() => setMethod('web')}
                className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors ${method === 'web' ? 'bg-[#333] text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                Web Search
              </button>
            </div>
          </div>

          {/* Lines per slide */}
          <div className="flex items-center space-x-4 bg-[#252525] rounded-lg p-3 border border-neutral-700">
            <label className="text-sm font-medium text-neutral-300 flex-1">Max Lines Per Slide</label>
            <div className="flex items-center space-x-3">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={linesPerSlide} 
                onChange={(e) => setLinesPerSlide(parseInt(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-sm font-mono bg-[#1a1a1a] px-2 py-1 rounded border border-neutral-800 min-w-[28px] text-center text-white">
                {linesPerSlide}
              </span>
            </div>
          </div>

          {/* Dynamic Content area */}
          {method === 'quick' ? (
            <div className="flex flex-col flex-1">
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Lyrics</label>
              <textarea 
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste lyrics here..."
                className="w-full h-48 bg-[#252525] border border-neutral-700 rounded-lg text-sm px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none font-mono"
              />
            </div>
          ) : (
            <div className="flex flex-col space-y-3">
              <button 
                onClick={handleSearch}
                disabled={!title.trim() || isSearching}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#252525] hover:bg-[#333] border border-neutral-700 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? <Activity size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>

              {searchResults.length > 0 && (
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto pr-1">
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Results</label>
                  {searchResults.map(result => (
                    <div 
                      key={result.id}
                      onClick={() => setSelectedResult(result)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedResult?.id === result.id ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-[#252525] border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
                    >
                      <div className="font-medium text-sm truncate">{result.name}</div>
                      <div className="text-xs text-neutral-500 mt-1 truncate">{result.artistName} {result.albumName ? `• ${result.albumName}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
              
              {selectedResult && !selectedResult.plainLyrics && (
                <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">
                  This song does not have lyrics available.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#1e1e1e] flex justify-end gap-3">
          <button 
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 hover:text-white hover:bg-[#2a2a2a] transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={
              !title.trim() || 
              (method === 'quick' && !lyrics.trim()) || 
              (method === 'web' && (!selectedResult || !selectedResult.plainLyrics))
            }
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-900/20"
          >
            Add Song
          </button>
        </div>
      </div>
    </div>
  );
}
