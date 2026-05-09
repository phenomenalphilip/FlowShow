import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, 
  Plus, Search, List, Grid, X, LayoutTemplate, Layers, Play,
  SquareSquare, MonitorOff, MonitorUp, EyeOff, FileText,
  Activity, Upload, ExternalLink, Edit2, Copy, Trash, GripVertical, Split,
  Pause, Volume2, VolumeX, Save, ChevronDown, ExternalLink as LaunchIcon
} from 'lucide-react';

function formatTime(seconds: number) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

import { MediaLibrary } from './components/MediaLibrary';
import { AudioModule } from './components/AudioModule';
import { AddSongModal } from './components/AddSongModal';
import { EditSongPage } from './components/EditSongPage';
import { get, set } from 'idb-keyval';
import { SmartTextLayout } from './components/SmartTextLayout';
import { FixedStage } from './components/FixedStage';
import { BibleVersion, getBibleList, getBible, saveBible, deleteBible, initDatabase } from './lib/bibleDb';
import { parseBibleXml } from './lib/xmlParser';

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

export interface OutputSettings {
  id: string;
  name: string;
  enabled: boolean;
  defaultBackground: { url?: string; color?: string; type: 'image' | 'video' | 'color' | 'none', fileName?: string } | null;
  lyricsStyleEnabled: boolean;
  lyricsStyle: React.CSSProperties;
  bibleStyleEnabled: boolean;
  bibleStyle: React.CSSProperties;
}

