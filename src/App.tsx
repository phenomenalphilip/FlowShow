import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, MonitorPlay, Mic, BookOpen, Music, Image as ImageIcon, 
  Plus, Search, List, Grid, X, LayoutTemplate, Layers, Play,
  SquareSquare, MonitorOff, MonitorUp, EyeOff, FileText,
  Activity, Upload, ExternalLink, Edit2, Copy, Trash, GripVertical, Split,
  Pause, Volume2, VolumeX, Save, ChevronDown, ExternalLink as LaunchIcon, Clock, Lock, Unlock, PanelLeft, PanelLeftClose,
  Radio, Tv, Wifi, ListOrdered, Check, Sparkles, ChevronRight, ChevronLeft,
  Folder, FolderPlus, RotateCcw, Eye, MoreHorizontal, MoreVertical, Calendar, Puzzle, Sliders, Info, Minus, Maximize2, Square
} from 'lucide-react';
import { ndiService, NdiSource, NdiOutputChannel } from './lib/ndi';
import { SetlistManager } from './components/SetlistManager';
import { ServiceSetlist, SetlistItem, loadCurrentSetlist, saveCurrentSetlist, DEFAULT_SAMPLE_SETLIST } from './lib/setlist';

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
import { AnimationConfig, PresentationTemplate, STARTER_TEMPLATES, getStoredTemplates } from './lib/templates';
import { TemplateGalleryModal, TemplateGalleryModalProps, InlineTemplateGrid } from './components/TemplateGalleryModal';

export type SlideType = 'lyrics' | 'scripture' | 'blank' | 'media';

export type SlideDefinition = {
  id: string;
  text: string;
  source?: string;
  backgroundUrl?: string;
  type: SlideType;
  disabled?: boolean;
  templateId?: string;
  outputTemplates?: { [outputId: string]: string };
  animation?: AnimationConfig;
  styleOverrides?: {
    global?: React.CSSProperties & { '--font-scale'?: number };
    words?: { [wordIndex: number]: React.CSSProperties };
    lines?: { [lineIndex: number]: React.CSSProperties };
    layout?: { x: number; y: number; width: number; height: number };
    sourceGlobal?: React.CSSProperties & { '--font-scale'?: number };
    sourceLayout?: { x: number; y: number; width: number; height: number };
  };
};

export type OutputType = 'hdmi' | 'ndi';

export interface OutputSettings {
  id: string;
  name: string;
  enabled: boolean;
  outputType: OutputType;
  defaultTemplateId?: string;
  defaultBackground: { 
    url?: string; 
    color?: string; 
    type: 'image' | 'video' | 'color' | 'ndi' | 'none'; 
    fileName?: string;
    ndiSourceId?: string;
  } | null;
  lyricsStyleEnabled: boolean;
  lyricsStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  bibleStyleEnabled: boolean;
  bibleStyle: { global?: React.CSSProperties & { '--font-scale'?: number }; layout?: { x: number; y: number; width: number; height: number }; sourceGlobal?: React.CSSProperties & { '--font-scale'?: number }; sourceLayout?: { x: number; y: number; width: number; height: number } } | React.CSSProperties;
  // HDMI-specific
  displayId?: string;
  // NDI-specific
  ndiStreamName?: string;
  ndiGroup?: string;
  ndiResolution?: '1920x1080' | '1280x720' | '3840x2160';
  ndiFrameRate?: number;
  ndiTransparent?: boolean;
  ndiAlphaChannel?: boolean;
}

export interface GlobalSettings {
  outputs: OutputSettings[];
}

