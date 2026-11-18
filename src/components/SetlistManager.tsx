import React, { useState } from 'react';
import { 
  ListOrdered, Plus, Trash2, ChevronUp, ChevronDown, Music, BookOpen, 
  Image as ImageIcon, Sparkles, Check, X, GripVertical, Calendar, 
  Clock, Play, Eye, Layers, Search
} from 'lucide-react';
import { ServiceSetlist, SetlistItem } from '../lib/setlist';
import { SlideDefinition } from '../App';

interface SetlistManagerProps {
  setlist: ServiceSetlist;
  onUpdateSetlist: (setlist: ServiceSetlist) => void;
  activeItemId: string | null;
  onSelectItem: (item: SetlistItem) => void;
  availableSongs: Array<{ id: string; title: string; slides: SlideDefinition[] }>;
  onGoLive?: (slide: SlideDefinition) => void;
}

export function SetlistManager({
  setlist,
  onUpdateSetlist,
  activeItemId,
  onSelectItem,
  availableSongs,
  onGoLive
}: SetlistManagerProps) {
  const [isAddingHeader, setIsAddingHeader] = useState(false);
  const [headerTitle, setHeaderTitle] = useState('');
  const [headerColor, setHeaderColor] = useState('#3b82f6');
  
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [songSearch, setSongSearch] = useState('');

  const [isAddingScripture, setIsAddingScripture] = useState(false);
  const [scriptureRef, setScriptureRef] = useState('');
  const [scriptureText, setScriptureText] = useState('');

  const HEADER_COLORS = [
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Cyan', value: '#06b6d4' }
  ];

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= setlist.items.length) return;
    const newItems = [...setlist.items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    onUpdateSetlist({ ...setlist, items: newItems });
  };

  const removeItem = (index: number) => {
    const newItems = setlist.items.filter((_, i) => i !== index);
    onUpdateSetlist({ ...setlist, items: newItems });
  };

  const addHeader = () => {
    if (!headerTitle.trim()) return;
    const newItem: SetlistItem = {
      id: `header-${Date.now()}`,
      type: 'header',
      title: headerTitle.trim(),
      headerColor
    };
    onUpdateSetlist({ ...setlist, items: [...setlist.items, newItem] });
    setHeaderTitle('');
    setIsAddingHeader(false);
  };

  const addSongToSetlist = (song: { id: string; title: string; slides: SlideDefinition[] }) => {
    const newItem: SetlistItem = {
      id: `setlist-song-${Date.now()}`,
      type: 'song',
      title: song.title,
      subtitle: `${song.slides.length} Slides`,
      songId: song.id,
      slides: song.slides
    };
    onUpdateSetlist({ ...setlist, items: [...setlist.items, newItem] });
    setIsAddingSong(false);
    setSongSearch('');
    onSelectItem(newItem);
  };

  const addScriptureToSetlist = () => {
    if (!scriptureRef.trim() || !scriptureText.trim()) return;
    const slides: SlideDefinition[] = [
      {
        id: `scrip-${Date.now()}`,
        type: 'scripture',
        text: scriptureText.trim(),
        source: scriptureRef.trim()
      }
    ];
    const newItem: SetlistItem = {
      id: `setlist-scrip-${Date.now()}`,
      type: 'scripture',
      title: scriptureRef.trim(),
      subtitle: 'Scripture Reading',
      slides
    };
    onUpdateSetlist({ ...setlist, items: [...setlist.items, newItem] });
    setScriptureRef('');
    setScriptureText('');
    setIsAddingScripture(false);
    onSelectItem(newItem);
  };

  const filteredSongs = availableSongs.filter(s => 
    s.title.toLowerCase().includes(songSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#09090B]">
      {/* Setlist Header */}
      <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <ListOrdered size={18} />
          </div>
          <div>
            <input 
              type="text" 
              value={setlist.name} 
              onChange={(e) => onUpdateSetlist({ ...setlist, name: e.target.value })}
              className="bg-transparent text-white font-bold text-base outline-none focus:border-b border-blue-500 transition-all hover:bg-white/5 px-1 py-0.5 rounded"
            />
            <span className="text-xs text-neutral-500 block px-1">{setlist.date || 'Today'} • {setlist.items.filter(i => i.type !== 'header').length} Items</span>
          </div>
        </div>

        {/* Add Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddingHeader(true)}
            className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5 transition-all font-medium"
          >
            <Plus size={13} />
            Section Header
          </button>
          <button
            onClick={() => setIsAddingSong(true)}
            className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/30 flex items-center gap-1.5 transition-all font-medium"
          >
            <Music size={13} />
            + Song
          </button>
          <button
            onClick={() => setIsAddingScripture(true)}
            className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/30 flex items-center gap-1.5 transition-all font-medium"
          >
            <BookOpen size={13} />
            + Scripture
          </button>
        </div>
      </div>

      {/* Main Setlist Queue */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {setlist.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-4 text-neutral-400">
              <ListOrdered size={36} />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Service Order is Empty</h3>
            <p className="text-sm text-neutral-400 mb-6">Build your Sunday service timeline with worship songs, scripture readings, media cues, and section headers.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button 
                onClick={() => setIsAddingHeader(true)}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
              >
                + Section Header
              </button>
              <button 
                onClick={() => setIsAddingSong(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
              >
                + Add First Song
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            {setlist.items.map((item, index) => {
              const isActive = activeItemId === item.id;

              if (item.type === 'header') {
                return (
                  <div 
                    key={item.id}
                    className="mt-4 mb-2 flex items-center justify-between group py-1 border-b border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-2.5 h-6 rounded-full" 
                        style={{ backgroundColor: item.headerColor || '#3b82f6' }}
                      />
                      <span className="font-bold text-sm tracking-widest uppercase text-white/90">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveItem(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-20"
                        title="Move Up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button 
                        onClick={() => moveItem(index, 'down')}
                        disabled={index === setlist.items.length - 1}
                        className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-20"
                        title="Move Down"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button 
                        onClick={() => removeItem(index)}
                        className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400 ml-1"
                        title="Delete Header"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className={`group p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isActive
                      ? 'bg-blue-600/15 border-blue-500 text-white shadow-lg shadow-blue-900/20'
                      : 'bg-[#121214] border-white/5 hover:border-white/20 text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-xs font-mono font-bold text-neutral-500 w-6">
                      {index + 1 < 10 ? `0${index + 1}` : index + 1}
                    </span>

                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      item.type === 'song' ? 'bg-blue-500/20 text-blue-400' :
                      item.type === 'scripture' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {item.type === 'song' && <Music size={16} />}
                      {item.type === 'scripture' && <BookOpen size={16} />}
                      {item.type === 'media' && <ImageIcon size={16} />}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-white truncate">{item.title}</h4>
                      <p className="text-xs text-neutral-400 truncate">{item.subtitle || `${item.slides?.length || 0} Slides`}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Slide preview count pill */}
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-400">
                      {item.slides?.length || 0} SLIDES
                    </span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'up'); }}
                        disabled={index === 0}
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-20"
                        title="Move Up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); moveItem(index, 'down'); }}
                        disabled={index === setlist.items.length - 1}
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-20"
                        title="Move Down"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeItem(index); }}
                        className="p-1.5 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-400"
                        title="Remove from Service"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: ADD HEADER */}
      {isAddingHeader && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Add Section Header</h3>
            
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Section Title
            </label>
            <input 
              type="text"
              autoFocus
              placeholder="e.g., Praise & Worship, Sermon, Communion"
              value={headerTitle}
              onChange={(e) => setHeaderTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHeader()}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500 mb-4"
            />

            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Color Accent
            </label>
            <div className="flex gap-2 mb-6">
              {HEADER_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setHeaderColor(c.value)}
                  className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center ${
                    headerColor === c.value ? 'scale-110 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value }}
                >
                  {headerColor === c.value && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddingHeader(false)}
                className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/5 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addHeader}
                disabled={!headerTitle.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold transition-all shadow-md"
              >
                Add Section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD SONG */}
      {isAddingSong && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Music size={18} className="text-blue-400" />
                Add Song to Service
              </h3>
              <button onClick={() => setIsAddingSong(false)} className="text-neutral-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-3 text-neutral-500" />
              <input 
                type="text"
                autoFocus
                placeholder="Search song library..."
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 min-h-[200px]">
              {filteredSongs.length === 0 ? (
                <div className="p-6 text-center text-sm text-neutral-500">No matching songs in library.</div>
              ) : (
                filteredSongs.map(song => (
                  <div
                    key={song.id}
                    onClick={() => addSongToSetlist(song)}
                    className="p-3 rounded-lg border border-white/5 bg-[#09090B] hover:border-blue-500/40 hover:bg-blue-600/10 cursor-pointer flex items-center justify-between transition-all group"
                  >
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                        {song.title}
                      </h4>
                      <p className="text-xs text-neutral-500">{song.slides.length} Slides</p>
                    </div>
                    <button className="text-xs bg-white/5 group-hover:bg-blue-600 text-neutral-300 group-hover:text-white px-3 py-1.5 rounded font-bold transition-all">
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD SCRIPTURE */}
      {isAddingScripture && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <BookOpen size={18} className="text-emerald-400" />
              Add Scripture Reading
            </h3>

            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Scripture Reference
            </label>
            <input 
              type="text"
              autoFocus
              placeholder="e.g., John 3:16-17, Psalm 23"
              value={scriptureRef}
              onChange={(e) => setScriptureRef(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-emerald-500 mb-4"
            />

            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400 block mb-2">
              Scripture Text
            </label>
            <textarea 
              rows={4}
              placeholder="Enter or paste the Scripture verses..."
              value={scriptureText}
              onChange={(e) => setScriptureText(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm outline-none focus:border-emerald-500 mb-6 custom-scrollbar resize-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddingScripture(false)}
                className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/5 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addScriptureToSetlist}
                disabled={!scriptureRef.trim() || !scriptureText.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold transition-all shadow-md"
              >
                Add Scripture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