export interface GlobalSettings {
  outputs: OutputSettings[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  outputs: [
    {
      id: 'main',
      name: 'Main Output',
      enabled: true,
      defaultBackground: null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' }
    },
    {
      id: 'livestream',
      name: 'Livestream',
      enabled: false,
      defaultBackground: null,
      lyricsStyleEnabled: true,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal', textShadow: '2px 2px 4px #000000' },
      bibleStyleEnabled: true,
      bibleStyle: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal', textShadow: '2px 2px 4px #000000' }
    },
    {
      id: 'stage',
      name: 'Stage Display',
      enabled: false,
      defaultBackground: { type: 'color', color: '#000000' },
      lyricsStyleEnabled: true,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: true,
      bibleStyle: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' }
    }
  ]
};

export type PresentState = {
  slide: SlideDefinition | null;
  globalBackground: { url: string; type: 'image' | 'video', fileName?: string } | null;
  clearText: boolean;
  clearedOutputs?: Record<string, boolean>; 
  lockedOutputs?: Record<string, boolean>; 
  frozenStates?: Record<string, { slide: SlideDefinition | null; bg: any; clearText: boolean }>; 
  videoInitState?: {
    time: number;
    muted: boolean;
    playing: boolean;
  };
  settings?: GlobalSettings;
  isPresenting?: boolean;
};

const CHANNEL_NAME = 'flowshow_presence_channel';

const applyGlobalStyles = (slide: SlideDefinition | null, outputConfig?: OutputSettings) => {
  if (!slide) return undefined;
  if (!outputConfig) return slide.styleOverrides;

  if (slide.type === 'lyrics' && outputConfig.lyricsStyleEnabled) {
     return { ...slide.styleOverrides, global: { ...slide.styleOverrides?.global, ...outputConfig.lyricsStyle } };
  }
  if (slide.type === 'scripture' && outputConfig.bibleStyleEnabled) {
     return { ...slide.styleOverrides, global: { ...slide.styleOverrides?.global, ...outputConfig.bibleStyle } };
  }
  return slide.styleOverrides;
};

function SettingsModal({ isOpen, onClose, settings, onSave }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  const [activeOutputId, setActiveOutputId] = useState('main');
  const [local, setLocal] = useState<GlobalSettings>(settings);

  useEffect(() => { setLocal(settings); }, [settings, isOpen]);
  useEffect(() => {
     const current = local.outputs.find(o => o.id === activeOutputId);
     if (!current || !current.enabled) setActiveOutputId('main');
  }, [local.outputs, activeOutputId]);

  if (!isOpen) return null;

  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o) }));
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId)!;

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith('video') ? 'video' : 'image';
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => updateOutput(activeOutputId, { defaultBackground: { type, url: ev.target?.result as string, fileName } });
    reader.readAsDataURL(file);
  };

  const StyleConfigurator = ({ title, enabled, styleObj, onToggle, onChange }: any) => (
    <div className="bg-[#1a1a1a] border border-neutral-800 p-5 rounded-lg mb-4">
      <label className="flex items-center gap-3 mb-4 cursor-pointer">
         <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded" />
         <span className="font-bold uppercase text-sm text-neutral-300">{title}</span>
      </label>
      
      {enabled && (
         <div className="grid grid-cols-2 gap-4 mt-2 bg-[#141414] p-4 rounded border border-neutral-800">
           <div>
             <label className="block text-xs text-neutral-500 mb-1">Text Color</label>
             <div className="flex items-center gap-2">
               <input type="color" value={styleObj.color || '#ffffff'} onChange={e => onChange({...styleObj, color: e.target.value})} className="h-8 w-12 rounded cursor-pointer bg-transparent border-none" />
               <span className="text-sm font-mono text-neutral-400">{styleObj.color || '#ffffff'}</span>
             </div>
           </div>
           <div>
             <label className="block text-xs text-neutral-500 mb-1">Alignment</label>
             <select value={styleObj.textAlign || 'center'} onChange={e => onChange({...styleObj, textAlign: e.target.value})} className="w-full bg-[#252525] border border-neutral-700 rounded px-3 py-1.5 text-sm text-white outline-none">
               <option value="left">Left</option>
               <option value="center">Center</option>
               <option value="right">Right</option>
             </select>
           </div>
           <div>
             <label className="block text-xs text-neutral-500 mb-1">Font Weight</label>
             <select value={styleObj.fontWeight || 'bold'} onChange={e => onChange({...styleObj, fontWeight: e.target.value})} className="w-full bg-[#252525] border border-neutral-700 rounded px-3 py-1.5 text-sm text-white outline-none">
               <option value="normal">Normal</option>
               <option value="bold">Bold</option>
               <option value="800">Extra Bold</option>
             </select>
           </div>
           <div>
             <label className="block text-xs text-neutral-500 mb-1">Font Style</label>
             <select value={styleObj.fontStyle || 'normal'} onChange={e => onChange({...styleObj, fontStyle: e.target.value})} className="w-full bg-[#252525] border border-neutral-700 rounded px-3 py-1.5 text-sm text-white outline-none">
               <option value="normal">Normal</option>
               <option value="italic">Italic</option>
             </select>
           </div>
         </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-200">
       <div className="bg-[#1e1e1e] border border-neutral-800 rounded-xl w-full max-w-5xl h-[85vh] flex overflow-hidden shadow-2xl">
          <div className="w-48 bg-[#141414] border-r border-neutral-800 p-4 flex flex-col gap-2 shrink-0">
             <div className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4 px-2">Settings</div>
             <button onClick={() => setActiveTab('outputs')} className={`text-left px-3 py-2 rounded text-sm transition-colors ${activeTab === 'outputs' ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-400 hover:bg-[#252525] hover:text-white'}`}>Outputs</button>
             <button onClick={() => setActiveTab('style')} className={`text-left px-3 py-2 rounded text-sm transition-colors ${activeTab === 'style' ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-400 hover:bg-[#252525] hover:text-white'}`}>Style & Theme</button>
             <button onClick={() => setActiveTab('help')} className={`text-left px-3 py-2 rounded text-sm transition-colors ${activeTab === 'help' ? 'bg-blue-600/20 text-blue-400' : 'text-neutral-400 hover:bg-[#252525] hover:text-white'}`}>Help</button>
          </div>
          <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
             <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
               {activeTab === 'outputs' && (
                  <div className="space-y-6 max-w-2xl">
                     <div>
                       <h2 className="text-2xl font-bold text-white">Active Screens</h2>
                       <p className="text-sm text-neutral-400 mt-1 mb-6">Enable additional projector screens like Livestream or Stage Display.</p>
                     </div>
                     <div className="space-y-4">
                        {local.outputs.map(out => (
                           <div key={out.id} className="bg-[#1a1a1a] border border-neutral-800 p-5 rounded-lg flex items-center justify-between">
                              <div>
                                 <h3 className="text-sm font-bold uppercase text-neutral-200">{out.name}</h3>
                                 <p className="text-xs text-neutral-500 mt-1">{out.id === 'main' ? 'The primary presentation screen.' : `Secondary output for ${out.name.toLowerCase()}.`}</p>
                              </div>
                              <label className="flex items-center gap-3 cursor-pointer">
                                 <span className={`text-sm font-medium ${out.enabled ? 'text-blue-400' : 'text-neutral-500'}`}>{out.enabled ? 'Enabled' : 'Disabled'}</span>
                                 <input type="checkbox" checked={out.enabled} disabled={out.id === 'main'} onChange={(e) => updateOutput(out.id, { enabled: e.target.checked })} className="w-5 h-5 accent-blue-500 cursor-pointer rounded" />
                              </label>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
               {activeTab === 'help' && (
                  <div>
                     <h2 className="text-2xl font-bold text-white mb-2">Help & Documentation</h2>
                     <p className="text-neutral-400">Documentation and shortcut keys are coming soon.</p>
                  </div>
               )}
               {activeTab === 'style' && (
                  <div className="space-y-6 max-w-3xl">
                     <div className="flex items-center justify-between">
                       <div>
                         <h2 className="text-2xl font-bold text-white">Style Profiles</h2>
                         <p className="text-sm text-neutral-400 mt-1">Manage backgrounds and typography overrides per output screen.</p>
                       </div>
                       <div className="bg-[#141414] border border-neutral-800 p-1 rounded-lg flex gap-1 shadow-inner">
                          {local.outputs.filter(o => o.enabled).map(out => (
                             <button key={out.id} onClick={() => setActiveOutputId(out.id)} className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${activeOutputId === out.id ? 'bg-[#2a2a2a] text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}>{out.name}</button>
                          ))}
                       </div>
                     </div>
                     <div className="h-px bg-neutral-800 w-full my-6"></div>
                     <h3 className="text-lg font-bold text-blue-400 mb-4">{activeOutput?.name || 'Output'} Configuration</h3>

                     {activeOutput && (
                        <>
                           <div className="bg-[#1a1a1a] border border-neutral-800 p-5 rounded-lg mb-6">
                              <h3 className="text-sm font-bold uppercase text-neutral-300 mb-2">Default Background</h3>
                              <p className="text-xs text-neutral-500 mb-4">{activeOutputId === 'main' ? "Fallback background shown when no live media is active." : `The dedicated background for the ${activeOutput.name}. It ignores live media sent from the control panel.`}</p>
                              <div className="flex flex-wrap items-center gap-4">
                                <select className="bg-[#252525] border border-neutral-700 text-white rounded px-3 py-2 text-sm outline-none" value={activeOutput.defaultBackground ? activeOutput.defaultBackground.type : 'none'} onChange={(e) => { const val = e.target.value; if (val === 'none') updateOutput(activeOutputId, { defaultBackground: null }); else if (val === 'color') updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: '#0a0a0a' } }); else if (val === 'image') updateOutput(activeOutputId, { defaultBackground: { type: 'image', url: '' } }); }}>
                                  <option value="none">Transparent (None)</option>
                                  <option value="color">Solid Color</option>
                                  <option value="image">Media (Image / Video)</option>
                                </select>
                                {activeOutput.defaultBackground?.type === 'color' && (
                                  <input type="color" value={activeOutput.defaultBackground.color || '#0a0a0a'} onChange={e => updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: e.target.value }})} className="h-9 w-16 cursor-pointer border-none bg-transparent" />
                                )}
                                {(activeOutput.defaultBackground?.type === 'image' || activeOutput.defaultBackground?.type === 'video') && (
                                  <div className="flex items-center gap-3 bg-[#141414] px-3 py-2 rounded border border-neutral-800 flex-1">
                                    <label className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm cursor-pointer transition-colors shrink-0">Browse File... <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" /></label>
                                    {activeOutput.defaultBackground.url ? (
                                      <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{activeOutput.defaultBackground.fileName || 'Local Media File'}</span>
                                    ) : ( <span className="text-xs text-red-400 italic">No media selected yet</span> )}
                                  </div>
                                )}
                              </div>
                           </div>
                           <StyleConfigurator title="Override Lyrics Style" enabled={activeOutput.lyricsStyleEnabled} styleObj={activeOutput.lyricsStyle} onToggle={(val: boolean) => updateOutput(activeOutputId, { lyricsStyleEnabled: val })} onChange={(obj: React.CSSProperties) => updateOutput(activeOutputId, { lyricsStyle: obj })} />
                           <StyleConfigurator title="Override Bible Style" enabled={activeOutput.bibleStyleEnabled} styleObj={activeOutput.bibleStyle} onToggle={(val: boolean) => updateOutput(activeOutputId, { bibleStyleEnabled: val })} onChange={(obj: React.CSSProperties) => updateOutput(activeOutputId, { bibleStyle: obj })} />
                        </>
                     )}
                  </div>
               )}
             </div>
             <div className="p-4 border-t border-neutral-800 bg-[#141414] flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-5 py-2 hover:bg-[#252525] text-neutral-300 transition-colors rounded text-sm font-medium">Cancel</button>
                <button onClick={() => { onSave(local); onClose(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-lg"><Save size={16} /> Save Settings</button>
             </div>
          </div>
       </div>
    </div>
  );
}

const MOCK_SONGS = [
  {
    id: 'song1',
    title: 'Amazing Grace',
    slides: [
      { id: 's1-1', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me', type: 'lyrics' },
      { id: 's1-3', text: 'I once was lost, but now am found\nWas blind, but now I see.', type: 'lyrics' },
    ] as SlideDefinition[]
  },
  {
    id: 'song2',
    title: 'How Great Thou Art',
    slides: [
      { id: 's2-1', text: 'O Lord my God, When I in awesome wonder\nConsider all the worlds Thy Hands have made', type: 'lyrics' },
      { id: 's2-3', text: 'I see the stars, I hear the rolling thunder\nThy power throughout the universe displayed', type: 'lyrics' },
    ] as SlideDefinition[]
  }
];

function ControlPanel() {
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'bibles' | 'media' | 'audio'>('songs');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [songsList, setSongsList] = useState(MOCK_SONGS);
  
  const [previewSlide, setPreviewSlide] = useState<SlideDefinition | null>(null);

  useEffect(() => {
    get('globalSettings').then((val: any) => { 
        if (val) {
            const mergedOutputs = DEFAULT_SETTINGS.outputs.map(defOut => {
                const savedOut = val.outputs?.find((o: any) => o.id === defOut.id);
                return savedOut ? { ...defOut, ...savedOut, enabled: savedOut.enabled !== undefined ? savedOut.enabled : defOut.enabled } : defOut;
            });
            setGlobalSettings({ ...DEFAULT_SETTINGS, ...val, outputs: mergedOutputs });
        }
    });
    get('songsList').then((val) => { if (val) setSongsList(val); });
  }, []);

  useEffect(() => {
    set('globalSettings', globalSettings).catch(()=>{});
    setLiveState(prev => ({ ...prev, settings: globalSettings }));
  }, [globalSettings]);

  useEffect(() => { if (songsList !== MOCK_SONGS) set('songsList', songsList).catch(() => {}); }, [songsList]);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'song'|'bible'|'slide', id: string | number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const [bibleList, setBibleList] = useState<{id: string, name: string}[]>([]);
  const [activeBibleId, setActiveBibleId] = useState<string | null>(null);
  const [activeBibleData, setActiveBibleData] = useState<BibleVersion | null>(null);
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [activeBibleBookIndex, setActiveBibleBookIndex] = useState<number | null>(null);
  const [activeBibleChapterIndex, setActiveBibleChapterIndex] = useState<number | null>(null);
  const [activeBibleVerseIndex, setActiveBibleVerseIndex] = useState<number | null>(null);
  
  const bIndexRef = useRef(activeBibleBookIndex);
  const cIndexRef = useRef(activeBibleChapterIndex);
  const vIndexRef = useRef(activeBibleVerseIndex);

  useEffect(() => { bIndexRef.current = activeBibleBookIndex; }, [activeBibleBookIndex]);
  useEffect(() => { cIndexRef.current = activeBibleChapterIndex; }, [activeBibleChapterIndex]);
  useEffect(() => { vIndexRef.current = activeBibleVerseIndex; }, [activeBibleVerseIndex]);

  const verseListRef = useRef<HTMLDivElement>(null);

  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  const [isEditingSong, setIsEditingSong] = useState(false);
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);
  const [editingSlideText, setEditingSlideText] = useState('');
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [dragOverSlideIndex, setDragOverSlideIndex] = useState<number | null>(null);
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, settings: globalSettings, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });

  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const togglePresenting = () => setLiveState(prev => ({ ...prev, isPresenting: !prev.isPresenting }));

  const toggleClearOutput = (outputId: string) => {
    setLiveState(prev => ({
        ...prev,
        clearedOutputs: { ...prev.clearedOutputs, [outputId]: !prev.clearedOutputs?.[outputId] }
    }));
  };

  const toggleLockOutput = (outputId: string) => {
    setLiveState(prev => {
        const isCurrentlyLocked = !!prev.lockedOutputs?.[outputId];
        if (isCurrentlyLocked) {
            const newLocked = { ...prev.lockedOutputs };
            delete newLocked[outputId];
            const newFrozen = { ...prev.frozenStates };
            delete newFrozen[outputId];
            return { ...prev, lockedOutputs: newLocked, frozenStates: newFrozen };
        } else {
            const outputConfig = prev.settings?.outputs.find(o => o.id === outputId);
            let currentActiveBg = outputConfig?.defaultBackground;
            if (outputId === 'main' && prev.globalBackground) {
                currentActiveBg = prev.globalBackground;
            }
            return {
                ...prev,
                lockedOutputs: { ...prev.lockedOutputs, [outputId]: true },
                frozenStates: {
                    ...prev.frozenStates,
                    [outputId]: { slide: prev.slide, bg: currentActiveBg, clearText: prev.clearText }
                }
            };
        }
    });
  };

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => setVideoCurrentTime(video.currentTime);
    const handleDurationChange = () => setVideoDuration(video.duration);
    const handlePlay = () => setIsVideoPlaying(true);
    const handlePause = () => setIsVideoPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [liveState.globalBackground, liveState.settings, activeTab]); 

  const broadcastVideoCommand = (command: string, value?: any) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'VIDEO_CMD', command, value });
    channel.close();
  };

  const togglePlay = () => {
    if (liveVideoRef.current) {
      if (isVideoPlaying) { liveVideoRef.current.pause(); broadcastVideoCommand('pause'); } 
      else { liveVideoRef.current.play(); broadcastVideoCommand('play'); }
    }
  };

  const toggleMute = () => {
    if (liveVideoRef.current) {
      const newMuted = !isVideoMuted;
      liveVideoRef.current.muted = newMuted;
      setIsVideoMuted(newMuted);
      broadcastVideoCommand('mute', newMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (liveVideoRef.current) {
      const time = parseFloat(e.target.value);
      liveVideoRef.current.currentTime = time;
      setVideoCurrentTime(time);
      broadcastVideoCommand('seek', time);
    }
  };

  // Keyboard Navigation Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
         e.preventDefault();
         if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex >= 0 && currentIndex < currentSong.slides.length - 1) {
               const nextSlide = currentSong.slides[currentIndex + 1];
               setPreviewSlide(nextSlide);
               goLive(nextSlide);
            } else if (currentIndex === -1 && currentSong.slides.length > 0) {
               setPreviewSlide(currentSong.slides[0]);
               goLive(currentSong.slides[0]);
            }
         } else if (activeTab === 'bibles') {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? -1;
            if (currentIdx < verses.length - 1) {
               const nextIdx = currentIdx + 1;
               setActiveBibleVerseIndex(nextIdx);
               const v = verses[nextIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
               // Auto-scroll list
               if (verseListRef.current) {
                  const verseEls = verseListRef.current.children;
                  if (verseEls[nextIdx]) verseEls[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
               }
            }
         }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
         e.preventDefault();
         if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex > 0) {
               const prevSlide = currentSong.slides[currentIndex - 1];
               setPreviewSlide(prevSlide);
               goLive(prevSlide);
            }
         } else if (activeTab === 'bibles') {
            if (!activeBibleData || activeBibleBookIndex === null || activeBibleChapterIndex === null) return;
            const verses = activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].verses;
            const currentIdx = activeBibleVerseIndex ?? 0;
            if (currentIdx > 0) {
               const prevIdx = currentIdx - 1;
               setActiveBibleVerseIndex(prevIdx);
               const v = verses[prevIdx];
               const b = activeBibleData.books[activeBibleBookIndex];
               const c = b.chapters[activeBibleChapterIndex];
               const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
               setPreviewSlide(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
               // Auto-scroll list
               if (verseListRef.current) {
                  const verseEls = verseListRef.current.children;
                  if (verseEls[prevIdx]) verseEls[prevIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
               }
            }
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeItemIndex, activeBibleData, activeBibleBookIndex, activeBibleChapterIndex, activeBibleVerseIndex, liveState, previewSlide, songsList]);


  useEffect(() => {
    initDatabase().then(() => { getBibleList().then(list => { setBibleList(list); if (list.length > 0) setActiveBibleId(list[0].id); }); })
    .catch(err => { getBibleList().then(list => { setBibleList(list); if (list.length > 0) setActiveBibleId(list[0].id); }); });
  }, []);

  // Sync translation changes without automatically pushing Live
  useEffect(() => {
    if (activeBibleId) { 
        getBible(activeBibleId).then(data => { 
            if (data) { 
                setActiveBibleData(data); 
                
                const bIdx = bIndexRef.current !== null ? Math.min(bIndexRef.current, data.books.length - 1) : 0;
                const cIdx = cIndexRef.current !== null ? Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1) : 0;
                const vIdx = vIndexRef.current !== null ? Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1) : 0;

                if (bIndexRef.current === null) {
                    setActiveBibleBookIndex(0);
                    setActiveBibleChapterIndex(0);
                    setActiveBibleVerseIndex(0);
                } else {
                    setActiveBibleBookIndex(bIdx);
                    setActiveBibleChapterIndex(cIdx);
                    setActiveBibleVerseIndex(vIdx);

                    const v = data.books[bIdx].chapters[cIdx].verses[vIdx];
                    const slide: SlideDefinition = { id: `b-${data.books[bIdx].name}-${data.books[bIdx].chapters[cIdx].c}-${v.v}`, text: v.lines.join('\n'), source: `${data.books[bIdx].name} ${data.books[bIdx].chapters[cIdx].c}:${v.v}`, type: 'scripture' };
                    
                    setPreviewSlide(slide); // Prepare it on preview, but do not GoLive automatically!
                }
            }
        }); 
    }
    else { 
        setActiveBibleData(null); 
        setActiveBibleBookIndex(null); 
        setActiveBibleChapterIndex(null); 
        setActiveBibleVerseIndex(null);
    }
  }, [activeBibleId]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(liveState);
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_CURRENT_STATE') {
        channel.postMessage({ ...liveState, videoInitState: { time: liveVideoRef.current?.currentTime || 0, muted: isVideoMuted, playing: isVideoPlaying } });
      }
    };
    return () => channel.close();
  }, [liveState, isVideoMuted, isVideoPlaying]);

  const openProjector = async (outputId: string) => {
    const label = `projector-${outputId}`;
    const url = `/projector/${outputId}`;
    if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) { await existing.setFocus(); return; }
        new WebviewWindow(label, { url: url, title: `Live Display - ${outputId.toUpperCase()}`, width: 1280, height: 720, transparent: true });
        return;
      } catch (err) { console.warn('Failed to open Tauri native window', err); }
    }
    window.open(url, `FlowShow_${outputId}`, 'width=1280,height=720,menubar=no,toolbar=no');
  };

  const goLive = (slide: SlideDefinition) => {
      setLiveState(prev => ({ ...prev, slide, clearText: false, clearedOutputs: {} }));
      setPreviewSlide(slide);
  };
  
  const setGlobalBackground = (url: string | null, type: 'image' | 'video' = 'image') => setLiveState(prev => ({ ...prev, globalBackground: url ? { url, type } : null, clearedOutputs: {} }));

  // Smart Click Logic
  const handleVerseClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     setPreviewSlide(slide);
     // If scripture is currently live, single click advances naturally. Otherwise it just previews.
     if (liveState.slide?.type === 'scripture' && !liveState.clearText) {
         goLive(slide);
     }
  };

  const handleVerseDoubleClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     goLive(slide);
  };

  // Smart Bible Search Logic (FreeShow Style)
  const performBibleSearch = (query: string) => {
    setBibleSearchQuery(query);
    if (!activeBibleData || !query.trim()) return;
    
    const match = query.match(/^(\d?\s*[a-zA-Z]+)\s*(\d+)?(?:[:\s]+(\d+))?/);
    if (!match) return;

    const bNameQuery = match[1].toLowerCase().replace(/\s+/g, '');
    const cNum = match[2] ? parseInt(match[2], 10) : null;
    const vNum = match[3] ? parseInt(match[3], 10) : null;

    const bIdx = activeBibleData.books.findIndex(b => b.name.toLowerCase().replace(/\s+/g, '').startsWith(bNameQuery));
    if (bIdx !== -1) {
        setActiveBibleBookIndex(bIdx);
        if (cNum !== null) {
            const cIdx = activeBibleData.books[bIdx].chapters.findIndex(c => c.c === cNum);
            if (cIdx !== -1) {
                setActiveBibleChapterIndex(cIdx);
                if (vNum !== null) {
                    const vIdx = activeBibleData.books[bIdx].chapters[cIdx].verses.findIndex(v => v.v === vNum);
                    if (vIdx !== -1) {
                       setActiveBibleVerseIndex(vIdx);
                       if (verseListRef.current && verseListRef.current.children[vIdx]) {
                           verseListRef.current.children[vIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                       }
                    }
                } else setActiveBibleVerseIndex(null);
            } else {
                setActiveBibleChapterIndex(null);
                setActiveBibleVerseIndex(null);
            }
        } else {
            setActiveBibleChapterIndex(null);
            setActiveBibleVerseIndex(null);
        }
    }
  };

  const handleVerseDetected = (reference: any) => {
     const bookSearch = reference.book;
     const chapterSearch = reference.chapters[0];
     const verseSearch = reference.verses?.[0]?.[0] || 1;
     const sourceString = `${bookSearch} ${chapterSearch}:${verseSearch}`;
     let foundText = `Finding: ${sourceString}...`;

     if (activeBibleData) {
       const book = activeBibleData.books.find(b => b.name.toLowerCase().startsWith(bookSearch.toLowerCase()));
       if (book) {
         const chapter = book.chapters.find(c => c.c === chapterSearch);
         if (chapter) {
           const verse = chapter.verses.find(v => v.v === verseSearch);
           if (verse) foundText = verse.text;
           else foundText = `[Verse ${verseSearch} not found]`;
         } else foundText = `[Chapter ${chapterSearch} not found]`;
       } else foundText = `[Book ${bookSearch} not found]`;
     }
     goLive({ id: `auto-${Date.now()}`, type: 'scripture', text: foundText, source: sourceString });
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
    } catch (err) { alert("Failed to parse Bible XML. " + err); } 
    finally { setIsUploading(false); if (e.target) e.target.value = ''; }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'song'|'bible'|'slide', id: string|number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  };

  const deleteSong = (id: string | number) => {
    let indexToRemove = -1;
    setSongsList(prev => { indexToRemove = prev.findIndex(s => s.id === id); return prev.filter(s => s.id !== id); });
    if (indexToRemove !== -1) setActiveItemIndex(prevIndex => (prevIndex >= indexToRemove && prevIndex > 0 ? prevIndex - 1 : prevIndex));
  };

  const handleDeleteBible = async (id: string) => {
    await deleteBible(id);
    const list = await getBibleList();
    setBibleList(list);
    if (activeBibleId === id) setActiveBibleId(list.length > 0 ? list[0].id : null);
  };

  const toggleClearText = () => setLiveState(prev => ({ ...prev, clearText: !prev.clearText }));
  const clearAll = () => setLiveState(prev => ({ ...prev, slide: null, globalBackground: null, clearText: false, clearedOutputs: {} }));

  const handleSplitSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const slideToSplit = slides[index]; const lines = slideToSplit.text.split('\n');
      if (lines.length <= 1) return prev;
      const mid = Math.ceil(lines.length / 2);
      const slide1 = { ...slideToSplit, text: lines.slice(0, mid).join('\n') };
      const slide2 = { ...slideToSplit, text: lines.slice(mid).join('\n'), id: `s-${Date.now()}` };
      slides[index] = slide1; slides.splice(index + 1, 0, slide2);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDuplicateSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      slides.splice(index + 1, 0, { ...slides[index], id: `s-${Date.now()}` });
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDeleteSlide = (index: number) => {
    if (activeTab !== 'songs' || !songsList[activeItemIndex]) return;
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; let slides = [...song.slides];
      if (slides.length <= 1) slides[index] = { ...slides[index], text: '' }; else slides.splice(index, 1);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
  };

  const handleDropSlide = (targetIndex: number) => {
    if (draggedSlideIndex === null || draggedSlideIndex === targetIndex || activeTab !== 'songs' || !songsList[activeItemIndex]) {
      setDraggedSlideIndex(null); setDragOverSlideIndex(null); return;
    }
    setSongsList(prev => {
      const newList = [...prev]; const song = { ...newList[activeItemIndex] }; const slides = [...song.slides];
      const [draggedSlide] = slides.splice(draggedSlideIndex, 1); slides.splice(targetIndex, 0, draggedSlide);
      song.slides = slides; newList[activeItemIndex] = song; return newList;
    });
    setDraggedSlideIndex(null); setDragOverSlideIndex(null);
  };

  // --- RENDER COMPONENTS ---

  const renderSidebarList = () => {
    if (activeTab === 'songs') {
      return (
        <div className="flex flex-col h-full bg-[#1a1a1a]">
          <div className="p-3 border-b border-neutral-800 shrink-0">
             <div className="relative">
               <Search size={14} className="absolute left-2.5 top-2.5 text-neutral-500" />
               <input type="text" placeholder="Search Songs..." className="w-full bg-[#252525] border border-neutral-700 rounded text-sm px-8 py-2 outline-none focus:border-blue-500 transition-colors text-neutral-200" />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {songsList.map((song, i) => (
              <div key={song.id} onContextMenu={(e) => handleContextMenu(e, 'song', song.id)} onClick={() => setActiveItemIndex(i)} className={`group px-4 py-3 cursor-pointer border-b border-neutral-800/50 flex items-center transition-colors ${activeItemIndex === i ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-[#252525] border-l-2 border-l-transparent text-neutral-400'}`}>
                <div className="flex items-center gap-3 min-w-0"><FileText size={14} className={activeItemIndex === i ? "text-blue-500" : "text-neutral-500"} /><span className="text-sm font-medium truncate">{song.title}</span></div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-neutral-800 shrink-0">
             <button onClick={() => setIsAddSongModalOpen(true)} className="w-full py-2 bg-[#252525] hover:bg-[#333] border border-neutral-700 rounded text-sm text-neutral-300 flex justify-center items-center gap-2 transition-colors"><Plus size={14} /> New Song</button>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full bg-[#1a1a1a]">
          <div className="p-3 border-b border-neutral-800 shrink-0">
             <label className="flex items-center justify-center gap-2 w-full bg-[#252525] hover:bg-[#333] border border-neutral-700 text-neutral-300 text-sm py-2 rounded cursor-pointer transition-colors">
                {isUploading ? <Activity size={14} className="animate-spin" /> : <Upload size={14} />} {isUploading ? 'Parsing XML...' : 'Import XML Bible'}
                <input type="file" accept=".xml" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
             </label>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {bibleList.length === 0 ? (
               <div className="p-6 text-center text-sm text-neutral-500">No Bibles imported.</div>
            ) : (
               bibleList.map((bible) => (
                <div 
                  key={bible.id} 
                  onContextMenu={(e) => handleContextMenu(e, 'bible', bible.id)} 
                  onClick={() => setActiveBibleId(bible.id)} 
                  onDoubleClick={async () => {
                      const data = await getBible(bible.id);
                      if (data && bIndexRef.current !== null && cIndexRef.current !== null && vIndexRef.current !== null) {
                         const bIdx = Math.min(bIndexRef.current, data.books.length - 1);
                         const cIdx = Math.min(cIndexRef.current, data.books[bIdx].chapters.length - 1);
                         const vIdx = Math.min(vIndexRef.current, data.books[bIdx].chapters[cIdx].verses.length - 1);
                         const b = data.books[bIdx];
                         const c = b.chapters[cIdx];
                         const v = c.verses[vIdx];
                         const slide: SlideDefinition = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' };
                         setPreviewSlide(slide);
                         goLive(slide);
                      }
                  }}
                  className={`group px-4 py-3 cursor-pointer border-b border-neutral-800/50 flex items-center transition-colors ${activeBibleId === bible.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-[#252525] border-l-2 border-l-transparent text-neutral-400'}`}>
                  <div className="flex items-center gap-3 min-w-0"><BookOpen size={14} className={activeBibleId === bible.id ? "text-blue-500" : "text-neutral-500"} /><span className="text-sm font-medium truncate">{bible.name}</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderCenterWorkspace = () => {
    if (activeTab === 'media') return <MediaLibrary onSelectBackground={setGlobalBackground} />;
    if (activeTab === 'audio') return <AudioModule onVerseDetected={handleVerseDetected} />;

    if (isEditingSong && activeTab === 'songs' && songsList[activeItemIndex]) {
      return (
        <EditSongPage 
          song={songsList[activeItemIndex]} initialSlideIndex={editingSlideIndex || 0} onClose={() => setIsEditingSong(false)}
          onSave={(songId, updatedSlides) => {
            setSongsList(prev => { const next = [...prev]; const idx = next.findIndex(s => s.id === songId); if (idx !== -1) next[idx] = { ...next[idx], slides: updatedSlides }; return next; });
            setLiveState(prev => { if (prev.slide) { const match = updatedSlides.find(s => s.id === prev.slide!.id); if (match) return { ...prev, slide: match }; } return prev; });
          }}
        />
      );
    }

    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full">
           <div className="p-4 border-b border-neutral-800 shrink-0 flex gap-4 items-center bg-[#111]">
              <div className="relative max-w-md w-full">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleSearchQuery} 
                   onChange={e => performBibleSearch(e.target.value)}
                   onKeyDown={(e) => {
                      if (e.key === 'Enter' && activeBibleData && activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleVerseIndex !== null) {
                          const b = activeBibleData.books[activeBibleBookIndex];
                          const c = b.chapters[activeBibleChapterIndex];
                          const v = c.verses[activeBibleVerseIndex];
                          goLive({ id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' });
                      }
                   }}
                   placeholder="Search (e.g. Joh 3 16)..." 
                   className="w-full bg-[#1a1a1a] border border-neutral-700 rounded-md text-sm px-10 py-2 outline-none focus:border-blue-500 transition-colors text-white"
                 />
              </div>
              <span className="text-sm font-medium text-neutral-400">{activeBibleData?.name || 'No Bible Selected'}</span>
           </div>

           <div className="flex flex-1 min-h-0 overflow-hidden bg-[#141414]">
              <div className="w-48 border-r border-neutral-800 overflow-y-auto custom-scrollbar bg-[#1a1a1a] shrink-0">
                 {activeBibleData?.books.map((book, idx) => (
                    <button key={book.name} onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(0); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-left px-4 py-2.5 text-sm border-b border-neutral-800/50 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600 text-white font-medium shadow-inner' : 'text-neutral-400 hover:bg-[#252525] hover:text-white'}`}>{book.name}</button>
                 ))}
              </div>
              <div className="w-20 border-r border-neutral-800 overflow-y-auto custom-scrollbar bg-[#1a1a1a] shrink-0">
                 {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                    <button key={chapter.c} onClick={() => { setActiveBibleChapterIndex(idx); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-center px-2 py-2.5 text-sm border-b border-neutral-800/50 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600 text-white font-medium shadow-inner' : 'text-neutral-400 hover:bg-[#252525] hover:text-white'}`}>{chapter.c}</button>
                 ))}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[#141414]">
                 <div className="flex flex-col gap-2 max-w-4xl mx-auto" ref={verseListRef}>
                   {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map((verse, vIdx) => {
                      const slide: SlideDefinition = { id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`, text: verse.lines.join('\n'), source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`, type: 'scripture' };
                      const isLive = liveState.slide?.id === slide.id;
                      const isPreview = previewSlide?.id === slide.id;
                      
                      return (
                         <div 
                            key={verse.v} 
                            onClick={() => handleVerseClick(slide, vIdx)}
                            onDoubleClick={() => handleVerseDoubleClick(slide, vIdx)}
                            className={`p-4 rounded-lg cursor-pointer border transition-all flex gap-4 ${isLive ? 'bg-red-600/20 border-red-500 text-white shadow-lg' : isPreview ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-[#1a1a1a] border-neutral-800 hover:border-neutral-600 hover:bg-[#222] text-neutral-300'}`}
                         >
                            <span className={`text-xs font-bold mt-0.5 shrink-0 w-6 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{verse.v}</span>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{verse.lines.join('\n')}</p>
                         </div>
                      );
                   })}
                 </div>
              </div>
           </div>
        </div>
      );
    }

    if (activeTab === 'songs') {
      const activeSong = songsList[activeItemIndex];
      if (!activeSong) return <div className="flex-1 flex items-center justify-center text-neutral-500">No Song Selected</div>;

      return (
        <div className="flex flex-col h-full">
           {/* Toolbar */}
           <div className="h-14 bg-[#111] border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
             <div className="flex items-center gap-3">
                <Music size={18} className="text-blue-500" />
                <h2 className="text-lg font-bold text-white">{activeSong.title}</h2>
             </div>
             <button className="text-xs bg-[#252525] hover:bg-[#333] border border-neutral-700 px-3 py-1.5 rounded transition-colors text-neutral-300">Edit Layout</button>
           </div>
           
           {/* Slide Grid */}
           <div className="flex-1 overflow-y-auto p-6 bg-[#141414] custom-scrollbar">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 content-start">
                 {activeSong.slides.map((slide, i) => {
                    const isLive = liveState.slide?.id === slide.id;
                    const isPreview = previewSlide?.id === slide.id;
                    return (
                       <div 
                         key={slide.id} draggable
                         onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }} onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                         onContextMenu={(e) => handleContextMenu(e, 'slide', i)} onClick={() => { if (!slide.disabled) { setPreviewSlide(slide); goLive(slide); } }}
                         className={`group aspect-video rounded-lg cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                           ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''} ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.3)]' : isPreview ? 'border-blue-500' : 'bg-[#1a1a1a] border-neutral-800 hover:border-neutral-600 hover:bg-[#222]'} ${dragOverSlideIndex === i ? 'border-dashed border-blue-400 opacity-70' : ''}
                         `}
                       >
                         <FixedStage className="w-full h-full pointer-events-none">
                            <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'))} />
                         </FixedStage>
                         
                         {/* Slide Number Badge */}
                         <div className="absolute top-2 left-2 text-[10px] font-bold text-neutral-500 bg-[#111]/80 px-2 py-0.5 rounded shadow-sm border border-neutral-800/50 backdrop-blur-sm z-10">{i + 1}</div>
                         
                         {/* Hover Actions */}
                         <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 flex items-center bg-[#111]/90 rounded-md border border-neutral-700/50 shadow-lg overflow-hidden transition-all backdrop-blur-sm z-20">
                           <button onClick={(e) => { e.stopPropagation(); setIsEditingSong(true); setEditingSlideIndex(i); setEditingSlideText(slide.text); }} className="p-2 hover:bg-blue-600/30 text-neutral-300 hover:text-white transition-colors" title="Edit"><Edit2 size={12} /></button>
                           <button onClick={(e) => { e.stopPropagation(); handleDuplicateSlide(i); }} className="p-2 hover:bg-blue-600/30 text-neutral-300 hover:text-white transition-colors border-l border-neutral-700/50" title="Duplicate"><Copy size={12} /></button>
                           <button onClick={(e) => { e.stopPropagation(); handleSplitSlide(i); }} className="p-2 hover:bg-blue-600/30 text-neutral-300 hover:text-white transition-colors border-l border-neutral-700/50" title="Split"><Split size={12} /></button>
                           <button onClick={(e) => { e.stopPropagation(); handleDeleteSlide(i); }} className="p-2 hover:bg-red-500/50 text-neutral-300 hover:text-white transition-colors border-l border-neutral-700/50" title="Delete"><Trash size={12} /></button>
                         </div>
                       </div>
                    );
                 })}
              </div>
           </div>
        </div>
      );
    }
  };

  const renderRightPanel = () => {
     const mainConfig = liveState.settings?.outputs.find(o => o.id === 'main');
     const otherOutputs = liveState.settings?.outputs.filter(o => o.enabled && o.id !== 'main') || [];

     return (
       <div className="flex flex-col h-full bg-[#111]">
          {/* Output Controls (Clear Buttons) */}
          <div className="p-4 border-b border-neutral-800 flex justify-between gap-2 shrink-0 bg-[#141414]">
            <button onClick={toggleClearText} className={`flex-1 py-2 flex justify-center items-center gap-2 rounded text-sm font-medium transition-colors ${liveState.clearText ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#252525] text-neutral-300 hover:bg-[#333] border border-neutral-700'}`} title="Clear Text"><EyeOff size={16} /><span className="hidden xl:inline">Clear Text</span></button>
            <button onClick={() => setGlobalBackground(null)} className="flex-1 py-2 flex justify-center items-center gap-2 rounded text-sm font-medium transition-colors bg-[#252525] text-neutral-300 hover:bg-[#333] border border-neutral-700" title="Clear BG"><MonitorOff size={16} /><span className="hidden xl:inline">Clear BG</span></button>
            <button onClick={clearAll} className="flex-1 py-2 flex justify-center items-center gap-2 rounded text-sm font-medium transition-colors bg-red-900/40 text-red-300 hover:bg-red-800/60 border border-red-900/50" title="Clear All"><X size={16} /><span className="hidden xl:inline">Clear All</span></button>
          </div>

          {/* Displays Scroller (PROGRAM OUTPUT) */}
          <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
             
             {/* Main Output */}
             <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-1">
                   <button 
                     onClick={() => toggleLockOutput('main')} 
                     className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${liveState.lockedOutputs?.['main'] ? 'text-red-500 line-through' : 'text-neutral-400 hover:text-white'}`}
                     title={liveState.lockedOutputs?.['main'] ? "Screen Locked (Frozen)" : "Lock Screen (Freeze current state)"}
                   >
                     Main Output
                   </button>
                   <div className="flex items-center gap-2">
                      <button onClick={() => toggleClearOutput('main')} className={`p-1 rounded transition-colors text-[10px] flex items-center gap-1 ${liveState.clearedOutputs?.['main'] ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-500 hover:text-white hover:bg-[#333]'}`} title="Clear Text from Main"><X size={10} /> {liveState.clearedOutputs?.['main'] ? 'Text Cleared' : 'Clear Text'}</button>
                      <button onClick={() => openProjector('main')} className="text-neutral-500 hover:text-white p-1 rounded hover:bg-[#333] transition-colors" title="Launch Output Screen"><LaunchIcon size={12} /></button>
                      <div className={`h-1.5 w-1.5 rounded-full ${liveState.isPresenting && (liveState.slide || liveState.globalBackground) && !liveState.clearedOutputs?.['main'] && !liveState.lockedOutputs?.['main'] ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]' : 'bg-neutral-700'}`}></div>
                   </div>
                </div>
                
                <div className={`w-full aspect-video relative rounded-lg border bg-black transition-all duration-300 overflow-hidden ${liveState.isPresenting && !liveState.lockedOutputs?.['main'] ? 'border-neutral-600 shadow-lg' : 'border-neutral-800 opacity-50 grayscale-[50%]'}`}>
                   <FixedStage className="w-full h-full pointer-events-none">
                      
                      {(() => {
                         const isLocked = !!liveState.lockedOutputs?.['main'];
                         const frozenState = liveState.frozenStates?.['main'];
                         const isCleared = !!liveState.clearedOutputs?.['main'];
                         
                         const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
                         const displayBg = isLocked ? frozenState?.bg : (liveState.globalBackground || mainConfig?.defaultBackground);
                         const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

                         return (
                            <>
                               {displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }}></div>}
                               {displayBg?.url && displayBg.type === 'video' ? (
                                  <video ref={liveVideoRef} src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay loop muted={isVideoMuted} playsInline />
                               ) : displayBg?.url ? (
                                  <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                               ) : null}
                               
                               {!isCleared && !displayClearText && displaySlide && (
                                  <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, mainConfig)} className="relative z-10 w-full h-full animate-in fade-in duration-300" />
                               )}
                               
                               {isCleared && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/40 backdrop-blur-sm z-20"><span className="text-neutral-300 font-bold tracking-widest uppercase text-base flex items-center gap-2"><X size={16}/> Text Cleared</span></div>
                               )}

                               {!displayBg && (!displaySlide || displayClearText || isCleared) && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]"><span className="text-neutral-800 font-bold tracking-widest uppercase text-3xl">Black</span></div>
                               )}
                            </>
                         )
                      })()}

                   </FixedStage>
                </div>

                {/* Video Controls under Main Output */}
                {(liveState.lockedOutputs?.['main'] ? liveState.frozenStates?.['main']?.bg : (liveState.globalBackground || mainConfig?.defaultBackground))?.type === 'video' && (
                  <div className="mt-1 flex items-center gap-2 bg-[#1a1a1a] border border-neutral-800 rounded p-1.5 text-neutral-300 shadow-sm shrink-0">
                     <button onClick={togglePlay} className="hover:text-white hover:bg-neutral-800 p-1 rounded transition-colors">{isVideoPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
                     <button onClick={toggleMute} className="hover:text-white hover:bg-neutral-800 p-1 rounded transition-colors ml-1 cursor-pointer">{isVideoMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
                     <div className="text-xs text-neutral-500 font-mono w-10 text-right ml-1">{formatTime(videoCurrentTime)}</div>
                     <input type="range" min="0" step="0.1" max={videoDuration || 100} value={videoCurrentTime} onChange={handleSeek} className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400" />
                  </div>
                )}
             </div>

             {/* Other Outputs */}
             {otherOutputs.map(out => {
                const isOutLocked = !!liveState.lockedOutputs?.[out.id];
                const isOutCleared = !!liveState.clearedOutputs?.[out.id];
                
                return (
                   <div key={out.id} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center px-1">
                         <button 
                           onClick={() => toggleLockOutput(out.id)} 
                           className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isOutLocked ? 'text-red-500 line-through' : 'text-neutral-500 hover:text-white'}`}
                           title={isOutLocked ? "Screen Locked (Frozen)" : "Lock Screen (Freeze current state)"}
                         >
                           {out.name}
                         </button>
                         <div className="flex items-center gap-2">
                            <button onClick={() => toggleClearOutput(out.id)} className={`p-1 rounded transition-colors text-[10px] flex items-center gap-1 ${isOutCleared ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-500 hover:text-white hover:bg-[#333]'}`} title="Blank Screen (Transparent)"><X size={10} /> {isOutCleared ? 'Cleared' : 'Clear'}</button>
                            <button onClick={() => openProjector(out.id)} className="text-neutral-600 hover:text-white p-1 rounded hover:bg-[#333] transition-colors"><LaunchIcon size={12} /></button>
                            <div className={`h-1.5 w-1.5 rounded-full ${liveState.isPresenting && (liveState.slide || out.defaultBackground) && !isOutCleared && !isOutLocked ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,1)]' : 'bg-neutral-800'}`}></div>
                         </div>
                      </div>
                      
                      <div className={`w-full aspect-video relative rounded-md border bg-black transition-all duration-300 overflow-hidden ${liveState.isPresenting && !isOutLocked && !isOutCleared ? 'border-neutral-700 shadow-md' : 'border-neutral-800 opacity-50 grayscale-[50%]'}`}>
                         <FixedStage className="w-full h-full pointer-events-none">
                            
                            {(() => {
                               const frozenState = liveState.frozenStates?.[out.id];
                               const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
                               const displayBg = isOutLocked ? frozenState?.bg : out.defaultBackground;
                               const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
                               const hideBg = isOutCleared; // Clears the whole screen for non-main outputs

                               return (
                                 <>
                                    {!hideBg && displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }}></div>}
                                    {!hideBg && displayBg?.url && displayBg.type === 'video' ? (
                                       <video src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay loop muted playsInline />
                                    ) : !hideBg && displayBg?.url ? (
                                       <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                                    ) : null}
                                    
                                    {!isOutCleared && !displayClearText && displaySlide && (
                                       <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, out)} className="relative z-10 w-full h-full animate-in fade-in duration-300" />
                                    )}

                                    {isOutCleared && (
                                       <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm z-20"><span className="text-neutral-600 font-bold tracking-widest uppercase text-sm flex items-center gap-1"><X size={14}/> Cleared</span></div>
                                    )}
                                 </>
                               )
                            })()}

                         </FixedStage>
                      </div>
                   </div>
                );
             })}

          </div>
       </div>
     );
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-neutral-200 overflow-hidden font-sans select-none">
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} settings={globalSettings} onSave={setGlobalSettings} />

      {/* TOP HEADER */}
      <header className="h-14 bg-[#0a0a0a] border-b border-neutral-800 flex items-center justify-between px-4 shrink-0 shadow-sm z-30">
        <div className="flex items-center space-x-3 w-64">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-inner"><Layers size={20} className="text-white" /></div>
          <span className="font-bold text-white tracking-widest text-sm">FLOWSHOW</span>
        </div>

        {/* MASTER PRESENT TOGGLE */}
        <button
           onClick={togglePresenting}
           className={`flex items-center gap-2 px-8 py-2 rounded-full text-sm font-bold transition-all shadow-lg ${
              liveState.isPresenting
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)]'
              : 'bg-[#252525] text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500'
           }`}
        >
           <MonitorPlay size={16} />
           {liveState.isPresenting ? 'LIVE (PRESENTING)' : 'OFFLINE'}
        </button>

        <div className="w-64 flex justify-end"></div>
      </header>

      {/* 3-COLUMN WORKSPACE */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* PRIMARY SIDEBAR (NAVIGATION) */}
        <div className="w-16 bg-[#0a0a0a] border-r border-neutral-800 flex flex-col items-center py-4 gap-6 shrink-0 z-20">
          <div className="flex flex-col gap-2 w-full px-2">
            <button onClick={() => setActiveTab('songs')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'songs' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-500 hover:bg-[#252525] hover:text-white'}`} title="Songs"><Music size={20} /></button>
            <button onClick={() => setActiveTab('bibles')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'bibles' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-500 hover:bg-[#252525] hover:text-white'}`} title="Bibles"><BookOpen size={20} /></button>
            <button onClick={() => setActiveTab('media')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'media' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-500 hover:bg-[#252525] hover:text-white'}`} title="Media"><ImageIcon size={20} /></button>
            <div className="w-8 h-px bg-neutral-800 mx-auto my-1"></div>
            <button onClick={() => setActiveTab('audio')} className={`w-full aspect-square flex justify-center items-center rounded-xl transition-all ${activeTab === 'audio' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-neutral-500 hover:bg-[#252525] hover:text-white'}`} title="Live Transcriber"><Mic size={20} /></button>
          </div>
          <div className="mt-auto w-full px-2">
            <button onClick={() => setIsSettingsModalOpen(true)} className="w-full aspect-square flex justify-center items-center rounded-xl text-neutral-500 hover:bg-[#252525] hover:text-white transition-all" title="Settings"><Settings size={20} /></button>
          </div>
        </div>

        {/* SECONDARY SIDEBAR (LISTS) */}
        {(activeTab !== 'media' && activeTab !== 'audio') && (
           <div className="w-64 bg-[#1a1a1a] border-r border-neutral-800 shrink-0 flex flex-col z-10">
              {renderSidebarList()}
           </div>
        )}

        {/* CENTER WORKSPACE */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#141414] relative">
           
           {/* ACTIVE SCREENS PREVIEW GRID (TOP) - ALWAYS PREVIEW & FULL COLOR */}
           <div className="h-44 lg:h-56 bg-[#141414] border-b border-neutral-800 p-4 shadow-sm z-10 shrink-0 flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                 <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Preview Screens (Always Shows Selection)</span>
              </div>

              <div className="flex-1 flex gap-4 overflow-x-auto items-center justify-center custom-scrollbar">
                 {liveState.settings?.outputs.filter(o => o.enabled).map(out => {
                    let activeBg = out.defaultBackground;
                    if (out.id === 'main' && liveState.globalBackground) {
                       activeBg = liveState.globalBackground;
                    }

                    return (
                       <div key={out.id} className="h-full flex flex-col justify-center">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5 px-1">{out.name} Preview</span>
                          <div className="h-full max-h-[100px] lg:max-h-[140px] aspect-video rounded-md overflow-hidden border border-neutral-700 bg-black relative shadow-lg">
                             <FixedStage className="w-full h-full pointer-events-none">
                                {activeBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: activeBg.color || '#000' }}></div>}
                                {activeBg?.url && activeBg.type === 'video' ? (
                                   <video src={activeBg.url} className="absolute inset-0 w-full h-full object-cover opacity-60" autoPlay loop muted playsInline />
                                ) : activeBg?.url ? (
                                   <img src={activeBg.url} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="bg" />
                                ) : null}
                                
                                {/* PREVIEW ALWAYS SHOWS PREVIEW SLIDE IN FULL COLOR */}
                                {previewSlide && (
                                   <div className="absolute inset-0 z-10 flex">
                                      <SmartTextLayout text={previewSlide.text} source={previewSlide.source} type={previewSlide.type} styleOverrides={applyGlobalStyles(previewSlide, out)} />
                                   </div>
                                )}

                                {!activeBg && !previewSlide && (
                                   <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]"><span className="text-neutral-700 font-bold tracking-widest uppercase text-xl">Black</span></div>
                                )}
                             </FixedStage>
                          </div>
                       </div>
                    );
                 })}
              </div>
           </div>
           
           <div className="flex-1 overflow-hidden relative">
              {renderCenterWorkspace()}
           </div>
        </div>

        {/* RIGHT ACTION PANEL (PROGRAM MONITOR) */}
        <div className="w-80 lg:w-[400px] bg-[#1a1a1a] border-l border-neutral-800 shrink-0 flex flex-col z-20 shadow-[-10px_0_20px_rgba(0,0,0,0.2)]">
           {renderRightPanel()}
        </div>

      </div>

      {/* CONTEXT MENUS */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#252525] border border-neutral-700 rounded shadow-lg overflow-hidden py-1 w-48" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'slide' ? (
             <>
               <button className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { setIsEditingSong(true); setEditingSlideIndex(contextMenu.id as number); setEditingSlideText(songsList[activeItemIndex].slides[contextMenu.id as number].text); setContextMenu(null); }}><Edit2 size={14}/> Edit</button>
               <button className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleDuplicateSlide(contextMenu.id as number); setContextMenu(null); }}><Copy size={14}/> Duplicate</button>
               <button className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleSplitSlide(contextMenu.id as number); setContextMenu(null); }}><Split size={14}/> Split</button>
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-500 text-sm transition-colors flex items-center gap-2" onClick={() => { handleDeleteSlide(contextMenu.id as number); setContextMenu(null); }}><Trash size={14}/> Delete</button>
             </>
          ) : (
            <>
               <button className="w-full text-left px-4 py-2 hover:bg-[#333] text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') {
                      const song = songsList.find(s => s.id === contextMenu.id);
                      if (song) { const newName = prompt("Rename Song:", song.title); if (newName && newName.trim()) setSongsList(prev => prev.map(s => s.id === contextMenu.id ? { ...s, title: newName.trim() } : s)); }
                   } else if (contextMenu.type === 'bible') {
                      const b = bibleList.find(b => b.id === contextMenu.id);
                      if (b) { const newName = prompt("Rename Bible:", b.name); if (newName && newName.trim()) { getBible(contextMenu.id as string).then(bibleData => { if (bibleData) { bibleData.name = newName.trim(); saveBible(bibleData).then(() => { getBibleList().then(list => setBibleList(list)); if (activeBibleId === contextMenu.id) setActiveBibleData(bibleData); }); }}); }}
                   }
                   setContextMenu(null);
                 }}><Edit2 size={14}/> Rename {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-500 text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') deleteSong(contextMenu.id); else if (contextMenu.type === 'bible') handleDeleteBible(contextMenu.id as string);
                   setContextMenu(null);
                 }}><Trash size={14}/> Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
            </>
          )}
        </div>
      )}

      <AddSongModal isOpen={isAddSongModalOpen} onClose={() => setIsAddSongModalOpen(false)} onAddSong={(newSong) => { setSongsList(prev => [...prev, newSong]); setActiveTab('songs'); setActiveItemIndex(songsList.length); }} />
    </div>
  );
}

function ProjectorView() {
  const { outputId = 'main' } = useParams();
  
  const [liveState, setLiveState] = useState<PresentState>({
    slide: null, globalBackground: null, clearText: false, isPresenting: false, clearedOutputs: {}, lockedOutputs: {}, frozenStates: {}
  });
  
  const projectorVideoRef = useRef<HTMLVideoElement>(null);
  const lockedRef = useRef(false);

  useEffect(() => {
    lockedRef.current = !!liveState.lockedOutputs?.[outputId];
  }, [liveState.lockedOutputs, outputId]);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'REQUEST_CURRENT_STATE' });
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'VIDEO_CMD') {
        if (lockedRef.current) return; 
        
        const { command, value } = event.data;
        if (projectorVideoRef.current) {
           if (command === 'play') projectorVideoRef.current.play().catch(console.error);
           else if (command === 'pause') projectorVideoRef.current.pause();
           else if (command === 'mute') projectorVideoRef.current.muted = value;
           else if (command === 'seek') projectorVideoRef.current.currentTime = value;
        }
      } else if (event.data && !event.data.type?.startsWith('REQUEST_')) {
         
         setLiveState(prev => {
             const incoming = event.data;
             const isNowLocked = incoming.lockedOutputs?.[outputId];

             if (isNowLocked) {
                 return {
                     ...incoming,
                     slide: prev.slide,
                     globalBackground: prev.globalBackground,
                     clearText: prev.clearText,
                     clearedOutputs: {
                         ...incoming.clearedOutputs,
                         [outputId]: prev.clearedOutputs?.[outputId] 
                     }
                 };
             }
             return incoming;
         });

         if (!lockedRef.current && event.data.videoInitState && projectorVideoRef.current) {
             projectorVideoRef.current.currentTime = event.data.videoInitState.time;
             projectorVideoRef.current.muted = event.data.videoInitState.muted;
             if (event.data.videoInitState.playing) projectorVideoRef.current.play().catch(console.error);
             else projectorVideoRef.current.pause();
         }
      }
    };
    return () => channel.close();
  }, [outputId]);

  const outputConfig = liveState.settings?.outputs.find(o => o.id === outputId);
  const isCleared = !!liveState.clearedOutputs?.[outputId];
  const isLocked = !!liveState.lockedOutputs?.[outputId];
  const frozenState = liveState.frozenStates?.[outputId];
  
  let activeBg = outputConfig?.defaultBackground;
  if (outputId === 'main' && liveState.globalBackground) {
      activeBg = liveState.globalBackground;
  }

  const displaySlide = isLocked ? frozenState?.slide : liveState.slide;
  const displayBg = isLocked ? frozenState?.bg : activeBg;
  const displayClearText = isLocked ? frozenState?.clearText : liveState.clearText;

  const hideBg = isCleared && outputId !== 'main';
  const hideText = isCleared;

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-center overflow-hidden relative cursor-none select-none">
      <div className={`w-full h-full transition-opacity duration-700 ease-in-out ${liveState.isPresenting ? 'opacity-100' : 'opacity-0'}`}>
        <FixedStage className="w-full h-full relative">
          
          {!hideBg && displayBg && displayBg.type === 'color' && ( <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ backgroundColor: displayBg.color || '#000' }}></div> )}
          
          {!hideBg && displayBg && displayBg.url && displayBg.type === 'video' ? (
            <video ref={projectorVideoRef} src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" autoPlay loop playsInline />
          ) : !hideBg && displayBg && displayBg.url ? (
            <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" alt="bg" />
          ) : null}
          
          {!hideText && !displayClearText && displaySlide && (
             <SmartTextLayout text={displaySlide.text} source={displaySlide.source} type={displaySlide.type} styleOverrides={applyGlobalStyles(displaySlide, outputConfig)} className="relative z-10 w-full h-full animate-in fade-in duration-300" />
          )}

        </FixedStage>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ControlPanel />} />
        <Route path="/projector/:outputId" element={<ProjectorView />} />
        <Route path="/projector" element={<ProjectorView />} /> 
      </Routes>
    </BrowserRouter>
  );
}