const DEFAULT_SETTINGS: GlobalSettings = {
  outputs: [
    {
      id: 'main',
      name: 'Output 1',
      enabled: true,
      outputType: 'hdmi',
      defaultTemplateId: 'cinematic-ambient',
      defaultBackground: null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
    },
    {
      id: 'output-2',
      name: 'Output 2',
      enabled: true,
      outputType: 'ndi',
      ndiStreamName: 'FlowShow NDI - NDI 1',
      ndiResolution: '1920x1080',
      ndiFrameRate: 30,
      ndiTransparent: true,
      defaultTemplateId: 'cinematic-ambient',
      defaultBackground: null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      }
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

import { getTemplateById } from './lib/templates';

export const resolveSlideForOutput = (
  slide: SlideDefinition | null, 
  outputConfig?: OutputSettings,
  song?: { id?: string; templateId?: string; outputTemplates?: { [outputId: string]: string } }
): { styleOverrides: SlideDefinition['styleOverrides']; animation?: AnimationConfig } => {
  if (!slide) return { styleOverrides: undefined, animation: undefined };

  const outputId = outputConfig?.id || 'main';

  // 1. Resolve template ID in order of priority:
  // Slide output override -> Slide general -> Song output override -> Song general -> Output default
  const templateId = 
    slide.outputTemplates?.[outputId] ||
    slide.templateId ||
    song?.outputTemplates?.[outputId] ||
    song?.templateId ||
    outputConfig?.defaultTemplateId;

  const template = templateId ? getTemplateById(templateId) : undefined;

  let baseGlobal = template?.styles.global || {};
  let baseLayout = template?.styles.layout;
  let baseLines = template?.styles.lines || {};
  let animation = slide.animation || template?.animation;

  let mergedStyle: SlideDefinition['styleOverrides'] = {
    ...slide.styleOverrides,
    global: {
      ...baseGlobal,
      ...(slide.styleOverrides?.global || {})
    },
    lines: {
      ...baseLines,
      ...(slide.styleOverrides?.lines || {})
    },
    layout: slide.styleOverrides?.layout || baseLayout,
    sourceGlobal: {
      ...(template?.styles.sourceGlobal || {}),
      ...(slide.styleOverrides?.sourceGlobal || {})
    },
    sourceLayout: slide.styleOverrides?.sourceLayout || template?.styles.sourceLayout
  };

  // Legacy style overrides if explicitly toggled on
  if (slide.type === 'lyrics' && outputConfig?.lyricsStyleEnabled) {
    const legacy = (outputConfig.lyricsStyle as any)?.global || outputConfig.lyricsStyle;
    mergedStyle.global = { ...mergedStyle.global, ...legacy };
    if ((outputConfig.lyricsStyle as any)?.layout) {
      mergedStyle.layout = (outputConfig.lyricsStyle as any).layout;
    }
  }
  if (slide.type === 'scripture' && outputConfig?.bibleStyleEnabled) {
    const bibleStyle = outputConfig.bibleStyle as any;
    mergedStyle.global = { ...mergedStyle.global, ...bibleStyle?.global || bibleStyle };
    if (bibleStyle?.layout) mergedStyle.layout = bibleStyle.layout;
    mergedStyle.sourceGlobal = { ...mergedStyle.sourceGlobal, ...bibleStyle?.sourceGlobal };
    if (bibleStyle?.sourceLayout) mergedStyle.sourceLayout = bibleStyle.sourceLayout;
  }

  return { styleOverrides: mergedStyle, animation };
};

const applyGlobalStyles = (slide: SlideDefinition | null, outputConfig?: OutputSettings): SlideDefinition['styleOverrides'] => {
  return resolveSlideForOutput(slide, outputConfig).styleOverrides;
};

// We import the new component for settings
import { OutputStyleEditor, OutputStyleConfig } from './components/OutputStyleEditor';

function SettingsModal({ isOpen, onClose, settings, onSave, isPresenting, onTogglePresenting, onToggleLockOutput }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  const [activeOutputId, setActiveOutputId] = useState(settings.outputs[0]?.id || 'main');
  const [local, setLocal] = useState<GlobalSettings>(settings);
  const [editingStyleType, setEditingStyleType] = useState<'lyrics' | 'scripture' | null>(null);
  const [detectedScreens, setDetectedScreens] = useState<any[]>([]);
  const [selectingTemplateForOutput, setSelectingTemplateForOutput] = useState<OutputSettings | null>(null);
  const [ndiSources, setNdiSources] = useState<NdiSource[]>(ndiService.getDiscoveredSources());
  const [isScanningNdi, setIsScanningNdi] = useState(false);
  const [showNewOutputModal, setShowNewOutputModal] = useState(false);
  const [selectedNewOutputType, setSelectedNewOutputType] = useState<OutputType | null>(null);

  useEffect(() => { setLocal(settings); }, [settings, isOpen]);
  useEffect(() => {
     const current = local.outputs.find(o => o.id === activeOutputId);
     if (!current) setActiveOutputId(local.outputs[0]?.id || 'main');
  }, [local.outputs, activeOutputId]);

  if (!isOpen) return null;

  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o) }));
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => updateOutput(activeOutputId, { defaultBackground: { type, url: ev.target?.result as string, fileName } });
    reader.readAsDataURL(file);
  };

  const detectScreens = async () => {
    try {
        if ('getScreenDetails' in window) {
            const details = await (window as any).getScreenDetails();
            setDetectedScreens(details.screens);
        } else {
            alert('Screen detection not supported in this browser or iframe.');
        }
    } catch (err: any) {
        console.warn(err);
        alert('Could not detect screens. ' + err.message);
    }
  };

  const addNewOutput = (type: OutputType) => {
    const existingOfType = local.outputs.filter(o => o.outputType === type);
    const count = existingOfType.length + 1;
    const id = `${type}-${Date.now()}`;
    const name = type === 'ndi' ? `NDI ${count}` : `Output ${local.outputs.length + 1}`;

    const newOutput: OutputSettings = {
      id,
      name,
      enabled: true,
      outputType: type,
      defaultBackground: type === 'ndi' ? null : null,
      lyricsStyleEnabled: false,
      lyricsStyle: { color: '#ffffff', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal' },
      bibleStyleEnabled: false,
      bibleStyle: {
        global: { color: '#ffffff', textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal' },
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.6 },
        sourceGlobal: { color: '#fbbf24', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal' },
        sourceLayout: { x: 0.1, y: 0.8, width: 0.8, height: 0.1 }
      },
      ...(type === 'ndi' ? {
        ndiStreamName: `FlowShow NDI - NDI ${count}`,
        ndiGroup: '',
        ndiResolution: '1920x1080' as const,
        ndiFrameRate: 30,
        ndiTransparent: true,
        ndiAlphaChannel: false
      } : {})
    };

    setLocal(prev => ({ ...prev, outputs: [...prev.outputs, newOutput] }));
    setActiveOutputId(id);
    setShowNewOutputModal(false);
    setSelectedNewOutputType(null);
  };

  const removeOutput = (id: string) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.filter(o => o.id !== id) }));
    if (activeOutputId === id) {
      setActiveOutputId(local.outputs[0]?.id || 'main');
    }
  };

  const StyleConfigurator = ({ title, enabled, styleObj, onToggle, onEdit }: any) => {
    return (
      <div className="bg-[#121214] border border-white/5 p-6 rounded-xl mb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer group">
             <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded cursor-pointer" />
             <span className="font-bold uppercase tracking-wider text-sm text-neutral-300 group-hover:text-white transition-colors">{title}</span>
          </label>
          <button 
             disabled={!enabled}
             onClick={onEdit} 
             className="bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/5"
          >
             Edit Layout & Format
          </button>
        </div>
      </div>
    );
  };

  // Output-specific configuration panel (the main config body)
  const renderOutputConfig = () => {
    if (!activeOutput) return null;
    const isNdi = activeOutput.outputType === 'ndi';
    const isHdmi = activeOutput.outputType === 'hdmi' || !activeOutput.outputType;

    return (
      <div className="space-y-6">
        {/* Enabled Toggle */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Enabled</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={activeOutput.enabled} 
                onChange={(e) => updateOutput(activeOutputId, { enabled: e.target.checked })}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Use Style / Template Selector */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-0.5">Use style</span>
              <span className="text-sm text-white font-medium">
                {activeOutput.defaultTemplateId 
                  ? (getTemplateById(activeOutput.defaultTemplateId)?.name || activeOutput.defaultTemplateId)
                  : 'Default'
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              {activeOutput.defaultTemplateId && (
                <button
                  onClick={() => updateOutput(activeOutputId, { defaultTemplateId: undefined })}
                  className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Clear style"
                >
                  <X size={16} />
                </button>
              )}
              <button
                onClick={() => setSelectingTemplateForOutput(activeOutput)}
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
                title="Select style"
              >
                <Sparkles size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* TYPE-SPECIFIC: NDI® Settings */}
        {isNdi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Wifi size={16} />
              <span className="text-sm font-bold">NDI®</span>
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden">
              {/* Size & Frame Rate Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Size</span>
                  <select 
                    value={activeOutput.ndiResolution || '1920x1080'} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiResolution: e.target.value as any })}
                    className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer w-full"
                  >
                    <option value="1920x1080" className="bg-[#121214]">1920x1080</option>
                    <option value="1280x720" className="bg-[#121214]">1280x720</option>
                    <option value="3840x2160" className="bg-[#121214]">3840x2160</option>
                  </select>
                </div>
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Frame rate</span>
                  <select 
                    value={activeOutput.ndiFrameRate || 30} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiFrameRate: parseInt(e.target.value) })}
                    className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer w-full"
                  >
                    <option value="30" className="bg-[#121214]">30 fps</option>
                    <option value="60" className="bg-[#121214]">60 fps</option>
                    <option value="25" className="bg-[#121214]">25 fps</option>
                    <option value="24" className="bg-[#121214]">24 fps</option>
                  </select>
                </div>
              </div>

              {/* Name & Group Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400 block mb-1.5">Name</span>
                  <input 
                    type="text" 
                    value={activeOutput.ndiStreamName || `FlowShow NDI - ${activeOutput.name}`}
                    onChange={(e) => updateOutput(activeOutputId, { ndiStreamName: e.target.value })}
                    className="bg-transparent text-white text-sm font-medium outline-none w-full"
                    placeholder="FlowShow NDI - NDI 1"
                  />
                </div>
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">Group</span>
                  <input 
                    type="text" 
                    value={activeOutput.ndiGroup || ''}
                    onChange={(e) => updateOutput(activeOutputId, { ndiGroup: e.target.value })}
                    className="bg-transparent text-white text-sm font-medium outline-none w-full"
                    placeholder="(default)"
                  />
                </div>
              </div>
            </div>

            {/* Transparent Toggle */}
            <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Transparent</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={activeOutput.ndiTransparent !== false} 
                    onChange={(e) => updateOutput(activeOutputId, { ndiTransparent: e.target.checked })}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">Enable 32-bit RGBA alpha channel for clean lower-thirds overlay in OBS/vMix</p>
            </div>
          </div>
        )}

        {/* TYPE-SPECIFIC: HDMI Settings */}
        {isHdmi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <MonitorPlay size={16} />
              <span className="text-sm font-bold">HDMI / DisplayPort</span>
            </div>

            <div className="bg-[#121214] border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Target Display</span>
                <button onClick={detectScreens} className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-white/10 font-medium">
                  Detect Screens
                </button>
              </div>
              <select 
                value={activeOutput.displayId || ''} 
                onChange={(e) => updateOutput(activeOutputId, { displayId: e.target.value })}
                className="bg-[#09090B] border border-white/10 rounded-lg text-sm px-3 py-2.5 text-white outline-none focus:border-blue-500 w-full"
              >
                <option value="">-- No Display Selected --</option>
                {detectedScreens.map((s, i) => (
                  <option key={s.label || i} value={s.label}>{s.label || `Display ${i + 1}`}</option>
                ))}
              </select>
              {detectedScreens.length > 0 && (
                <p className="text-[10px] text-emerald-400 mt-2">{detectedScreens.length} display(s) detected on this system</p>
              )}
              {!activeOutput.displayId && (
                <p className="text-[10px] text-orange-400 mt-2">You must select a display to go LIVE to {activeOutput.name}.</p>
              )}
            </div>
          </div>
        )}

        {/* Default Background (shared by all types) */}
        <div className="bg-[#121214] border border-white/5 p-5 rounded-xl shadow-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Default Background</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select 
              className="bg-[#09090B] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 font-medium min-w-[180px]" 
              value={activeOutput.defaultBackground ? activeOutput.defaultBackground.type : 'none'} 
              onChange={(e) => { 
                const val = e.target.value; 
                if (val === 'none') updateOutput(activeOutputId, { defaultBackground: null }); 
                else if (val === 'color') updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: '#0a0a0a' } }); 
                else if (val === 'image') updateOutput(activeOutputId, { defaultBackground: { type: 'image', url: '' } }); 
                else if (val === 'ndi') updateOutput(activeOutputId, { defaultBackground: { type: 'ndi', ndiSourceId: ndiSources[0]?.id || '', fileName: ndiSources[0]?.name || 'Live Camera Feed' } });
              }}
            >
              <option value="none">Transparent (None)</option>
              <option value="color">Solid Color</option>
              <option value="image">Media (Image / Video)</option>
              <option value="ndi">NDI Live Video Feed</option>
            </select>
            {activeOutput.defaultBackground?.type === 'color' && (
              <input type="color" value={activeOutput.defaultBackground.color || '#0a0a0a'} onChange={e => updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: e.target.value }})} className="h-9 w-14 cursor-pointer border-none bg-transparent" />
            )}
            {activeOutput.defaultBackground?.type === 'ndi' && (
              <div className="flex items-center gap-2 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                <Radio size={14} className="text-red-400 animate-pulse shrink-0" />
                <select
                  value={activeOutput.defaultBackground.ndiSourceId || ''}
                  onChange={(e) => {
                    const found = ndiSources.find(s => s.id === e.target.value);
                    updateOutput(activeOutputId, {
                      defaultBackground: { type: 'ndi', ndiSourceId: e.target.value, fileName: found?.name || 'NDI Stream' }
                    });
                  }}
                  className="bg-transparent text-xs text-white font-medium outline-none flex-1 cursor-pointer"
                >
                  {ndiSources.map(src => (
                    <option key={src.id} value={src.id} className="bg-[#121214]">{src.name} ({src.ip})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => { setIsScanningNdi(true); const found = await ndiService.scanNetworkSources(); setNdiSources([...found]); setIsScanningNdi(false); }}
                  disabled={isScanningNdi}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-bold shrink-0"
                >
                  {isScanningNdi ? 'Scanning...' : 'Scan'}
                </button>
              </div>
            )}
            {(activeOutput.defaultBackground?.type === 'image' || activeOutput.defaultBackground?.type === 'video') && (
              <div className="flex items-center gap-3 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                <label className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors shrink-0">Browse... <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" /></label>
                {activeOutput.defaultBackground.url ? (
                  <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{activeOutput.defaultBackground.fileName || 'Local Media File'}</span>
                ) : ( <span className="text-xs text-red-400 italic">No media selected yet</span> )}
              </div>
            )}
          </div>
        </div>

        {/* Style Overrides */}
        <StyleConfigurator title="Override Lyrics Style" enabled={activeOutput.lyricsStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { lyricsStyleEnabled: val })} onEdit={() => setEditingStyleType('lyrics')} />
        <StyleConfigurator title="Override Bible Style" enabled={activeOutput.bibleStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { bibleStyleEnabled: val })} onEdit={() => setEditingStyleType('scripture')} />
      </div>
    );
  };

  // Tabs marked hidden are kept for later; set hidden: false to bring one back.
  const SETTINGS_NAV = [
    { id: 'general', name: 'General', icon: Settings, hidden: true },
    { id: 'outputs', name: 'Outputs', icon: MonitorPlay },
    { id: 'style', name: 'Styles', icon: Sparkles },
    { id: 'audio', name: 'Audio', icon: Volume2, hidden: true },
    { id: 'connection', name: 'Connection', icon: Wifi, hidden: true },
    { id: 'files', name: 'Files', icon: FileText, hidden: true },
    { id: 'profiles', name: 'Profiles', icon: Layers, hidden: true },
    { id: 'theme', name: 'Theme', icon: LayoutTemplate, hidden: true },
    { id: 'smart', name: 'Smart', icon: Activity, hidden: true },
    { id: 'help', name: 'Help', icon: BookOpen }
  ].filter(item => !item.hidden);

  return (
    <>
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 lg:p-6 animate-in fade-in duration-200">
       <div className="bg-[#09090B] border border-white/10 rounded-2xl w-full max-w-6xl h-[88vh] flex overflow-hidden shadow-2xl">
          {/* LEFT SETTINGS SIDEBAR */}
          <div className="w-52 bg-[#030303] border-r border-white/5 p-4 flex flex-col gap-1 shrink-0">
             <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 px-3">Settings</div>
             {SETTINGS_NAV.map(item => {
               const Icon = item.icon;
               const isActive = activeTab === item.id;
               return (
                 <button
                   key={item.id}
                   onClick={() => setActiveTab(item.id)}
                   className={`text-left px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2.5 ${
                     isActive 
                       ? 'bg-blue-600/20 text-blue-400 shadow-sm' 
                       : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                   }`}
                 >
                   <Icon size={15} />
                   {item.name}
                 </button>
               );
             })}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#09090B]">
             <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar">
               {activeTab === 'outputs' && (
                  <div className="flex gap-6 h-full">
                     {/* Center Column: Config */}
                     <div className="flex-1 min-w-0 space-y-6">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            Outputs
                            <span className="text-xs text-neutral-500 font-normal">({local.outputs.length} active)</span>
                          </h2>
                          <div className="flex items-center gap-2 text-neutral-500">
                            <button onClick={() => alert("FlowShow Output Engine: Supports multi-screen HDMI displays and low-latency network NDI streams with 32-bit alpha transparency.")} className="p-1 hover:text-white transition-colors" title="Output Information">
                              <span className="text-xs font-mono font-bold border border-white/20 rounded-full w-4 h-4 flex items-center justify-center">i</span>
                            </button>
                          </div>
                        </div>

                        {activeOutput ? renderOutputConfig() : (
                          <div className="text-center py-16 text-neutral-500">
                            <MonitorPlay size={40} className="mx-auto mb-3 text-neutral-600" />
                            <p className="text-sm">No outputs configured. Add one below.</p>
                          </div>
                        )}
                     </div>

                     {/* Right Column: Live Output Monitor Stack (Matches Image e) */}
                     <div className="w-64 xl:w-72 border-l border-white/5 pl-6 flex flex-col gap-3 shrink-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Live Outputs</span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">MONITORS</span>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                          {local.outputs.map(out => {
                            const isSelected = activeOutputId === out.id;
                            const isNdi = out.outputType === 'ndi';
                            const isTransparent = isNdi && out.ndiTransparent !== false;

                            return (
                              <div
                                key={out.id}
                                onClick={() => setActiveOutputId(out.id)}
                                className={`rounded-xl border transition-all cursor-pointer p-2 ${
                                  isSelected 
                                    ? 'border-blue-500 bg-blue-600/10' 
                                    : 'border-white/10 bg-[#030303] hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className={`w-2 h-2 rounded-full ${out.enabled ? (isNdi ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400') : 'bg-neutral-600'}`} />
                                    <span className="text-xs font-bold text-white truncate">{out.name}</span>
                                  </div>
                                  <span className="text-[9px] font-mono uppercase px-1 rounded bg-white/5 text-neutral-400">
                                    {isNdi ? 'NDI' : 'HDMI'}
                                  </span>
                                </div>

                                <div 
                                  className="aspect-video w-full rounded-lg border border-white/5 overflow-hidden relative flex items-center justify-center"
                                  style={isTransparent ? {
                                    backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                                    backgroundSize: '12px 12px',
                                    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                                    backgroundColor: '#09090b'
                                  } : { backgroundColor: '#000000' }}
                                >
                                  {isTransparent ? (
                                    <div className="text-center z-10 select-none">
                                      <Wifi size={16} className="text-emerald-400 mx-auto mb-0.5" />
                                      <span className="text-[9px] font-mono text-white/70 block">32-bit RGBA</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono text-neutral-600 uppercase">Screen Off</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Transport / Monitor Toolbar */}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-around text-neutral-400 text-xs">
                          <button onClick={() => alert("Previous Output")} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Previous"><ChevronLeft size={14} /></button>
                          <button onClick={() => alert("Next Output")} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Next"><ChevronRight size={14} /></button>
                          <button onClick={() => onTogglePresenting?.()} className={`p-1.5 rounded hover:bg-white/5 transition-colors ${isPresenting ? 'text-red-400' : 'text-blue-400'}`} title="Play / Go Live"><Play size={14} /></button>
                          <button onClick={() => onToggleLockOutput?.(activeOutputId)} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Lock Screen"><Lock size={14} /></button>
                        </div>
                     </div>
                  </div>
               )}
               {activeTab === 'help' && (
                  <div>
                     <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Help & Documentation</h2>
                     <p className="text-neutral-400 leading-relaxed text-sm">Documentation and shortcut keys are coming soon.</p>
                  </div>
               )}
               {activeTab === 'style' && (
                  <div className="space-y-8 max-w-3xl">
                     <div className="flex items-center justify-between">
                       <div>
                         <h2 className="text-2xl font-bold text-white tracking-tight">Style Profiles</h2>
                         <p className="text-sm text-neutral-400 mt-2">Manage backgrounds and typography overrides per output screen.</p>
                       </div>
                       <div className="bg-[#030303] border border-white/5 p-1.5 rounded-xl flex gap-1 shadow-inner">
                          {local.outputs.filter(o => o.enabled).map(out => (
                             <button key={out.id} onClick={() => setActiveOutputId(out.id)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeOutputId === out.id ? 'bg-white/10 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}>{out.name}</button>
                          ))}
                       </div>
                     </div>
                     <div className="h-px bg-white/5 w-full my-8"></div>
                     <h3 className="text-xl font-bold text-blue-400 mb-6">{activeOutput?.name || 'Output'} Configuration</h3>

                     {activeOutput && (
                        <>
                           {/* Default Screen Template */}
                           <div className="bg-[#121214] border border-white/5 p-6 rounded-xl mb-6 shadow-sm">
                              <div className="flex items-center justify-between">
                                 <div>
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-200">Default Screen Template</h3>
                                    <p className="text-sm text-neutral-500 mt-1">
                                       Baseline motion style and typography layout automatically projected on {activeOutput.name}.
                                    </p>
                                 </div>
                                 <button
                                    type="button"
                                    onClick={() => setSelectingTemplateForOutput(activeOutput)}
                                    className="px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                 >
                                    <Sparkles size={14} />
                                    {activeOutput.defaultTemplateId ? 'Change Template' : 'Select Template'}
                                 </button>
                              </div>
                              {activeOutput.defaultTemplateId && (
                                 <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                       <span className="text-xs text-neutral-400 font-medium">Assigned Preset:</span>
                                       <span className="text-xs font-bold text-white bg-white/10 px-2.5 py-1 rounded border border-white/10 flex items-center gap-1.5">
                                          <Sparkles size={11} className="text-blue-400" />
                                          {getTemplateById(activeOutput.defaultTemplateId)?.name || activeOutput.defaultTemplateId}
                                       </span>
                                    </div>
                                    <button
                                       type="button"
                                       onClick={() => updateOutput(activeOutputId, { defaultTemplateId: undefined })}
                                       className="text-xs text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                                    >
                                       Clear Default
                                    </button>
                                 </div>
                              )}
                           </div>
                           <StyleConfigurator title="Override Lyrics Style" enabled={activeOutput.lyricsStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { lyricsStyleEnabled: val })} onEdit={() => setEditingStyleType('lyrics')} />
                           <StyleConfigurator title="Override Bible Style" enabled={activeOutput.bibleStyleEnabled} onToggle={(val: boolean) => updateOutput(activeOutputId, { bibleStyleEnabled: val })} onEdit={() => setEditingStyleType('scripture')} />
                        </>
                     )}
                  </div>
               )}
               {activeTab !== 'outputs' && activeTab !== 'style' && activeTab !== 'help' && (
                  <div className="py-12 text-center text-neutral-500">
                     <p className="text-base font-semibold text-neutral-400 capitalize">{activeTab} Settings</p>
                     <p className="text-xs text-neutral-500 mt-1">Options and preferences for {activeTab} will appear here.</p>
                  </div>
               )}
             </div>

             {/* BOTTOM OUTPUT TABS (Matches Image c, d, e) */}
             {activeTab === 'outputs' && (
               <div className="border-t border-white/5 bg-[#030303] flex items-center justify-between px-3 h-11 shrink-0 overflow-x-auto custom-scrollbar">
                 <div className="flex items-center gap-1">
                   {local.outputs.map(out => {
                     const isActive = activeOutputId === out.id;
                     const isNdi = out.outputType === 'ndi';
                     return (
                       <button 
                         key={out.id}
                         onClick={() => setActiveOutputId(out.id)}
                         className={`group px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all relative
                           ${isActive 
                             ? 'bg-[#121214] text-white border border-blue-500/50 shadow-sm' 
                             : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent'
                           }`}
                       >
                         {/* Checkmark icon as shown in Image c & e */}
                         <Check size={12} className={out.enabled ? (isNdi ? 'text-emerald-400' : 'text-blue-400') : 'text-neutral-600'} />
                         <span className="truncate">{out.name}</span>
                         {isNdi && <Wifi size={10} className="text-neutral-500 shrink-0" />}
                         {local.outputs.length > 1 && (
                           <button
                             onClick={(e) => { e.stopPropagation(); removeOutput(out.id); }}
                             className="ml-1 opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all shrink-0"
                             title="Remove output"
                           >
                             <X size={12} />
                           </button>
                         )}
                       </button>
                     );
                   })}
                   <button
                     onClick={() => setShowNewOutputModal(true)}
                     className="px-3 py-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-600/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-1 shrink-0"
                   >
                     <Plus size={14} />
                     New output
                   </button>
                 </div>

                 {/* Output selector button (Right side of bottom bar, from Image e) */}
                 <button
                   onClick={() => detectScreens()}
                   className="text-neutral-400 hover:text-white px-3 py-1 text-xs font-medium flex items-center gap-1.5 rounded hover:bg-white/5 transition-colors shrink-0"
                 >
                   <MonitorPlay size={13} />
                   Output selector
                 </button>
               </div>
             )}

             <div className="p-4 border-t border-white/5 bg-[#030303] flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-5 py-2 hover:bg-white/5 text-neutral-300 transition-colors rounded-lg text-xs font-medium">Cancel</button>
                <button onClick={() => { onSave(local); onClose(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg"><Save size={14} /> Save Settings</button>
             </div>
          </div>
       </div>
    </div>

    {/* MODAL: Choose Output Type */}
    {showNewOutputModal && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
        <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="p-6 flex items-center justify-between border-b border-white/5">
            <h3 className="text-lg font-bold text-white">Choose output type</h3>
            <button onClick={() => { setShowNewOutputModal(false); setSelectedNewOutputType(null); }} className="text-neutral-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Local Output */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">Local output</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedNewOutputType('hdmi')}
                  className={`p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${
                    selectedNewOutputType === 'hdmi' 
                      ? 'border-blue-500 bg-blue-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <MonitorPlay size={36} className={selectedNewOutputType === 'hdmi' ? 'text-blue-400' : ''} />
                  <div className="text-center">
                    <span className="font-bold text-sm block">Window</span>
                    <span className="text-[11px] text-neutral-500">HDMI, DisplayPort</span>
                  </div>
                </button>
                {/* Placeholder for future Blackmagic - not clickable */}
                <div className="p-6 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-3 opacity-30 cursor-not-allowed">
                  <Layers size={36} />
                  <div className="text-center">
                    <span className="font-bold text-sm block text-neutral-500">Blackmagic Design</span>
                    <span className="text-[11px] text-neutral-600">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Network Output */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">Network output</span>
              <div className="grid grid-cols-4 gap-2.5">
                <button
                  onClick={() => setSelectedNewOutputType('ndi')}
                  className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                    selectedNewOutputType === 'ndi' 
                      ? 'border-blue-500 bg-blue-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <Wifi size={24} className={selectedNewOutputType === 'ndi' ? 'text-blue-400' : ''} />
                  <div className="text-center">
                    <span className="font-bold text-xs block">NDI®</span>
                    <span className="text-[9px] text-neutral-500">IP, OBS</span>
                  </div>
                </button>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Layers size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">OMT</span>
                    <span className="text-[9px] text-neutral-600">IP</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Radio size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">WebRTC</span>
                    <span className="text-[9px] text-neutral-600">WHIP</span>
                  </div>
                </div>
                <div className="p-4 rounded-xl border-2 border-white/5 bg-[#09090B]/50 flex flex-col items-center gap-2 opacity-30 cursor-not-allowed">
                  <Tv size={24} />
                  <div className="text-center">
                    <span className="font-bold text-xs block text-neutral-500">RTMP</span>
                    <span className="text-[9px] text-neutral-600">YouTube, Twitch</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-white/5 bg-[#09090B]">
            <button
              onClick={() => { if (selectedNewOutputType) addNewOutput(selectedNewOutputType); }}
              disabled={!selectedNewOutputType}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {selectingTemplateForOutput && (
       <TemplateGalleryModal
         isOpen={true}
         onClose={() => setSelectingTemplateForOutput(null)}
         mode="select-for-output"
         targetOutputName={selectingTemplateForOutput.name}
         targetOutputId={selectingTemplateForOutput.id}
         activeTemplateId={selectingTemplateForOutput.defaultTemplateId}
         onApplyToOutput={(template, outId) => {
           const targetId = outId || selectingTemplateForOutput.id;
           updateOutput(targetId, { defaultTemplateId: template.id });
           setSelectingTemplateForOutput(null);
         }}
       />
    )}
    
    {editingStyleType && activeOutput && (
       <OutputStyleEditor
          type={editingStyleType}
          outputName={activeOutput.name}
          initialStyle={
             (() => {
                const raw = editingStyleType === 'lyrics' ? activeOutput.lyricsStyle : activeOutput.bibleStyle;
                if (!raw) return { global: {} };
                if ('global' in raw || 'layout' in raw) return raw as OutputStyleConfig;
                return { global: raw as React.CSSProperties };
             })()
          }
          onSave={(newStyle: OutputStyleConfig) => {
             if (editingStyleType === 'lyrics') {
                updateOutput(activeOutputId, { lyricsStyle: newStyle as any });
             } else {
                updateOutput(activeOutputId, { bibleStyle: newStyle as any });
             }
             setEditingStyleType(null);
          }}
          onCancel={() => setEditingStyleType(null)}
       />
    )}
    </>
  );
}

export interface PresentationItem {
  id: string;
  title: string;
  category?: 'Presentations' | 'Songs';
  createdAt?: string;
  modifiedAt?: string;
  usedAt?: string;
  slides: SlideDefinition[];
}

const MOCK_SONGS: PresentationItem[] = [
  {
    id: 'show-welcome',
    title: 'Welcome',
    category: 'Presentations',
    createdAt: 'Wednesday 18. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Wednesday 18. November, 2026',
    slides: [
      { id: 'sw-1', text: 'Welcome!', type: 'lyrics' }
    ]
  },
  {
    id: 'song1',
    title: 'Amazing Grace',
    category: 'Songs',
    createdAt: 'Sunday 15. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Wednesday 18. November, 2026',
    slides: [
      { id: 's1-1', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me', type: 'lyrics' },
      { id: 's1-3', text: 'I once was lost, but now am found\nWas blind, but now I see.', type: 'lyrics' },
    ]
  },
  {
    id: 'song2',
    title: 'How Great Thou Art',
    category: 'Songs',
    createdAt: 'Sunday 8. November, 2026',
    modifiedAt: 'Wednesday 18. November, 2026',
    usedAt: 'Sunday 15. November, 2026',
    slides: [
      { id: 's2-1', text: 'O Lord my God, When I in awesome wonder\nConsider all the worlds Thy Hands have made', type: 'lyrics' },
      { id: 's2-3', text: 'I see the stars, I hear the rolling thunder\nThy power throughout the universe displayed', type: 'lyrics' },
    ]
  }
];

function ControlPanel() {
  const [appMode, setAppMode] = useState<'show' | 'edit' | 'stage'>('show');
  const [activeTab, setActiveTab] = useState<'shows' | 'songs' | 'setlist' | 'bibles' | 'media' | 'audio'>('songs');
  const [bottomTab, setBottomTab] = useState<'shows' | 'media' | 'audio' | 'overlays' | 'templates' | 'scripture' | 'calendar' | 'functions'>('shows');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Presentations' | 'Songs'>('all');
  const [rightInspectorTab, setRightInspectorTab] = useState<'groups' | 'metadata'>('groups');
  const [selectedProjectFolder, setSelectedProjectFolder] = useState<string>('11/18/26');
  const [slideViewMode, setSlideViewMode] = useState<'grid' | 'list'>('grid');

  // Inline template grid
  const [inlineTemplates, setInlineTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  const [inlineTemplateCategory, setInlineTemplateCategory] = useState<string>('all');

  // Resizable bottom panel
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
  const bottomDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomPanelHeight;
    bottomDragRef.current = { startY, startH };
    let dragged = false;

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY; // drag up → bigger
      if (Math.abs(delta) > 3) dragged = true;
      const next = Math.max(120, Math.min(600, startH + delta));
      setBottomPanelHeight(next);
      if (bottomPanelCollapsed && delta > 20) setBottomPanelCollapsed(false);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // If barely moved, treat as a click → toggle collapse
      if (!dragged) setBottomPanelCollapsed(c => !c);
      bottomDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [serviceSetlist, setServiceSetlist] = useState<ServiceSetlist>(DEFAULT_SAMPLE_SETLIST);
  const [activeSetlistItemId, setActiveSetlistItemId] = useState<string | null>(null);
  const [setlistViewMode, setSetlistViewMode] = useState<'slides' | 'manager'>('slides');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [songsList, setSongsList] = useState(MOCK_SONGS);
  const [songSearchQuery, setSongSearchQuery] = useState('');
  
  const [previewSlide, setPreviewSlide] = useState<SlideDefinition | null>(null);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const handleNextSlide = () => {
    const currentSong = songsList[activeItemIndex];
    if (!currentSong || !currentSong.slides || currentSong.slides.length === 0) return;
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
  };

  const handlePrevSlide = () => {
    const currentSong = songsList[activeItemIndex];
    if (!currentSong || !currentSong.slides || currentSong.slides.length === 0) return;
    const currentSlideId = previewSlide?.id || liveState.slide?.id;
    const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
    if (currentIndex > 0) {
      const prevSlide = currentSong.slides[currentIndex - 1];
      setPreviewSlide(prevSlide);
      goLive(prevSlide);
    }
  };

  useEffect(() => {
    loadCurrentSetlist().then(sl => {
      if (sl && sl.items && sl.items.length > 0) {
        setServiceSetlist(sl);
        const firstPlayable = sl.items.find(i => i.type !== 'header');
        if (firstPlayable) setActiveSetlistItemId(firstPlayable.id);
      }
    });
  }, []);

  const handleUpdateSetlist = (newSetlist: ServiceSetlist) => {
    setServiceSetlist(newSetlist);
    saveCurrentSetlist(newSetlist);
  };

  const handleAddSongToSetlist = (song: typeof songsList[0]) => {
    const newItem: SetlistItem = {
      id: `setlist-song-${Date.now()}`,
      type: 'song',
      title: song.title,
      subtitle: `${song.slides.length} Slides`,
      songId: song.id,
      slides: song.slides
    };
    const updated = {
      ...serviceSetlist,
      items: [...serviceSetlist.items, newItem]
    };
    handleUpdateSetlist(updated);
  };

  useEffect(() => {
    get('globalSettings').then((val: any) => { 
        if (val) {
            // Merge default outputs with saved settings
            const mergedOutputs = DEFAULT_SETTINGS.outputs.map(defOut => {
                const savedOut = val.outputs?.find((o: any) => o.id === defOut.id);
                if (savedOut) {
                    return { 
                        ...defOut, 
                        ...savedOut, 
                        outputType: savedOut.outputType || defOut.outputType || 'hdmi',
                        enabled: savedOut.enabled !== undefined ? savedOut.enabled : defOut.enabled,
                        lyricsStyle: { ...(defOut.lyricsStyle as any), ...(savedOut.lyricsStyle as any) },
                        bibleStyle: { ...(defOut.bibleStyle as any), ...(savedOut.bibleStyle as any) }
                    };
                }
                return defOut;
            });
            // Also include any dynamically added outputs (ndi, extra hdmi) not in defaults
            const extraOutputs = (val.outputs || []).filter((o: any) => !DEFAULT_SETTINGS.outputs.find(d => d.id === o.id));
            const allOutputs = [...mergedOutputs, ...extraOutputs.map((o: any) => ({ ...o, outputType: o.outputType || 'hdmi' }))];
            setGlobalSettings({ ...DEFAULT_SETTINGS, ...val, outputs: allOutputs });
        }
    });
    get('songsList').then((val) => { if (val) setSongsList(val); });
  }, []);

  useEffect(() => {
    set('globalSettings', globalSettings).catch(()=>{});
    setLiveState(prev => ({ ...prev, settings: globalSettings }));
    ndiService.syncWithOutputs(globalSettings.outputs);
  }, [globalSettings]);

  useEffect(() => { if (songsList !== MOCK_SONGS) set('songsList', songsList).catch(() => {}); }, [songsList]);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'song'|'bible'|'slide', id: string | number } | null>(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // --- BIBLE STATE ---
  const [bibleList, setBibleList] = useState<{id: string, name: string}[]>([]);
  const [activeBibleId, setActiveBibleId] = useState<string | null>(null);
  const [activeBibleData, setActiveBibleData] = useState<BibleVersion | null>(null);
  
  const [bibleSearchQuery, setBibleSearchQuery] = useState('');
  const [bibleKeywordQuery, setBibleKeywordQuery] = useState('');
  const [bibleKeywordResults, setBibleKeywordResults] = useState<SlideDefinition[]>([]);
  const [bibleHistory, setBibleHistory] = useState<SlideDefinition[]>([]);
  const [showBibleHistory, setShowBibleHistory] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [activeBibleBookIndex, setActiveBibleBookIndex] = useState<number | null>(null);
  const [activeBibleChapterIndex, setActiveBibleChapterIndex] = useState<number | null>(null);
  const [activeBibleVerseIndex, setActiveBibleVerseIndex] = useState<number | null>(null);
  
  const bIndexRef = useRef(activeBibleBookIndex);
  const cIndexRef = useRef(activeBibleChapterIndex);
  const vIndexRef = useRef(activeBibleVerseIndex);
  const verseListRef = useRef<HTMLDivElement>(null);
  const bookListRef = useRef<HTMLDivElement>(null);
  const chapterListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bIndexRef.current = activeBibleBookIndex; }, [activeBibleBookIndex]);
  useEffect(() => { cIndexRef.current = activeBibleChapterIndex; }, [activeBibleChapterIndex]);
  useEffect(() => { vIndexRef.current = activeBibleVerseIndex; }, [activeBibleVerseIndex]);

  // SMART AUTO-SCROLL HOOKS
  const isShowingThreeColumns = !bibleSearchQuery && !bibleKeywordQuery && !showBibleHistory;

  useEffect(() => {
      if (activeBibleBookIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (bookListRef.current) {
                  const el = bookListRef.current.children[activeBibleBookIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleBookIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleChapterIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (chapterListRef.current) {
                  const el = chapterListRef.current.children[activeBibleChapterIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
          }, 20);
      }
  }, [activeBibleChapterIndex, isShowingThreeColumns]);

  useEffect(() => {
      if (activeBibleVerseIndex !== null && isShowingThreeColumns) {
          setTimeout(() => {
              if (verseListRef.current) {
                  const el = verseListRef.current.children[activeBibleVerseIndex] as HTMLElement;
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 20);
      }
  }, [activeBibleVerseIndex, isShowingThreeColumns]);


  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
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

  // Global Video Controls (Synchronizes Preview and Program monitors)
  const broadcastVideoCommand = (command: string, value?: any) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'VIDEO_CMD', command, value });
    channel.close();
  };

  const togglePlay = () => {
    const nextState = !isVideoPlaying;
    setIsVideoPlaying(nextState);
    
    // Control all local preview videos globally
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
       if (nextState) v.play().catch(()=>{});
       else v.pause();
    });

    broadcastVideoCommand(nextState ? 'play' : 'pause');
  };

  const toggleMute = () => {
    const nextState = !isVideoMuted;
    setIsVideoMuted(nextState);
    broadcastVideoCommand('mute', nextState);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setVideoCurrentTime(time);
    
    document.querySelectorAll<HTMLVideoElement>('.bg-video-player').forEach(v => {
        v.currentTime = time;
    });

    broadcastVideoCommand('seek', time);
  };

  const pushToBibleHistory = (slide: SlideDefinition) => {
     if (slide.type !== 'scripture') return;
     setBibleHistory(prev => {
        const filtered = prev.filter(s => s.id !== slide.id);
        return [slide, ...filtered].slice(0, 50);
     });
  };

  // Keyboard Navigation Support & Live Production Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Global Production Hotkeys
      if (e.key === 'F1' || ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        togglePresenting();
        return;
      }
      if (e.key === 'F2' || ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        toggleClearText();
        return;
      }
      if (e.key === 'F3' || ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setGlobalBackground(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAll();
        return;
      }

      // FORWARD PROGRESSION (Space, PageDown, ArrowDown, ArrowRight)
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
         e.preventDefault();

         if (activeTab === 'setlist') {
            const currentItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
            if (currentItem && currentItem.slides && currentItem.slides.length > 0) {
               const currentSlideId = previewSlide?.id || liveState.slide?.id;
               const currentIndex = currentItem.slides.findIndex(s => s.id === currentSlideId);

               if (currentIndex >= 0 && currentIndex < currentItem.slides.length - 1) {
                  const nextSlide = currentItem.slides[currentIndex + 1];
                  setPreviewSlide(nextSlide);
                  goLive(nextSlide);
               } else if (currentIndex === -1) {
                  const firstSlide = currentItem.slides[0];
                  setPreviewSlide(firstSlide);
                  goLive(firstSlide);
               } else {
                  // CONTINUOUS SETLIST PROGRESSION: Move to the next playable item in the service queue!
                  const currentItemIdx = serviceSetlist.items.findIndex(i => i.id === activeSetlistItemId);
                  if (currentItemIdx !== -1) {
                     for (let nextI = currentItemIdx + 1; nextI < serviceSetlist.items.length; nextI++) {
                        const nextItem = serviceSetlist.items[nextI];
                        if (nextItem.type !== 'header' && nextItem.slides && nextItem.slides.length > 0) {
                           setActiveSetlistItemId(nextItem.id);
                           const firstSlide = nextItem.slides[0];
                           setPreviewSlide(firstSlide);
                           goLive(firstSlide);
                           break;
                        }
                     }
                  }
               }
            }
         } else if (activeTab === 'songs') {
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
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
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
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      } 
      // BACKWARD PROGRESSION (PageUp, ArrowLeft, ArrowUp)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
         e.preventDefault();

         if (activeTab === 'setlist') {
            const currentItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
            if (currentItem && currentItem.slides && currentItem.slides.length > 0) {
               const currentSlideId = previewSlide?.id || liveState.slide?.id;
               const currentIndex = currentItem.slides.findIndex(s => s.id === currentSlideId);

               if (currentIndex > 0) {
                  const prevSlide = currentItem.slides[currentIndex - 1];
                  setPreviewSlide(prevSlide);
                  goLive(prevSlide);
               } else if (currentIndex === 0) {
                  // CONTINUOUS SETLIST PROGRESSION: Jump to previous playable item in the service queue!
                  const currentItemIdx = serviceSetlist.items.findIndex(i => i.id === activeSetlistItemId);
                  if (currentItemIdx > 0) {
                     for (let prevI = currentItemIdx - 1; prevI >= 0; prevI--) {
                        const prevItem = serviceSetlist.items[prevI];
                        if (prevItem.type !== 'header' && prevItem.slides && prevItem.slides.length > 0) {
                           setActiveSetlistItemId(prevItem.id);
                           const lastSlide = prevItem.slides[prevItem.slides.length - 1];
                           setPreviewSlide(lastSlide);
                           goLive(lastSlide);
                           break;
                        }
                     }
                  }
               }
            }
         } else if (activeTab === 'songs') {
            const currentSong = songsList[activeItemIndex];
            if (!currentSong) return;
            const currentSlideId = previewSlide?.id || liveState.slide?.id;
            const currentIndex = currentSong.slides.findIndex(s => s.id === currentSlideId);
            if (currentIndex > 0) {
               const prevSlide = currentSong.slides[currentIndex - 1];
               setPreviewSlide(prevSlide);
               goLive(prevSlide);
            }
         } else if (activeTab === 'bibles' && isShowingThreeColumns) {
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
               pushToBibleHistory(slide);
               if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
            }
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, activeItemIndex, serviceSetlist, activeSetlistItemId, activeBibleData, activeBibleBookIndex, activeBibleChapterIndex, activeBibleVerseIndex, liveState, previewSlide, songsList, isShowingThreeColumns]);


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
                    
                    setPreviewSlide(slide); 
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
    const config = liveState.settings?.outputs.find(o => o.id === outputId);
    if (!config?.displayId) {
        alert(`You must select a display screen for ${config?.name || outputId} before it can go LIVE. Please check Settings > Outputs.`);
        return;
    }

    const label = `projector-${outputId}`;
    const url = `/projector/${outputId}`;

    let wFeatures = 'width=1280,height=720,menubar=no,toolbar=no';
    try {
        if ('getScreenDetails' in window) {
             const details = await (window as any).getScreenDetails();
             const screen = details.screens.find((s: any) => s.label === config.displayId);
             if (screen) {
                 wFeatures = `left=${screen.availLeft},top=${screen.availTop},width=${screen.width},height=${screen.height},menubar=no,toolbar=no,fullscreen=yes`;
             }
        }
    } catch(err) {
        console.warn('Could not query window management params', err);
    }

    if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) { await existing.setFocus(); return; }
        new WebviewWindow(label, { url: url, title: `Live Display - ${outputId.toUpperCase()}`, width: 1280, height: 720, transparent: true });
        return;
      } catch (err) { console.warn('Failed to open Tauri native window', err); }
    }
    
    window.open(url, `FlowShow_${outputId}`, wFeatures);
  };

  const goLive = (slide: SlideDefinition) => {
      setLiveState(prev => ({ ...prev, slide, clearText: false, clearedOutputs: {} }));
      setPreviewSlide(slide);
  };
  
  const setGlobalBackground = (url: string | null, type: 'image' | 'video' = 'image') => setLiveState(prev => ({ ...prev, globalBackground: url ? { url, type } : null, clearedOutputs: {} }));

  const handleJumpToVerse = (slide: SlideDefinition, isDoubleClick: boolean = false) => {
      if (activeBibleData && slide.source) {
          const match = slide.source.match(/^(.+)\s+(\d+):(\d+)$/);
          if (match) {
              const bName = match[1];
              const cNum = parseInt(match[2], 10);
              const vNum = parseInt(match[3], 10);

              const bIdx = activeBibleData.books.findIndex(b => b.name === bName);
              if (bIdx !== -1) {
                  setActiveBibleBookIndex(bIdx);
                  const cIdx = activeBibleData.books[bIdx].chapters.findIndex(c => c.c === cNum);
                  if (cIdx !== -1) {
                      setActiveBibleChapterIndex(cIdx);
                      const vIdx = activeBibleData.books[bIdx].chapters[cIdx].verses.findIndex(v => v.v === vNum);
                      if (vIdx !== -1) {
                          setActiveBibleVerseIndex(vIdx);
                      }
                  }
              }
          }
      }

      setBibleSearchQuery('');
      setBibleKeywordQuery('');
      setShowBibleHistory(false);
      
      setPreviewSlide(slide);
      pushToBibleHistory(slide);

      if (isDoubleClick) {
         goLive(slide);
      } else if (liveState.slide?.type === 'scripture' && !liveState.clearText) {
         goLive(slide);
      }
  };

  const handleVerseClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     setPreviewSlide(slide);
     pushToBibleHistory(slide);
     if (liveState.slide?.type === 'scripture' && !liveState.clearText) goLive(slide);
  };

  const handleVerseDoubleClick = (slide: SlideDefinition, vIdx: number) => {
     setActiveBibleVerseIndex(vIdx);
     pushToBibleHistory(slide);
     goLive(slide);
  };

  const handleKeywordSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setBibleKeywordQuery(val);
      setBibleSearchQuery('');
      setShowBibleHistory(false);
      
      if (!activeBibleData || !val.trim()) {
          setBibleKeywordResults([]);
          return;
      }

      const terms = val.toLowerCase().split(/\s+/).filter(Boolean);
      let results: {slide: SlideDefinition, score: number}[] = [];
      
      for (const b of activeBibleData.books) {
         for (const c of b.chapters) {
            for (const v of c.verses) {
               const text = v.lines.join(' ').toLowerCase();
               let score = 0;
               let allMatch = true;
               for (const t of terms) {
                  if (text.includes(t)) score += 1;
                  else allMatch = false; 
               }
               if (allMatch) {
                  if (text.includes(val.toLowerCase())) score += 10;
                  results.push({
                     slide: { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' },
                     score
                  });
               }
            }
         }
      }
      results.sort((a, b) => b.score - a.score);
      setBibleKeywordResults(results.slice(0, 50).map(r => r.slide));
  };

  const handleBibleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    setBibleKeywordQuery('');
    setShowBibleHistory(false);
    
    if (!activeBibleData) {
        setBibleSearchQuery(val);
        return;
    }

    const match = val.match(/^(\d?\s*[a-zA-Z]+)(?:([\s:]+)(\d+))?(?:([\s:]+)(\d+))?([:\s]*)$/);
    
    if (match) {
        const bStr = match[1];
        const cSep = match[2] || '';
        const cStr = match[3];
        const vSep = match[4] || '';
        const vStr = match[5];
        const trailing = match[6] || '';

        const resolveAlias = (q: string) => {
            const str = q.toLowerCase().replace(/\s/g, '');
            if (str === 'duet' || str === 'deut') return 'deuteronomy';
            if (str === 'ps') return 'psalms';
            if (str === 'song' || str === 'sos') return 'songofsolomon';
            if (str === 'rev') return 'revelation';
            return str;
        };

        const bSearch = resolveAlias(bStr);
        const bIdx = activeBibleData.books.findIndex(b => b.name.toLowerCase().replace(/\s/g, '').startsWith(bSearch));
        
        if (bIdx !== -1) {
            setActiveBibleBookIndex(bIdx);
            const book = activeBibleData.books[bIdx];
            let finalVal = bStr;
            
            if (cStr) {
                let cNum = parseInt(cStr, 10);
                const maxC = book.chapters.length;
                if (cNum > maxC) cNum = maxC; 
                if (cNum < 1) cNum = 1;
                finalVal += cSep + cNum;
                
                const cIdx = cNum - 1;
                if (cIdx >= 0 && cIdx < maxC) {
                    setActiveBibleChapterIndex(cIdx);
                    const chapter = book.chapters[cIdx];
                    
                    if (vStr) {
                        let vNum = parseInt(vStr, 10);
                        const maxV = Math.max(...chapter.verses.map(v => v.v));
                        if (vNum > maxV) vNum = maxV;
                        if (vNum < 1) vNum = 1;
                        finalVal += vSep + vNum;

                        const vIdx = chapter.verses.findIndex(v => v.v === vNum);
                        if (vIdx !== -1) {
                            setActiveBibleVerseIndex(vIdx);
                        }
                    } else {
                        setActiveBibleVerseIndex(null);
                    }
                }
            } else {
                setActiveBibleChapterIndex(null);
                setActiveBibleVerseIndex(null);
            }
            finalVal += trailing;
            val = finalVal;
        }
    }
    setBibleSearchQuery(val);
  };

  const handleBibleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeBibleData) return;
    
    if (e.key === ' ' || e.key === 'ArrowRight') {
        if (activeBibleBookIndex !== null) {
            const book = activeBibleData.books[activeBibleBookIndex];
            
            if (!/\d/.test(bibleSearchQuery) || /^[1-3]\s*[a-zA-Z]+$/.test(bibleSearchQuery)) {
                e.preventDefault();
                setBibleSearchQuery(`${book.name} `);
                return;
            }
            
            const chapMatch = bibleSearchQuery.match(/^(\d?\s*[a-zA-Z]+\s+\d+)$/);
            if (chapMatch) {
                e.preventDefault();
                setBibleSearchQuery(`${chapMatch[1]}:`);
                return;
            }
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleVerseIndex !== null) {
            const b = activeBibleData.books[activeBibleBookIndex];
            const c = b.chapters[activeBibleChapterIndex];
            const v = c.verses[activeBibleVerseIndex];
            const slide = { id: `b-${b.name}-${c.c}-${v.v}`, text: v.lines.join('\n'), source: `${b.name} ${c.c}:${v.v}`, type: 'scripture' as SlideType };
            handleJumpToVerse(slide, true);
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
     const slide = { id: `auto-${Date.now()}`, type: 'scripture' as SlideType, text: foundText, source: sourceString };
     pushToBibleHistory(slide);
     goLive(slide);
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

  const toggleClearText = () => {
     setLiveState(prev => ({ ...prev, clearText: !prev.clearText }));
     setPreviewSlide(null);
  };
  const clearAll = () => {
     setLiveState(prev => ({ ...prev, slide: undefined, globalBackground: null, clearText: false, clearedOutputs: {} }));
     setPreviewSlide(null);
  };

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
      const filteredSongs = songsList.filter(song => {
         if (!songSearchQuery.trim()) return true;
         const q = songSearchQuery.toLowerCase();
         if (song.title.toLowerCase().includes(q)) return true;
         return song.slides.some(s => s.text.toLowerCase().includes(q));
      }).sort((a, b) => {
         if (!songSearchQuery.trim()) return 0;
         const q = songSearchQuery.toLowerCase();
         const aTitle = a.title.toLowerCase().includes(q);
         const bTitle = b.title.toLowerCase().includes(q);
         if (aTitle && !bTitle) return -1;
         if (!aTitle && bTitle) return 1;
         return 0;
      });

      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <div className="relative">
               <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
               <input 
                 type="text" 
                 placeholder="Search Songs & Lyrics..." 
                 value={songSearchQuery}
                 onChange={(e) => setSongSearchQuery(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-neutral-200 placeholder:text-neutral-500" 
               />
             </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {filteredSongs.map((song) => {
              const originalIndex = songsList.findIndex(s => s.id === song.id);
              return (
                 <div key={song.id} onContextMenu={(e) => handleContextMenu(e, 'song', song.id)} onClick={() => setActiveItemIndex(originalIndex)} className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center justify-between transition-colors ${activeItemIndex === originalIndex ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                   <div className="flex items-center gap-3 min-w-0">
                     <FileText size={14} className={activeItemIndex === originalIndex ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} />
                     <span className="text-sm font-medium truncate">{song.title}</span>
                   </div>
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       handleAddSongToSetlist(song);
                     }}
                     className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-600/20 text-neutral-400 hover:text-blue-400 rounded transition-all text-xs flex items-center gap-1 shrink-0"
                     title="Add to Service Order"
                   >
                     <ListOrdered size={12} />
                   </button>
                 </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-white/5 shrink-0">
             <button onClick={() => setIsAddSongModalOpen(true)} className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-neutral-300 flex justify-center items-center gap-2 transition-all"><Plus size={14} /> New Song</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'setlist') {
      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-3 border-b border-white/5 shrink-0 flex items-center justify-between">
             <div className="min-w-0">
               <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 block">Service Order</span>
               <span className="text-xs font-bold text-white truncate block">{serviceSetlist.name}</span>
             </div>
             <button 
               onClick={() => setSetlistViewMode(prev => prev === 'manager' ? 'slides' : 'manager')}
               className={`text-[10px] px-2 py-1 rounded font-bold transition-all ${setlistViewMode === 'manager' ? 'bg-blue-600 text-white' : 'bg-white/5 hover:bg-white/10 text-neutral-300'}`}
               title="Toggle Order of Service Planner"
             >
               {setlistViewMode === 'manager' ? 'Slides' : 'Edit'}
             </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
             {serviceSetlist.items.length === 0 ? (
               <div className="p-6 text-center text-xs text-neutral-500">Service order is empty.</div>
             ) : (
               serviceSetlist.items.map((item, idx) => {
                 if (item.type === 'header') {
                   return (
                     <div key={item.id} className="pt-2 pb-1 px-2.5 flex items-center gap-2 border-b border-white/5">
                       <div className="w-1.5 h-3 rounded-full" style={{ backgroundColor: item.headerColor || '#3b82f6' }} />
                       <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 truncate">{item.title}</span>
                     </div>
                   );
                 }
                 const isItemActive = activeSetlistItemId === item.id;
                 return (
                   <div 
                     key={item.id}
                     onClick={() => {
                       setActiveSetlistItemId(item.id);
                       setSetlistViewMode('slides');
                       if (item.slides && item.slides.length > 0) {
                         setPreviewSlide(item.slides[0]);
                       }
                     }}
                     className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all ${
                       isItemActive 
                         ? 'bg-blue-600/15 border border-blue-500/40 text-white shadow-sm' 
                         : 'hover:bg-white/5 text-neutral-400 border border-transparent'
                     }`}
                   >
                     <div className="flex items-center gap-2 min-w-0">
                       <span className="text-[10px] font-mono text-neutral-500 w-4">{idx + 1}</span>
                       <div className="shrink-0 text-neutral-400">
                         {item.type === 'song' && <Music size={12} className={isItemActive ? 'text-blue-400' : ''} />}
                         {item.type === 'scripture' && <BookOpen size={12} className={isItemActive ? 'text-emerald-400' : ''} />}
                         {item.type === 'media' && <ImageIcon size={12} className={isItemActive ? 'text-purple-400' : ''} />}
                       </div>
                       <span className="text-xs font-medium truncate">{item.title}</span>
                     </div>
                     <span className="text-[9px] font-mono text-neutral-500 shrink-0">{item.slides?.length || 0}</span>
                   </div>
                 );
               })
             )}
          </div>
          <div className="p-3 border-t border-white/5 shrink-0 flex gap-1.5">
             <button 
               onClick={() => setSetlistViewMode('manager')}
               className="flex-1 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
             >
               <ListOrdered size={13} />
               Manage Service
             </button>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'bibles') {
      return (
        <div className="flex flex-col h-full bg-[#121214]">
          <div className="p-4 border-b border-white/5 shrink-0">
             <label className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-medium text-sm py-2.5 rounded-lg cursor-pointer transition-all">
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
                  className={`group px-4 py-3 cursor-pointer border-b border-white/5 flex items-center transition-colors ${activeBibleId === bible.id ? 'bg-blue-600/10 border-l-2 border-l-blue-500 text-white' : 'hover:bg-white/5 border-l-2 border-l-transparent text-neutral-400'}`}>
                  <div className="flex items-center gap-3 min-w-0"><BookOpen size={14} className={activeBibleId === bible.id ? "text-blue-500" : "text-neutral-500 transition-colors group-hover:text-neutral-400"} /><span className="text-sm font-medium truncate">{bible.name}</span></div>
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
      const isSearchingKeyword = bibleKeywordQuery.trim().length > 0;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           <div className="p-4 border-b border-white/5 shrink-0 flex flex-wrap gap-4 items-center bg-[#09090B] shadow-sm z-10 relative">
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleSearchQuery} 
                   onChange={handleBibleSearchChange}
                   onKeyDown={handleBibleSearchKeyDown}
                   placeholder="Ref (Joh 3 16)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <div className="relative flex-1 min-w-[200px]">
                 <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
                 <input 
                   type="text" 
                   value={bibleKeywordQuery} 
                   onChange={handleKeywordSearchChange}
                   placeholder="Keyword (God so loved)..." 
                   className="w-full bg-white/5 border border-white/10 rounded-lg text-sm px-9 py-2 outline-none focus:border-white/20 transition-all text-white placeholder:text-neutral-500"
                 />
              </div>
              <button 
                 onClick={() => {
                     setBibleSearchQuery('');
                     setBibleKeywordQuery('');
                     setShowBibleHistory(!showBibleHistory);
                 }}
                 className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${showBibleHistory ? 'bg-blue-600 text-white shadow-md' : 'bg-white/5 border border-transparent text-neutral-400 hover:text-white hover:bg-white/10'}`}
              >
                 <Clock size={16} /> History
              </button>
              <span className="text-sm font-medium text-neutral-400 ml-auto">{activeBibleData?.name || 'No Bible Selected'}</span>
           </div>

           {showBibleHistory ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Clock size={20}/> Session History</h2>
                 {bibleHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm">No verses viewed in this session yet.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleHistory.map((slide, idx) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={`${slide.id}-${idx}`} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : isSearchingKeyword ? (
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#09090B]">
                 {bibleKeywordResults.length === 0 ? (
                    <div className="text-center text-neutral-500 text-sm mt-10">No keyword matches found.</div>
                 ) : (
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                       {bibleKeywordResults.map((slide) => {
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         return (
                           <div 
                              key={slide.id} 
                              onClick={() => handleJumpToVerse(slide, false)}
                              onDoubleClick={() => handleJumpToVerse(slide, true)}
                              className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                           >
                              <span className={`text-xs font-bold mt-1.5 shrink-0 w-24 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{slide.source}</span>
                              <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{slide.text}</p>
                           </div>
                         );
                       })}
                    </div>
                 )}
              </div>
           ) : (
              <div className="flex flex-1 min-h-0 overflow-hidden bg-[#09090B]">
                 <div className="w-48 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={bookListRef}>
                    {activeBibleData?.books.map((book, idx) => (
                       <button key={book.name} onClick={() => { setActiveBibleBookIndex(idx); setActiveBibleChapterIndex(0); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-left px-5 py-3 text-sm border-b border-white/5 transition-colors truncate ${activeBibleBookIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold border-l-2 border-l-blue-500' : 'text-neutral-400 hover:bg-white/5 hover:text-white border-l-2 border-l-transparent'}`}>{book.name}</button>
                    ))}
                 </div>
                 <div className="w-20 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#121214] shrink-0" ref={chapterListRef}>
                    {activeBibleBookIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters.map((chapter, idx) => (
                       <button key={chapter.c} onClick={() => { setActiveBibleChapterIndex(idx); setActiveBibleVerseIndex(0); setBibleSearchQuery(''); }} className={`w-full text-center px-2 py-3 text-sm border-b border-white/5 transition-colors ${activeBibleChapterIndex === idx ? 'bg-blue-600/10 text-blue-400 font-semibold shadow-inner' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>{chapter.c}</button>
                    ))}
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#09090B]">
                    <div className="flex flex-col gap-3 max-w-4xl mx-auto" ref={verseListRef}>
                      {activeBibleBookIndex !== null && activeBibleChapterIndex !== null && activeBibleData?.books[activeBibleBookIndex]?.chapters[activeBibleChapterIndex]?.verses.map((verse, vIdx) => {
                         const slide: SlideDefinition = { id: `b-${activeBibleData.books[activeBibleBookIndex].name}-${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}-${verse.v}`, text: verse.lines.join('\n'), source: `${activeBibleData.books[activeBibleBookIndex].name} ${activeBibleData.books[activeBibleBookIndex].chapters[activeBibleChapterIndex].c}:${verse.v}`, type: 'scripture' };
                         const isLive = liveState.slide?.id === slide.id;
                         const isPreview = previewSlide?.id === slide.id;
                         const isNextLogical = activeBibleVerseIndex !== null && vIdx === activeBibleVerseIndex + 1;
                         
                         return (
                            <div 
                               key={verse.v} 
                               onClick={() => handleVerseClick(slide, vIdx)}
                               onDoubleClick={() => handleVerseDoubleClick(slide, vIdx)}
                               className={`p-5 rounded-xl cursor-pointer border transition-all flex gap-5 ${isLive ? 'bg-red-600/10 border-red-500/50 text-white shadow-lg' : isPreview ? 'bg-blue-600/10 border-blue-500/50 text-white' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 text-neutral-300 shadow-sm'}`}
                            >
                               <span className={`text-xs font-bold mt-1.5 shrink-0 w-8 text-right ${isLive || isPreview ? 'text-white/80' : 'text-neutral-500'}`}>{verse.v}</span>
                               <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{verse.lines.join('\n')}</p>
                            </div>
                         );
                      })}
                    </div>
                 </div>
              </div>
           )}
        </div>
      );
    }

    if (activeTab === 'setlist') {
      const activeItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
      
      if (setlistViewMode === 'manager' || !activeItem || activeItem.type === 'header' || !activeItem.slides || activeItem.slides.length === 0) {
        return (
          <SetlistManager
            setlist={serviceSetlist}
            onUpdateSetlist={handleUpdateSetlist}
            activeItemId={activeSetlistItemId}
            onSelectItem={(item) => {
              setActiveSetlistItemId(item.id);
              if (item.type !== 'header' && item.slides && item.slides.length > 0) {
                setSetlistViewMode('slides');
                setPreviewSlide(item.slides[0]);
              }
            }}
            availableSongs={songsList}
            onGoLive={goLive}
          />
        );
      }

      // Render Item Slide Grid
      const playableItems = serviceSetlist.items.filter(i => i.type !== 'header' && i.slides && i.slides.length > 0);
      const currPlayableIndex = playableItems.findIndex(i => i.id === activeItem.id);
      const prevPlayableItem = currPlayableIndex > 0 ? playableItems[currPlayableIndex - 1] : null;
      const nextPlayableItem = currPlayableIndex < playableItems.length - 1 ? playableItems[currPlayableIndex + 1] : null;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
          {/* Item Toolbar */}
          <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400">
                {activeItem.type === 'song' ? <Music size={18} /> : <BookOpen size={18} />}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-wide">{activeItem.title}</h2>
                <span className="text-[11px] text-neutral-400">{activeItem.subtitle || `${activeItem.slides.length} Slides`} • In Service Queue</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsTemplateGalleryOpen(true)}
                className="text-xs bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/40 px-3.5 py-2 rounded-lg transition-all text-blue-400 hover:text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles size={14} className="text-blue-400" />
                Templates & Motion
              </button>
              <button 
                onClick={() => setSetlistViewMode('manager')}
                className="text-xs bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg text-neutral-300 font-medium transition-colors"
              >
                Service Overview
              </button>
              <div className="h-4 w-px bg-white/10 mx-1" />
              <button
                disabled={!prevPlayableItem}
                onClick={() => {
                  if (prevPlayableItem) {
                    setActiveSetlistItemId(prevPlayableItem.id);
                    if (prevPlayableItem.slides?.[0]) setPreviewSlide(prevPlayableItem.slides[0]);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-neutral-300 hover:text-white transition-all"
                title={prevPlayableItem ? `Previous: ${prevPlayableItem.title}` : 'No previous item'}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={!nextPlayableItem}
                onClick={() => {
                  if (nextPlayableItem) {
                    setActiveSetlistItemId(nextPlayableItem.id);
                    if (nextPlayableItem.slides?.[0]) setPreviewSlide(nextPlayableItem.slides[0]);
                  }
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-neutral-300 hover:text-white transition-all"
                title={nextPlayableItem ? `Next: ${nextPlayableItem.title}` : 'No next item'}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Slide Grid */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#09090B] custom-scrollbar">
            <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start">
              {activeItem.slides.map((slide, i) => {
                const isLive = liveState.slide?.id === slide.id;
                const isPreview = previewSlide?.id === slide.id;
                const currentSlideId = previewSlide?.id || liveState.slide?.id;
                const currentIndex = activeItem.slides!.findIndex(s => s.id === currentSlideId);
                const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                return (
                  <div
                    key={slide.id}
                    onClick={() => {
                      setPreviewSlide(slide);
                      goLive(slide);
                    }}
                    className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                      ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : isPreview ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'}
                    `}
                  >
                    <FixedStage className="w-full h-full pointer-events-none">
                      <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'))} />
                    </FixedStage>
                    <div className="absolute top-2 left-2 text-[10px] font-bold text-neutral-500 bg-[#09090B]/80 px-2 py-0.5 rounded shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'songs') {
      const activeSong = songsList[activeItemIndex];
      if (!activeSong) return <div className="flex-1 flex items-center justify-center text-neutral-500">No Song Selected</div>;

      return (
        <div className="flex flex-col h-full bg-[#09090B]">
           {/* Toolbar */}
           <div className="h-14 bg-[#09090B] border-b border-white/5 flex items-center justify-between px-6 shrink-0 shadow-sm">
             <div className="flex items-center gap-3">
                <Music size={18} className="text-blue-500" />
                <h2 className="text-lg font-semibold text-white tracking-wide">{activeSong.title}</h2>
             </div>
             <div className="flex items-center gap-2">
                 <button 
                   onClick={() => setIsTemplateGalleryOpen(true)}
                   className="text-xs bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/40 px-3.5 py-2 rounded-lg transition-all text-blue-400 hover:text-white font-bold flex items-center gap-1.5 shadow-sm"
                 >
                    <Sparkles size={14} className="text-blue-400" />
                    Templates & Motion
                 </button>
                 <button 
                   onClick={() => { setIsEditingSong(true); setEditingSlideIndex(0); }} 
                   className="text-xs bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg transition-colors text-neutral-300 font-medium"
                 >
                   Edit Song
                 </button>
              </div>
           </div>
           
           {/* Slide Grid */}
           <div className="flex-1 overflow-y-auto p-3 bg-[#09090B] custom-scrollbar z-0">
              <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 content-start">
                 {activeSong.slides.map((slide, i) => {
                    const isLive = liveState.slide?.id === slide.id;
                    const isPreview = previewSlide?.id === slide.id;
                    
                    const currentSlideId = previewSlide?.id || liveState.slide?.id;
                    const currentIndex = activeSong.slides.findIndex(s => s.id === currentSlideId);
                    const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                    return (
                       <div 
                         key={slide.id} draggable
                         onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }} onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                         onContextMenu={(e) => handleContextMenu(e, 'slide', i)} onClick={() => { if (!slide.disabled) { setPreviewSlide(slide); goLive(slide); } }}
                         className={`group aspect-[16/9] rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden
                           ${slide.disabled ? 'opacity-30 cursor-not-allowed' : ''} ${isLive ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : isPreview ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)]' : isNextLogical ? 'border-dashed border-white/30 bg-[#0a0a0a]' : 'bg-[#030303] border-white/5 hover:border-white/20 shadow-lg'} ${dragOverSlideIndex === i ? 'border-dashed border-blue-400 opacity-70' : ''}
                         `}
                       >
                         <FixedStage className="w-full h-full pointer-events-none">
                            <SmartTextLayout text={slide.text} source={slide.source} type={slide.type} styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'))} />
                         </FixedStage>
                         
                         {/* Slide Number Badge */}
                         <div className="absolute top-3 left-3 text-[10px] font-bold text-neutral-500 bg-[#09090B]/80 px-2 py-1 rounded shadow-sm border border-white/10 backdrop-blur-md z-10">{i + 1}</div>
                       </div>
                    );
                 })}
              </div>
           </div>
        </div>
      );
    }
  };

  const renderMonitorBridge = () => {
     const mainConfig = liveState.settings?.outputs.find(o => o.id === 'main');
     const otherOutputs = liveState.settings?.outputs.filter(o => o.enabled && o.id !== 'main') || [];
     
     let previewBg = mainConfig?.defaultBackground;
     if (liveState.globalBackground) {
        previewBg = liveState.globalBackground;
     }

     return (
       <div className="bg-[#030303] flex p-2 gap-3 shrink-0 z-20 h-32 lg:h-40 w-full justify-center shadow-md relative border-b border-white/5">
          <div className="flex gap-3 w-full max-w-[2000px]">
              {/* PREVIEW CONTAINER */}
              <div className="flex-1 flex flex-col min-w-0">
                 <div className="flex justify-between items-center px-1 mb-2 shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#4ade80]">Preview (Next)</span>
                 </div>
                 
                 <div className="flex-1 w-full min-h-0 bg-black rounded-xl border border-white/10 overflow-hidden relative shadow-inner flex items-center justify-center">
                     <FixedStage className="w-full h-full pointer-events-none">
                         {previewBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: previewBg.color || '#000' }}></div>}
                         {previewBg?.url && previewBg.type === 'video' ? (
                            <video className="bg-video-player absolute inset-0 w-full h-full object-cover opacity-80" src={previewBg.url} autoPlay loop muted playsInline />
                         ) : previewBg?.url ? (
                            <img src={previewBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                         ) : null}
                         
                         {previewSlide && (
                            <div className="absolute inset-0 z-10 flex">
                               <SmartTextLayout text={previewSlide.text} source={previewSlide.source} type={previewSlide.type} animation={previewSlide.animation} styleOverrides={applyGlobalStyles(previewSlide, mainConfig)} />
                            </div>
                         )}

                         {!previewBg && !previewSlide && (
                            <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/10 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                         )}
                     </FixedStage>
                 </div>
              </div>

              {/* PROGRAM CONTAINER */}
              <div className="flex-1 flex flex-col min-w-0">
                 <div className="flex justify-between items-center px-1 mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                       <span className="text-[11px] font-bold uppercase tracking-widest text-red-500">Program (Live)</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleLockOutput('main')} 
                          className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${liveState.lockedOutputs?.['main'] ? 'text-red-500' : 'text-neutral-500 hover:text-white'}`}
                          title="Lock Screen"
                        >
                          Lock
                        </button>
                        <button onClick={() => toggleClearOutput('main')} className={`p-1 rounded transition-colors text-[10px] flex items-center gap-1 ${liveState.clearedOutputs?.['main'] ? 'bg-red-500/20 text-red-400 font-bold' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`} title="Clear Text from Main"><EyeOff size={10} /> {liveState.clearedOutputs?.['main'] ? 'Cleared' : 'Clear'}</button>
                        <button onClick={() => openProjector('main')} className="text-neutral-500 hover:text-white p-1 rounded hover:bg-white/5 transition-colors" title="Launch Output Screen"><LaunchIcon size={12} /></button>
                    </div>
                 </div>
                 
                 <div className={`flex-1 w-full min-h-0 bg-black rounded-xl border-2 overflow-hidden relative shadow-inner flex items-center justify-center transition-all duration-300 ${liveState.isPresenting && !liveState.lockedOutputs?.['main'] ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-white/5 opacity-80'}`}>
                    <FixedStage className="w-full h-full pointer-events-none bg-black">
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
                                  
                                  {displayBg?.type === 'ndi' && (
                                    <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                      <div className="text-center z-10 select-none">
                                        <Radio size={20} className="text-red-400 mx-auto animate-pulse mb-1" />
                                        <span className="text-[10px] font-mono text-white/80 block uppercase tracking-wider">{displayBg.fileName || 'NDI Input'}</span>
                                        <span className="text-[9px] font-mono text-emerald-400">1080p60 • LIVE NDI</span>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {!isCleared && !displayClearText && displaySlide && (
                                    <SmartTextLayout 
                                      text={displaySlide.text} 
                                      source={displaySlide.source} 
                                      type={displaySlide.type} 
                                      animation={resolveSlideForOutput(displaySlide, mainConfig).animation} 
                                      styleOverrides={resolveSlideForOutput(displaySlide, mainConfig).styleOverrides} 
                                      className="relative z-10 w-full h-full" 
                                    />
                                  )}
                                  
                                  {isCleared && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/40 backdrop-blur-sm z-20"><span className="text-neutral-500 font-bold tracking-widest uppercase text-base flex items-center gap-2"><EyeOff size={32}/></span></div>
                                  )}
                                  {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={48} className="text-red-500 bg-black/60 p-2.5 rounded-full shadow-[0_0_25px_rgba(239,68,68,0.8)]" /></div>
                                  )}
                                  {liveState.isPresenting && !isCleared && !isLocked && (
                                     <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] tracking-widest font-bold px-2 py-0.5 rounded shadow-[0_0_15px_rgba(239,68,68,1)] z-40 animate-pulse">LIVE</div>
                                  )}

                                  {!displayBg && (!displaySlide || displayClearText || isCleared) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-transparent"><span className="text-white/5 font-bold tracking-widest uppercase text-2xl">Black</span></div>
                                  )}
                              </>
                            )
                        })()}
                    </FixedStage>
                 </div>
              </div>

              {/* SIDE SCREENS (Stacked) */}
              <div className="w-48 xl:w-56 2xl:w-64 flex flex-col gap-2 shrink-0 h-full overflow-y-auto custom-scrollbar pr-1">
                 {otherOutputs.map(out => {
                    const isOutLocked = !!liveState.lockedOutputs?.[out.id];
                    const isOutCleared = !!liveState.clearedOutputs?.[out.id];

                    return (
                        <div key={out.id} className="flex flex-col shrink-0 min-h-0 flex-1">
                           <div className="flex justify-between items-center mb-1.5 px-1">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#a1a1aa]">{out.name}</span>
                              <div className="flex items-center gap-1">
                                 <button onClick={() => toggleLockOutput(out.id)} className={`text-[10px] uppercase font-bold tracking-widest px-1 ${isOutLocked ? 'text-red-500' : 'text-neutral-600 hover:text-white transition-colors'}`}>Lock</button>
                                 <button onClick={() => toggleClearOutput(out.id)} className={`p-0.5 rounded transition-colors text-neutral-600 hover:text-white hover:bg-white/10 ${isOutCleared ? 'text-red-500' : ''}`}><EyeOff size={10} /></button>
                                 <button onClick={() => openProjector(out.id)} className="text-neutral-600 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors"><LaunchIcon size={10} /></button>
                              </div>
                           </div>
                           <div className={`flex-1 aspect-video bg-black rounded-xl border overflow-hidden relative shadow-inner ${liveState.isPresenting && !isOutLocked && !isOutCleared ? 'border-white/10' : 'border-transparent opacity-50 grayscale-[50%]'}`}>
                               <FixedStage className="w-full h-full pointer-events-none bg-black">
                                  {(() => {
                                     const frozenState = liveState.frozenStates?.[out.id];
                                     const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
                                     const displayBg = isOutLocked ? frozenState?.bg : out.defaultBackground;
                                     const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
                                     const hideBg = isOutCleared;

                                     const isTransparentNdi = out.outputType === 'ndi' && out.ndiTransparent !== false;

                                     return (
                                       <>
                                          {isTransparentNdi && !displayBg && !hideBg && (
                                             <div 
                                               className="absolute inset-0 w-full h-full"
                                               style={{
                                                 backgroundImage: 'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                                                 backgroundSize: '12px 12px',
                                                 backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                                                 backgroundColor: '#09090b'
                                               }}
                                             />
                                          )}
                                          {!hideBg && displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }}></div>}
                                          {!hideBg && displayBg?.url && displayBg.type === 'video' ? (
                                             <video className="bg-video-player absolute inset-0 w-full h-full object-cover opacity-80" src={displayBg.url} autoPlay loop muted playsInline />
                                          ) : !hideBg && displayBg?.url ? (
                                             <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
                                          ) : null}

                                          {!hideBg && displayBg?.type === 'ndi' && (
                                             <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
                                               <div className="text-center z-10 select-none">
                                                 <Radio size={16} className="text-red-400 mx-auto animate-pulse mb-1" />
                                                 <span className="text-[9px] font-mono text-white/80 block uppercase tracking-wider">{displayBg.fileName || 'NDI Input'}</span>
                                               </div>
                                             </div>
                                          )}
                                          
                                          {!isOutCleared && !displayClearText && displaySlide && (
                                             <SmartTextLayout 
                                               text={displaySlide.text} 
                                               source={displaySlide.source} 
                                               type={displaySlide.type} 
                                               animation={resolveSlideForOutput(displaySlide, out).animation} 
                                               styleOverrides={resolveSlideForOutput(displaySlide, out).styleOverrides} 
                                               className="relative z-10 w-full h-full" 
                                             />
                                          )}

                                          {out.outputType === 'ndi' && (
                                             <div className="absolute bottom-1 left-1 bg-blue-600/70 backdrop-blur-sm text-white text-[8px] font-mono font-bold px-1 rounded z-30">
                                               {out.ndiTransparent !== false ? 'NDI RGBA' : 'NDI OUT'}
                                             </div>
                                          )}

                                          {isOutCleared && (
                                             <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm z-20"><span className="text-neutral-500 flex items-center gap-1"><EyeOff size={24}/></span></div>
                                          )}
                                          {isOutLocked && (
                                             <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 backdrop-blur-[2px] z-30"><Lock size={32} className="text-red-500 bg-black/60 p-2 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]" /></div>
                                          )}
                                          {liveState.isPresenting && !isOutCleared && !isOutLocked && (
                                              <div className="absolute top-2 right-2 bg-red-600 text-white text-[8px] tracking-widest font-bold px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(239,68,68,1)] z-40 animate-pulse">LIVE</div>
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
       </div>
     );
  };

  // --- FREESHOW-STYLE OUTPUT PREVIEW THUMBNAILS ---
  const renderOutputMonitorCard = (out: OutputSettings) => {
    const isOutLocked = !!liveState.lockedOutputs?.[out.id];
    const isOutCleared = !!liveState.clearedOutputs?.[out.id];
    const frozenState = liveState.frozenStates?.[out.id];
    const displaySlide = isOutLocked ? frozenState?.slide : liveState.slide;
    const displayBg = isOutLocked ? frozenState?.bg : (liveState.globalBackground || out.defaultBackground);
    const displayClearText = isOutLocked ? frozenState?.clearText : liveState.clearText;
    const isLive = liveState.isPresenting && !isOutCleared && !isOutLocked;

    return (
      <div key={out.id} className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-1 mb-1">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'}`} />
            <span className="text-[11px] font-bold text-neutral-300 truncate">{out.name}</span>
          </div>
          {out.outputType === 'ndi' && (
            <span className="text-[9px] font-bold px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded">NDI</span>
          )}
        </div>
        <div 
          onClick={() => openProjector(out.id)}
          className={`aspect-video w-full rounded-lg border-2 overflow-hidden relative bg-black cursor-pointer shadow-md transition-all ${
            isLive ? 'border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.35)]' : 'border-white/10 hover:border-pink-500/50'
          }`}
          title={`Click to launch ${out.name} projector window`}
        >
          {/* NDI Transparent Checkerboard */}
          {out.outputType === 'ndi' && out.ndiTransparent && (
            <div className="absolute inset-0 bg-[radial-gradient(#33334d_1px,transparent_1px)] [background-size:8px_8px] bg-[#0c0c14] pointer-events-none" />
          )}

          <FixedStage className="w-full h-full pointer-events-none bg-transparent">
            {displayBg?.type === 'color' && <div className="absolute inset-0 w-full h-full" style={{ backgroundColor: displayBg.color || '#000' }} />}
            {displayBg?.url && displayBg.type === 'video' ? (
              <video src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" autoPlay loop muted playsInline />
            ) : displayBg?.url ? (
              <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="bg" />
            ) : null}

            {!isOutCleared && !displayClearText && displaySlide && (
              <SmartTextLayout 
                text={displaySlide.text} 
                source={displaySlide.source} 
                type={displaySlide.type} 
                animation={resolveSlideForOutput(displaySlide, out).animation} 
                styleOverrides={resolveSlideForOutput(displaySlide, out).styleOverrides} 
                className="relative z-10 w-full h-full" 
              />
            )}

            {isOutCleared && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60"><EyeOff size={16} className="text-neutral-500" /></div>
            )}
            {isOutLocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-950/40"><Lock size={16} className="text-red-500" /></div>
            )}
            {isLive && (
              <div className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[8px] tracking-widest font-bold px-1 py-0.5 rounded shadow z-30">LIVE</div>
            )}
          </FixedStage>
        </div>
      </div>
    );
  };

  // --- PROJECTS SIDEBAR (TOP-LEFT) ---
  const renderProjectsSidebar = () => {
    return (
      <div className="w-52 lg:w-56 bg-[#101015] border-r border-[#262635] flex flex-col shrink-0 select-none overflow-hidden">
        {/* Header */}
        <div className="h-10 px-3 border-b border-[#262635] flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-white tracking-wide">Projects</span>
          <button className="text-neutral-400 hover:text-white p-1 rounded transition-colors"><MoreHorizontal size={14} /></button>
        </div>

        {/* Tree Section */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          <div className="text-[10px] uppercase font-bold text-neutral-500 px-2 pt-1 pb-0.5">Unlabeled</div>
          
          {/* Active Project Folder */}
          <div 
            onClick={() => setActiveTab('setlist')}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
              activeTab === 'setlist' 
                ? 'bg-pink-500/15 border-l-2 border-pink-500 text-pink-300 font-semibold shadow-sm' 
                : 'hover:bg-white/5 text-neutral-400 border-l-2 border-transparent'
            }`}
          >
            <Folder size={14} className={activeTab === 'setlist' ? 'text-pink-400' : 'text-neutral-500'} />
            <span className="text-xs truncate">{selectedProjectFolder}</span>
          </div>

          {/* Items in Project / Setlist */}
          <div className="pl-4 space-y-0.5 pt-1">
            {serviceSetlist.items.map((item) => {
              if (item.type === 'header') {
                return (
                  <div key={item.id} className="pt-2 pb-0.5 px-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.headerColor || '#ec4899' }} />
                    <span className="truncate">{item.title}</span>
                  </div>
                );
              }
              const isItemActive = activeSetlistItemId === item.id && activeTab === 'setlist';
              return (
                <div 
                  key={item.id}
                  onClick={() => {
                    setActiveTab('setlist');
                    setActiveSetlistItemId(item.id);
                    if (item.slides && item.slides.length > 0) {
                      setPreviewSlide(item.slides[0]);
                      goLive(item.slides[0]);
                    }
                  }}
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                    isItemActive ? 'bg-pink-500/20 text-white font-medium' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <FileText size={12} className={isItemActive ? 'text-pink-400' : 'text-neutral-500'} />
                  <span className="truncate">{item.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons Stack */}
        <div className="p-3 border-t border-[#262635] space-y-1.5 relative shrink-0">
          <button 
            onClick={() => setActiveTab('setlist')}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <FileText size={13} className="text-pink-400" />
            Project
          </button>
          <button 
            onClick={() => {
              const name = prompt('New Folder Name:');
              if (name && name.trim()) setSelectedProjectFolder(name.trim());
            }}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <Folder size={13} className="text-neutral-400" />
            Folder
          </button>
          <button 
            onClick={() => setIsTemplateGalleryOpen(true)}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <LayoutTemplate size={13} className="text-neutral-400" />
            Project template
          </button>
          <button 
            onClick={() => {
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = '.json,.xml,.txt';
              fileInput.onchange = (e: any) => {
                const file = e.target?.files?.[0];
                if (file) alert(`Selected file: ${file.name}`);
              };
              fileInput.click();
            }}
            className="w-full py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-2 border border-white/5 transition-colors font-medium"
          >
            <Upload size={13} className="text-neutral-400" />
            Import
          </button>

          {/* Round Pink Plus Button */}
          <button 
            onClick={() => setIsAddSongModalOpen(true)}
            className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-pink-600 hover:bg-pink-500 text-white flex items-center justify-center shadow-lg shadow-pink-600/30 transition-all hover:scale-105"
            title="Create New Item"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    );
  };

  // --- CENTER SLIDE GRID / WORKSPACE (TOP-CENTER) ---
  const renderCenterSlideArea = () => {
    // Stage monitor mode
    if (appMode === 'stage') {
      const activeSlide = previewSlide || liveState.slide;
      return (
        <div className="flex-1 flex flex-col bg-black text-white p-6 justify-between select-none">
          <div className="flex justify-between items-center border-b border-white/10 pb-3">
            <span className="text-xs uppercase font-bold tracking-widest text-pink-400">STAGE CONFIDENCE DISPLAY</span>
            <span className="text-sm font-mono text-neutral-400">{new Date().toLocaleTimeString()}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <h1 className="text-4xl lg:text-5xl font-black leading-tight max-w-4xl tracking-wide text-white">
              {activeSlide ? activeSlide.text : 'FLOWSHOW STAGE READY'}
            </h1>
          </div>
          <div className="border-t border-white/10 pt-3 flex justify-between items-center text-xs text-neutral-400 font-mono">
            <span>Next: {songsList[activeItemIndex]?.slides?.[1]?.text?.slice(0, 40) || 'End of Item'}...</span>
            <button onClick={() => setAppMode('show')} className="text-pink-400 hover:underline">Exit Stage View</button>
          </div>
        </div>
      );
    }

    // Edit song mode
    if (appMode === 'edit' || (isEditingSong && songsList[activeItemIndex])) {
      return (
        <EditSongPage 
          song={songsList[activeItemIndex]} 
          initialSlideIndex={editingSlideIndex || 0} 
          onClose={() => {
            setIsEditingSong(false);
            setAppMode('show');
          }}
          onSave={(songId, updatedSlides) => {
            setSongsList(prev => { 
              const next = [...prev]; 
              const idx = next.findIndex(s => s.id === songId); 
              if (idx !== -1) next[idx] = { ...next[idx], slides: updatedSlides }; 
              return next; 
            });
            setLiveState(prev => { 
              if (prev.slide) { 
                const match = updatedSlides.find(s => s.id === prev.slide!.id); 
                if (match) return { ...prev, slide: match }; 
              } 
              return prev; 
            });
            setIsEditingSong(false);
            setAppMode('show');
          }}
        />
      );
    }

    // Determine slides to display
    let activeTitle = songsList[activeItemIndex]?.title || 'Welcome';
    let currentSlides: SlideDefinition[] = songsList[activeItemIndex]?.slides || [];

    if (activeTab === 'setlist') {
      const activeItem = serviceSetlist.items.find(i => i.id === activeSetlistItemId);
      if (activeItem && activeItem.slides) {
        activeTitle = activeItem.title;
        currentSlides = activeItem.slides;
      }
    }

    return (
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d12] relative overflow-hidden select-none">
        {/* Slide Area Header */}
        <div className="h-10 px-4 border-b border-[#262635] flex items-center justify-between shrink-0 bg-[#101015]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white tracking-wide">{activeTitle}</h2>
            <button className="text-neutral-500 hover:text-white p-1 rounded transition-colors"><MoreHorizontal size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setAppMode('edit');
                setIsEditingSong(true);
                setEditingSlideIndex(0);
              }}
              className="text-xs text-neutral-300 hover:text-white px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/5 transition-colors font-medium flex items-center gap-1"
            >
              <Edit2 size={12} />
              Edit
            </button>
          </div>
        </div>

        {/* Slide Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {currentSlides.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-sm gap-2">
              <FileText size={32} className="opacity-30" />
              <span>No slides available in {activeTitle}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 content-start">
              {currentSlides.map((slide, i) => {
                const isLive = liveState.slide?.id === slide.id;
                const isPreview = previewSlide?.id === slide.id;
                const currentSlideId = previewSlide?.id || liveState.slide?.id;
                const currentIndex = currentSlides.findIndex(s => s.id === currentSlideId);
                const isNextLogical = currentIndex !== -1 && i === currentIndex + 1;

                return (
                  <div
                    key={slide.id}
                    draggable
                    onDragStart={(e) => { setDraggedSlideIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverSlideIndex(i); }}
                    onDrop={(e) => { e.preventDefault(); handleDropSlide(i); }}
                    onContextMenu={(e) => handleContextMenu(e, 'slide', i)}
                    onClick={() => {
                      if (!slide.disabled) {
                        setPreviewSlide(slide);
                        goLive(slide);
                      }
                    }}
                    className={`group aspect-video rounded-xl cursor-pointer flex flex-col justify-center items-center text-center transition-all border-2 relative select-none overflow-hidden bg-black shadow-lg ${
                      slide.disabled ? 'opacity-30 cursor-not-allowed' : ''
                    } ${
                      isLive 
                        ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.35)] ring-1 ring-pink-500' 
                        : isPreview 
                        ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.25)]' 
                        : isNextLogical 
                        ? 'border-dashed border-white/30 bg-[#0a0a0f]' 
                        : 'border-white/5 hover:border-pink-500/40'
                    }`}
                  >
                    <FixedStage className="w-full h-full pointer-events-none">
                      <SmartTextLayout 
                        text={slide.text} 
                        source={slide.source} 
                        type={slide.type} 
                        styleOverrides={applyGlobalStyles(slide, liveState.settings?.outputs.find(o => o.id === 'main'))} 
                      />
                    </FixedStage>

                    {/* Slide Number Badge */}
                    <div className="absolute top-2 left-2 text-[10px] font-bold text-neutral-400 bg-black/80 px-1.5 py-0.5 rounded border border-white/10 backdrop-blur-sm z-10">
                      {i + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Arrangement Bar */}
        <div className="h-10 px-4 border-t border-[#262635] flex items-center justify-between shrink-0 bg-[#101015]">
          <button 
            onClick={() => {
              const name = prompt('Arrangement Name:', 'Default Arrangement');
              if (name) alert(`Created arrangement: ${name}`);
            }}
            className="text-xs text-neutral-400 hover:text-white px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center gap-1.5 font-medium"
          >
            <Plus size={12} className="text-pink-400" />
            New arrangement
          </button>
          <div className="flex items-center gap-2 text-neutral-400">
            <button onClick={handlePrevSlide} className="p-1 hover:text-white hover:bg-white/5 rounded transition-colors" title="Previous Slide"><ChevronLeft size={16} /></button>
            <button onClick={handleNextSlide} className="p-1 hover:text-white hover:bg-white/5 rounded transition-colors" title="Next Slide"><ChevronRight size={16} /></button>
            <div className="w-px h-3.5 bg-white/10 mx-1" />
            <button className="p-1 hover:text-white transition-colors" title="Slide Timer"><Clock size={14} /></button>
            <button onClick={() => setSlideViewMode(prev => prev === 'grid' ? 'list' : 'grid')} className="p-1 hover:text-white transition-colors" title="Toggle Grid/List"><Grid size={14} /></button>
          </div>
        </div>
      </div>
    );
  };

  // --- OUTPUT PREVIEWS & CONTROLS (TOP-RIGHT) ---
  const renderRightOutputsPanel = () => {
    const enabledOutputs = globalSettings.outputs.filter(o => o.enabled);
    const activeSong = songsList[activeItemIndex];
    const totalSlides = activeSong?.slides?.length || 1;
    const currentSlideId = previewSlide?.id || liveState.slide?.id;
    const currentIdx = activeSong?.slides?.findIndex(s => s.id === currentSlideId);
    const currentSlideNum = currentIdx !== undefined && currentIdx >= 0 ? currentIdx + 1 : 1;

    return (
      <div className="w-64 lg:w-72 bg-[#101015] border-l border-[#262635] flex flex-col shrink-0 select-none overflow-hidden">
        {/* Top: Output Preview Monitors (Side by Side or Stacked) */}
        <div className="p-2.5 border-b border-[#262635] flex gap-2 overflow-x-auto shrink-0 bg-[#0d0d12]">
          {enabledOutputs.length === 0 ? (
            <div className="w-full text-center py-4 text-xs text-neutral-500">No enabled outputs</div>
          ) : (
            enabledOutputs.map(out => renderOutputMonitorCard(out))
          )}
        </div>

        {/* Transport Row (< > ⟳ 🔒 👁) */}
        <div className="px-3 py-2 border-b border-[#262635] flex items-center justify-around text-neutral-400 shrink-0 bg-[#121218]">
          <button onClick={handlePrevSlide} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Previous Slide (ArrowLeft)"><ChevronLeft size={16} /></button>
          <button onClick={handleNextSlide} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Next Slide (ArrowRight)"><ChevronRight size={16} /></button>
          <button onClick={() => { if (previewSlide) goLive(previewSlide); }} className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors" title="Replay Current Slide"><RotateCcw size={14} /></button>
          <button onClick={() => toggleLockOutput('main')} className={`p-1 rounded transition-colors ${liveState.lockedOutputs?.['main'] ? 'text-red-500 bg-red-500/10' : 'hover:text-white hover:bg-white/10'}`} title="Freeze Output"><Lock size={14} /></button>
          <button onClick={togglePresenting} className={`p-1 rounded transition-colors ${liveState.isPresenting ? 'text-pink-500 bg-pink-500/10' : 'hover:text-white hover:bg-white/10'}`} title="Master Live Toggle"><Eye size={15} /></button>
        </div>

        {/* Full-width Clear All Button */}
        <div className="px-3 py-2 border-b border-[#262635] shrink-0">
          <button 
            onClick={clearAll}
            className="w-full py-1.5 bg-[#25121b] hover:bg-[#341724] text-pink-500 hover:text-pink-400 border border-pink-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
          >
            <X size={14} />
            Clear all
          </button>
        </div>

        {/* Layer Clear Icons Row */}
        <div className="px-4 py-2 border-b border-[#262635] flex items-center justify-between text-neutral-400 shrink-0 bg-[#0d0d12]">
          <button onClick={() => setGlobalBackground(null)} title="Clear Background" className={`p-1.5 rounded transition-colors ${!liveState.globalBackground ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><ImageIcon size={15} /></button>
          <button onClick={toggleClearText} title="Clear Slide Text" className={`p-1.5 rounded transition-colors ${liveState.clearText ? 'text-pink-500 bg-pink-500/20 font-bold' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><FileText size={15} /></button>
          <button title="Clear Overlays" className="p-1.5 rounded text-neutral-400 hover:text-pink-400 hover:bg-white/5 transition-colors"><Layers size={15} /></button>
          <button onClick={toggleMute} title="Mute Audio" className={`p-1.5 rounded transition-colors ${isVideoMuted ? 'text-neutral-600' : 'text-neutral-300 hover:text-pink-400 hover:bg-white/5'}`}><Music size={15} /></button>
          <button title="Timer" className="p-1.5 rounded text-neutral-400 hover:text-pink-400 hover:bg-white/5 transition-colors"><Clock size={15} /></button>
        </div>

        {/* Current Item Status Indicator */}
        <div className="px-3 py-1.5 border-b border-[#262635] flex items-center justify-between text-xs text-neutral-400 shrink-0 bg-[#121218]">
          <span className="font-semibold text-white truncate max-w-[140px]">{activeSong?.title || 'Welcome'}</span>
          <span className="font-mono text-neutral-500 text-[11px]">{currentSlideNum}/{totalSlides}</span>
        </div>

        {/* Inspector Tabs (Groups | Metadata) */}
        <div className="h-9 px-3 border-b border-[#262635] flex items-center gap-4 shrink-0 bg-[#101015]">
          <button 
            onClick={() => setRightInspectorTab('groups')}
            className={`h-full text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
              rightInspectorTab === 'groups' ? 'text-pink-400 border-pink-500' : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <List size={13} />
            Groups
          </button>
          <button 
            onClick={() => setRightInspectorTab('metadata')}
            className={`h-full text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
              rightInspectorTab === 'metadata' ? 'text-pink-400 border-pink-500' : 'text-neutral-400 border-transparent hover:text-white'
            }`}
          >
            <Info size={13} />
            Metadata
          </button>
        </div>

        {/* Inspector Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
          {rightInspectorTab === 'groups' ? (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-neutral-500 px-1">Arrangement Groups</div>
              {activeSong?.slides.map((s, idx) => (
                <div 
                  key={s.id}
                  onClick={() => {
                    setPreviewSlide(s);
                    goLive(s);
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-xs transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
                    <span className="text-neutral-300 truncate">Slide {idx + 1}</span>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500">{s.text.slice(0, 15)}...</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="text-[10px] uppercase font-bold text-neutral-500">Show Properties</div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Title</span>
                <span className="text-white font-medium">{activeSong?.title || 'Welcome'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Category</span>
                <span className="text-neutral-300">{activeSong?.category || 'Presentations'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Total Slides</span>
                <span className="text-neutral-300">{activeSong?.slides.length || 1}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">Default Template</span>
                <span className="text-neutral-300">Cinematic Ambient</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- BOTTOM HORIZONTAL LIBRARY & BROWSER ---
  const renderBottomBrowser = () => {
    const filteredSongs = songsList.filter(song => {
      if (selectedCategory === 'Presentations' && song.category !== 'Presentations') return false;
      if (selectedCategory === 'Songs' && song.category !== 'Songs') return false;
      if (!songSearchQuery.trim()) return true;
      const q = songSearchQuery.toLowerCase();
      return song.title.toLowerCase().includes(q) || song.slides.some(s => s.text.toLowerCase().includes(q));
    });

    const activeSong = songsList[activeItemIndex] || songsList[0];
    const presCount = songsList.filter(s => s.category === 'Presentations').length;
    const songsCount = songsList.filter(s => s.category === 'Songs').length;

    return (
      <div className="h-full bg-[#0c0c11] flex flex-col overflow-hidden select-none">
        {/* Horizontal Tab Strip across Top of Bottom Panel */}
        <div className="h-9 bg-[#101015] border-b border-[#262635] flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center space-x-1 lg:space-x-3 overflow-x-auto">
            {[
              { id: 'shows', label: 'Shows', icon: FileText },
              { id: 'media', label: 'Media', icon: ImageIcon },
              { id: 'templates', label: 'Templates', icon: Sparkles },
              { id: 'scripture', label: 'Scripture', icon: BookOpen },
              // hidden until needed: audio, overlays, calendar, functions
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = bottomTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setBottomTab(tab.id as any);
                    if (tab.id === 'media') setActiveTab('media');
                    else if (tab.id === 'audio') setActiveTab('audio');
                    else if (tab.id === 'scripture') setActiveTab('bibles');
                    else if (tab.id === 'shows') setActiveTab('songs');
                  }}
                  className={`h-full flex items-center gap-1.5 px-2.5 text-xs font-semibold transition-all border-b-2 ${
                    isActive 
                      ? 'text-pink-400 border-pink-500 font-bold' 
                      : 'text-neutral-400 border-transparent hover:text-white'
                  }`}
                >
                  <Icon size={13} className={isActive ? 'text-pink-400' : 'text-neutral-500'} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Box on Far Right */}
          <div className="relative w-44 lg:w-56 shrink-0">
            <Search size={13} className="absolute left-2.5 top-2 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Search" 
              value={songSearchQuery}
              onChange={(e) => setSongSearchQuery(e.target.value)}
              className="w-full bg-[#181822] border border-[#262635] rounded-md text-xs pl-8 pr-2 py-1 text-white placeholder:text-neutral-500 outline-none focus:border-pink-500 transition-colors"
            />
          </div>
        </div>

        {/* Content Body */}
        {bottomTab === 'shows' ? (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Sub-column 1: Categories */}
            <div className="w-48 bg-[#101015] border-r border-[#262635] p-3 flex flex-col shrink-0">
              <button 
                onClick={() => setSelectedCategory('all')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold mb-2 transition-colors ${
                  selectedCategory === 'all' ? 'bg-pink-500/15 text-pink-300' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>All</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{songsList.length}</span>
              </button>

              <div className="text-[10px] uppercase font-bold text-neutral-500 px-1 mb-1">Categories</div>
              
              <button 
                onClick={() => setSelectedCategory('Presentations')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === 'Presentations' ? 'bg-pink-500/15 text-pink-300 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={13} />
                  <span>Presentations</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{presCount}</span>
              </button>

              <button 
                onClick={() => setSelectedCategory('Songs')}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === 'Songs' ? 'bg-pink-500/15 text-pink-300 font-semibold' : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Music size={13} />
                  <span>Songs</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-500">{songsCount}</span>
              </button>

              <button 
                onClick={() => {
                  const cat = prompt('New Category Name:');
                  if (cat) alert(`Category created: ${cat}`);
                }}
                className="mt-3 text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1 px-1 font-semibold transition-colors"
              >
                <Plus size={13} />
                New category
              </button>
            </div>

            {/* Sub-column 2: Items Table */}
            <div className="flex-1 bg-[#0d0d12] border-r border-[#262635] flex flex-col min-w-0 overflow-hidden">
              {/* Table Header */}
              <div className="h-8 px-4 border-b border-[#262635] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-500 shrink-0 bg-[#09090d]">
                <span>Name</span>
                <span>Modified</span>
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {filteredSongs.map((song) => {
                  const origIdx = songsList.findIndex(s => s.id === song.id);
                  const isSelected = activeItemIndex === origIdx;

                  return (
                    <div
                      key={song.id}
                      onContextMenu={(e) => handleContextMenu(e, 'song', song.id)}
                      onClick={() => {
                        setActiveItemIndex(origIdx);
                        setActiveTab('songs');
                        if (song.slides.length > 0) {
                          setPreviewSlide(song.slides[0]);
                        }
                      }}
                      onDoubleClick={() => {
                        setActiveItemIndex(origIdx);
                        setActiveTab('songs');
                        if (song.slides.length > 0) {
                          setPreviewSlide(song.slides[0]);
                          goLive(song.slides[0]);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between transition-all ${
                        isSelected 
                          ? 'border border-pink-500 bg-pink-500/10 text-white shadow-sm' 
                          : 'hover:bg-white/5 border border-transparent text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={14} className={isSelected ? 'text-pink-400' : 'text-neutral-500'} />
                        <span className="text-xs font-medium truncate">{song.title}</span>
                      </div>
                      <span className="text-[11px] text-neutral-500 shrink-0 font-mono">
                        {song.modifiedAt || 'Wednesday 18. November, 2026'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions Bar */}
              <div className="h-10 px-4 border-t border-[#262635] flex items-center justify-between shrink-0 bg-[#101015]">
                <button 
                  onClick={() => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.json,.xml,.txt';
                    fileInput.onchange = (e: any) => {
                      const file = e.target?.files?.[0];
                      if (file) alert(`Importing: ${file.name}`);
                    };
                    fileInput.click();
                  }}
                  className="py-1.5 px-3 bg-[#181822] hover:bg-[#222230] text-neutral-300 text-xs rounded-full flex items-center gap-1.5 border border-white/5 transition-colors font-medium"
                >
                  <Upload size={13} className="text-neutral-400" />
                  Import
                </button>

                <button 
                  onClick={() => setIsAddSongModalOpen(true)}
                  className="py-1.5 px-4 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg shadow-pink-600/30 transition-all hover:scale-105"
                >
                  <Plus size={14} />
                  New show
                </button>
              </div>
            </div>

            {/* Sub-column 3: Item Inspector */}
            <div className="w-64 bg-[#101015] p-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar select-none">
              <h3 className="text-base font-bold text-white mb-3 truncate">{activeSong?.title || 'Welcome'}</h3>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Created</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.createdAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Modified</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.modifiedAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Used</span>
                  <span className="text-neutral-300 font-mono text-[11px]">{activeSong?.usedAt || 'Wednesday 18. November, 2026'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Category</span>
                  <span className="text-neutral-300 italic">{activeSong?.category || 'Presentations'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Slides</span>
                  <span className="text-neutral-300 font-mono">{activeSong?.slides?.length || 1}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Words</span>
                  <span className="text-neutral-300 font-mono">
                    {activeSong?.slides?.reduce((acc, s) => acc + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0) || 1}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-neutral-500">Template</span>
                  <span className="text-neutral-400">Default</span>
                </div>
              </div>

              <div className="mt-auto pt-4 flex justify-end">
                <button 
                  onClick={() => setIsTemplateGalleryOpen(true)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-white/5 transition-colors"
                  title="Configure Template & Styles"
                >
                  <Sliders size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : bottomTab === 'media' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <MediaLibrary onSelectBackground={setGlobalBackground} />
          </div>
        ) : bottomTab === 'audio' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            <AudioModule onVerseDetected={handleVerseDetected} />
          </div>
        ) : bottomTab === 'scripture' ? (
          <div className="flex-1 min-h-0 bg-[#0d0d12]">
            {renderCenterWorkspace()}
          </div>
        ) : bottomTab === 'templates' ? (
          <InlineTemplateGrid
            templates={inlineTemplates}
            category={inlineTemplateCategory}
            onCategoryChange={setInlineTemplateCategory}
            onLoadTemplates={() => getStoredTemplates().then(setInlineTemplates)}
            onEdit={(t) => { setIsTemplateGalleryOpen(true); }}
            onApplyToSong={templateGalleryHandlers.onApplyToSong}
            activeSongId={songsList[activeItemIndex]?.id}
          />
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center text-neutral-500 text-xs">
            {bottomTab.toUpperCase()} Module
          </div>
        )}
      </div>
    );
  };

  const templateGalleryHandlers = {
    mode: "manage" as const,
    availableSongs: songsList,
    availableOutputs: globalSettings.outputs.filter(o => o.enabled),
    onApplyToSong: (template, songId, outputId) => {
      const targetSongId = songId || songsList[activeItemIndex]?.id;
      if (!targetSongId) return;
      setSongsList(prev => prev.map(song => {
        if (song.id !== targetSongId) return song;
        if (outputId) {
          return {
            ...song,
            outputTemplates: { ...(song.outputTemplates || {}), [outputId]: template.id },
            slides: song.slides.map(s => ({
              ...s,
              outputTemplates: { ...(s.outputTemplates || {}), [outputId]: template.id }
            }))
          };
        }
        return {
          ...song,
          templateId: template.id,
          slides: song.slides.map(s => ({
            ...s,
            templateId: template.id,
            animation: template.animation,
            styleOverrides: {
              ...(s.styleOverrides || {}),
              global: { ...(s.styleOverrides?.global || {}), ...(template.styles.global || {}) },
              lines: { ...(s.styleOverrides?.lines || {}), ...(template.styles.lines || {}) },
              layout: template.styles.layout || s.styleOverrides?.layout
            }
          }))
        };
      }));
    },
    onApplyToSlide: (template, outputId) => {
      const currentSong = songsList[activeItemIndex];
      if (!currentSong) return;
      const targetSlideId = previewSlide?.id || liveState.slide?.id || currentSong.slides[0]?.id;
      const updatedSlides = currentSong.slides.map(s => {
        if (s.id === targetSlideId) {
          if (outputId) {
            return {
              ...s,
              outputTemplates: { ...(s.outputTemplates || {}), [outputId]: template.id }
            };
          }
          return {
            ...s,
            templateId: template.id,
            animation: template.animation,
            styleOverrides: {
              ...(s.styleOverrides || {}),
              global: { ...(s.styleOverrides?.global || {}), ...(template.styles.global || {}) },
              lines: { ...(s.styleOverrides?.lines || {}), ...(template.styles.lines || {}) },
              layout: template.styles.layout || s.styleOverrides?.layout
            }
          };
        }
        return s;
      });
      setSongsList(prev => prev.map((s, idx) => idx === activeItemIndex ? { ...s, slides: updatedSlides } : s));
      if (previewSlide) {
        const matched = updatedSlides.find(s => s.id === previewSlide.id);
        if (matched) setPreviewSlide(matched);
      }
      if (liveState.slide) {
        const matched = updatedSlides.find(s => s.id === liveState.slide.id);
        if (matched) setLiveState(prev => ({ ...prev, slide: matched }));
      }
    },
    onApplyToOutput: (template, outputId) => {
      const targetId = outputId || 'main';
      setGlobalSettings(prev => ({
        ...prev,
        outputs: prev.outputs.map(o => o.id === targetId ? { ...o, defaultTemplateId: template.id } : o)
      }));
    },
  } satisfies Partial<TemplateGalleryModalProps>;

  return (
    <div className="flex flex-col h-screen bg-black text-neutral-200 overflow-hidden font-sans select-none">
      <SettingsModal 
        isOpen={isSettingsModalOpen} 
        onClose={() => setIsSettingsModalOpen(false)} 
        settings={globalSettings} 
        onSave={setGlobalSettings}
        isPresenting={liveState.isPresenting}
        onTogglePresenting={togglePresenting}
        onToggleLockOutput={toggleLockOutput}
      />

      {/* TOP HEADER BAR (FreeShow Style) */}
      <header className="h-10 bg-[#09090b] border-b border-[#262635] flex items-center justify-between px-3 shrink-0 z-30 select-none">
        {/* Left: Menu & Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="hover:text-white cursor-pointer px-1">File</span>
            <span className="hover:text-white cursor-pointer px-1">Edit</span>
            <span className="hover:text-white cursor-pointer px-1">View</span>
            <span className="hover:text-white cursor-pointer px-1">Help</span>
          </div>
          <span className="font-black text-pink-500 tracking-wider text-base ml-2">FlowShow</span>
        </div>

        {/* Center: Mode Tabs (Show | Edit | Stage) */}
        <div className="flex items-center gap-1 bg-[#121218] p-0.5 rounded-lg border border-[#262635]">
          <button
            onClick={() => {
              setAppMode('show');
              setIsEditingSong(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'show' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Play size={12} className="fill-current" />
            Show
          </button>
          <button
            onClick={() => {
              setAppMode('edit');
              setIsEditingSong(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'edit' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Edit2 size={12} />
            Edit
          </button>
          <button
            onClick={() => setAppMode('stage')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
              appMode === 'stage' ? 'text-pink-400 bg-pink-500/15 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Tv size={12} />
            Stage
          </button>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2">
          {/* Remote / Squiggle icon */}
          <button 
            onClick={() => alert('FlowShow Remote is connected and listening.')}
            className="p-1 text-pink-400 hover:text-pink-300 transition-colors" 
            title="Remote Connection"
          >
            <Wifi size={16} />
          </button>

          {/* Settings Modal Button */}
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>

          {/* Master Present / Window Toggle */}
          <button
            onClick={togglePresenting}
            className={`p-1 rounded transition-colors ${
              liveState.isPresenting ? 'text-red-500 animate-pulse' : 'text-neutral-400 hover:text-white'
            }`}
            title={liveState.isPresenting ? 'Output LIVE (Presenting)' : 'Output Offline'}
          >
            <MonitorPlay size={16} />
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-1" />

          {/* Window Buttons */}
          <div className="flex items-center text-neutral-500">
            <button className="p-1 hover:text-white transition-colors"><Minus size={13} /></button>
            <button className="p-1 hover:text-white transition-colors"><Square size={11} /></button>
            <button className="p-1 hover:text-red-400 transition-colors"><X size={13} /></button>
          </div>
        </div>
      </header>

      {/* TOP SECTION: 3-COLUMN WORKSPACE (Projects | Slide Grid | Output Monitors) */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {renderProjectsSidebar()}
        {renderCenterSlideArea()}
        {renderRightOutputsPanel()}
      </div>

      {/* DRAG HANDLE DIVIDER */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="group relative h-[5px] shrink-0 bg-[#1a1a24] hover:bg-pink-500/40 transition-colors duration-150 cursor-row-resize select-none z-10"
        title={bottomPanelCollapsed ? 'Click to expand panel' : 'Drag to resize · Click to collapse'}
      >
        {/* centre grip dots */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
          <span className="w-1 h-1 rounded-full bg-pink-400" />
        </div>
      </div>

      {/* BOTTOM SECTION: HORIZONTAL LIBRARY & BROWSER */}
      <div
        style={{ height: bottomPanelCollapsed ? 0 : bottomPanelHeight }}
        className="shrink-0 overflow-hidden transition-[height] duration-200 ease-in-out"
      >
        {renderBottomBrowser()}
      </div>

      {/* CONTEXT MENUS */}
      {contextMenu && (
        <div className="fixed z-50 bg-[#18181B] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1.5 w-48 backdrop-blur-xl" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'slide' ? (
             <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { setIsEditingSong(true); setEditingSlideIndex(contextMenu.id as number); setEditingSlideText(songsList[activeItemIndex].slides[contextMenu.id as number].text); setContextMenu(null); }}><Edit2 size={14}/> Edit</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleDuplicateSlide(contextMenu.id as number); setContextMenu(null); }}><Copy size={14}/> Duplicate</button>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => { handleSplitSlide(contextMenu.id as number); setContextMenu(null); }}><Split size={14}/> Split</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => { handleDeleteSlide(contextMenu.id as number); setContextMenu(null); }}><Trash size={14}/> Delete</button>
             </>
          ) : (
            <>
               <button className="w-full text-left px-4 py-2 hover:bg-white/5 text-neutral-300 hover:text-white text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') {
                      const song = songsList.find(s => s.id === contextMenu.id);
                      if (song) { const newName = prompt("Rename Song:", song.title); if (newName && newName.trim()) setSongsList(prev => prev.map(s => s.id === contextMenu.id ? { ...s, title: newName.trim() } : s)); }
                   } else if (contextMenu.type === 'bible') {
                      const b = bibleList.find(b => b.id === contextMenu.id);
                      if (b) { const newName = prompt("Rename Bible:", b.name); if (newName && newName.trim()) { getBible(contextMenu.id as string).then(bibleData => { if (bibleData) { bibleData.name = newName.trim(); saveBible(bibleData).then(() => { getBibleList().then(list => setBibleList(list)); if (activeBibleId === contextMenu.id) setActiveBibleData(bibleData); }); }}); }}
                   }
                   setContextMenu(null);
                 }}><Edit2 size={14}/> Rename {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
               <div className="h-px w-full bg-white/5 my-1" />
               <button className="w-full text-left px-4 py-2 hover:bg-red-500/10 text-red-400 text-sm transition-colors flex items-center gap-2" onClick={() => {
                   if (contextMenu.type === 'song') deleteSong(contextMenu.id); else if (contextMenu.type === 'bible') handleDeleteBible(contextMenu.id as string);
                   setContextMenu(null);
                 }}><Trash size={14}/> Delete {contextMenu.type === 'song' ? 'Song' : 'Bible'}</button>
            </>
          )}
        </div>
      )}

      <AddSongModal isOpen={isAddSongModalOpen} onClose={() => setIsAddSongModalOpen(false)} onAddSong={(newSong) => { setSongsList(prev => [...prev, newSong]); setActiveTab('songs'); setActiveItemIndex(songsList.length); }} />

      <TemplateGalleryModal
        isOpen={isTemplateGalleryOpen}
        onClose={() => setIsTemplateGalleryOpen(false)}
        {...templateGalleryHandlers}
      />
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
          
          {!hideBg && displayBg && displayBg.type === 'ndi' && (
            <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden pointer-events-none">
              <div className="text-center z-10 select-none">
                <Radio size={32} className="text-red-500 mx-auto animate-pulse mb-2" />
                <span className="text-xs font-mono text-white/90 block uppercase tracking-wider">{displayBg.fileName || 'NDI Live Camera Feed'}</span>
                <span className="text-[10px] font-mono text-emerald-400">1080p60 • LIVE NDI IN</span>
              </div>
            </div>
          )}
          
          {!hideBg && displayBg && displayBg.url && displayBg.type === 'video' ? (
            <video ref={projectorVideoRef} src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" autoPlay loop playsInline />
          ) : !hideBg && displayBg && displayBg.url ? (
            <img src={displayBg.url} className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none" alt="bg" />
          ) : null}
          
          {!hideText && !displayClearText && displaySlide && (
            <SmartTextLayout 
              text={displaySlide.text} 
              source={displaySlide.source} 
              type={displaySlide.type} 
              animation={resolveSlideForOutput(displaySlide, outputConfig).animation} 
              styleOverrides={resolveSlideForOutput(displaySlide, outputConfig).styleOverrides} 
              className="relative z-10 w-full h-full" 
            />
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