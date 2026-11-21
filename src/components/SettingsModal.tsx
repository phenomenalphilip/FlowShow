/** The Settings window (outputs, styles, profiles, themes, help, about) */
import { LiveInputSelect } from '../lib/liveInputs';
import React, { useState, useEffect, useRef } from 'react';
import { showMessage } from '../lib/appDialogs';
import { Settings, MonitorPlay, BookOpen, Plus, X, Layers, Play, FileText, Activity, Volume2, Save, Lock, Radio, Tv, Wifi, Check, Sparkles, ChevronRight, ChevronLeft, Info, Palette, Keyboard, Rocket } from 'lucide-react';
import { APP_THEMES, DEFAULT_APP_THEME, themeSwatch } from '../lib/themes';
import { ndiService, NdiSource } from '../lib/ndi';
import { ProfilesPanel, ProfilesApi } from './ProfilesPanel';
import { ShortcutsContent, QuickStartContent, AboutContent } from './AppMenus';
import { getMonitors, isTauri } from '../lib/tauriScreen';
import { pickMediaFile, mediaUrl, isVideoPath, fileNameOf } from '../lib/nativeFiles';
import { NdiDot, NdiStatusCard } from './NdiStatus';
import { PresentationTemplate, STARTER_TEMPLATES, getStoredTemplates } from '../lib/templates';
import { TemplateGalleryModal } from './TemplateGalleryModal';
import { DEFAULT_LYRICS_STAGE_LAYOUT, DEFAULT_SCRIPTURE_STAGE_LAYOUT, stageLayoutFor } from '../lib/stageLayouts';
import { getTemplateById } from '../lib/templates';
import { OutputStyleEditor, OutputStyleConfig } from './OutputStyleEditor';
import { StylesManager } from './StylesManager';
import { OutputType, ScreenKind, PresentationStyle, OutputSettings, GlobalSettings, isStageOutput, styleKind, createOutput } from '../lib/model';

/** A name shown as text; click it to rename it in place */
export function InlineName({ value, onRename, className = '', inputClassName = '', title = 'Click to rename' }: {
  value: string; onRename: (name: string) => void; className?: string; inputClassName?: string; title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const done = (keep: boolean) => {
    setEditing(false);
    const name = text.trim();
    if (keep && name && name !== value) onRename(name);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }}
        onBlur={() => done(true)}
        onClick={(e) => e.stopPropagation()}
        className={`bg-black/40 border border-pink-500 rounded px-1.5 outline-none text-white ${inputClassName}`}
        data-inline-name-input
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      onClick={(e) => { e.stopPropagation(); setText(value); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setText(value); setEditing(true); } }}
      className={`cursor-text rounded hover:bg-white/10 px-1 -mx-1 ${className}`}
      data-inline-name
    >
      {value}
    </span>
  );
}

export function SettingsModal({ isOpen, onClose, settings, onSave, isPresenting, onTogglePresenting, onToggleLockOutput, profilesApi, profileId, openTab }: any) {
  const [activeTab, setActiveTab] = useState('outputs');
  useEffect(() => { if (isOpen && openTab) setActiveTab(openTab); }, [isOpen, openTab]);
  const [activeOutputId, setActiveOutputId] = useState(settings.outputs[0]?.id || 'main');
  const [local, setLocal] = useState<GlobalSettings>(settings);
  const [allTemplates, setAllTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  useEffect(() => { getStoredTemplates().then(setAllTemplates); }, []);
  const [editingStyleType, setEditingStyleType] = useState<'lyrics' | 'scripture' | null>(null);
  const [detectedScreens, setDetectedScreens] = useState<any[]>([]);
  const [selectingTemplateForOutput, setSelectingTemplateForOutput] = useState<OutputSettings | null>(null);
  const [ndiSources, setNdiSources] = useState<NdiSource[]>(ndiService.getDiscoveredSources());
  const [isScanningNdi, setIsScanningNdi] = useState(false);
  const [showNewOutputModal, setShowNewOutputModal] = useState(false);
  const [selectedNewOutputType, setSelectedNewOutputType] = useState<OutputType | null>(null);
  const [selectedNewOutputKind, setSelectedNewOutputKind] = useState<ScreenKind | null>(null);

  // While open, only pull in styles (saved instantly) so other unsaved edits survive.
  const wasOpenRef = useRef(false);
  const openedWith = useRef<GlobalSettings | null>(null);
  const shownProfileRef = useRef(profileId);
  useEffect(() => {
    // Another profile: everything changes
    if (shownProfileRef.current !== profileId) {
      shownProfileRef.current = profileId;
      setLocal(settings);
    } else if (isOpen && wasOpenRef.current) {
      setLocal(prev => ({ ...prev, styles: settings.styles }));
    } else {
      setLocal(settings);
      if (isOpen) openedWith.current = settings;
    }
    wasOpenRef.current = isOpen;
  }, [settings, isOpen, profileId]);

  // Styles save immediately (not gated on "Save Settings").
  const commitStyleChange = (fn: (prev: GlobalSettings) => GlobalSettings) => {
    setLocal(fn);
    onSave((prev: GlobalSettings) => fn(prev));
  };
  useEffect(() => {
     const current = local.outputs.find(o => o.id === activeOutputId);
     if (!current) setActiveOutputId(local.outputs[0]?.id || 'main');
  }, [local.outputs, activeOutputId]);

  if (!isOpen) return null;

  const applyOutputLive = (id: string, fields: Partial<OutputSettings>) => {
    updateOutput(id, fields);
    onSave((prev: GlobalSettings) => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...fields } : o) }));
  };
  const cancelSettings = () => {
    const was = openedWith.current;
    if (was) {
      onSave((prev: GlobalSettings) => ({
        ...prev,
        outputs: prev.outputs.map(o => {
          const before = was.outputs.find(x => x.id === o.id);
          return before && before.backgroundOpacity !== o.backgroundOpacity ? { ...o, backgroundOpacity: before.backgroundOpacity } : o;
        }),
      }));
    }
    onClose();
  };
  const updateOutput = (id: string, updatedFields: Partial<OutputSettings>) => {
    setLocal(prev => ({ ...prev, outputs: prev.outputs.map(o => o.id === id ? { ...o, ...updatedFields } : o) }));
  };

  const activeOutput = local.outputs.find(o => o.id === activeOutputId);

  // Desktop app: the picture or video stays where it is on the computer; only its place is kept
  const chooseBackgroundFile = async () => {
    try {
      const path = await pickMediaFile('media');
      if (!path) return;
      updateOutput(activeOutputId, { defaultBackground: { type: isVideoPath(path) ? 'video' : 'image', url: mediaUrl(path), fileName: fileNameOf(path) } });
    } catch (err) {
      void showMessage(`Couldn't choose the file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
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
        if (isTauri()) {
            const monitors = await getMonitors();
            setDetectedScreens(monitors.map((m, i) => ({ label: m.name || `Display ${i + 1}`, width: m.size.width, height: m.size.height })));
            if (!monitors.length) void showMessage('No screens were found.');
            return;
        }
        if ('getScreenDetails' in window) {
            const details = await (window as any).getScreenDetails();
            setDetectedScreens(details.screens);
        } else {
            void showMessage('Screens can only be detected in the FlowShow desktop app.');
        }
    } catch (err: any) {
        console.warn(err);
        void showMessage('Could not detect screens. ' + err.message);
    }
  };

  const closeNewOutputModal = () => {
    setShowNewOutputModal(false);
    setSelectedNewOutputType(null);
    setSelectedNewOutputKind(null);
  };

  const addNewOutput = (type: OutputType, kind: ScreenKind) => {
    const newOutput = createOutput(type, kind, local.outputs, local.styles);
    setLocal(prev => ({ ...prev, outputs: [...prev.outputs, newOutput] }));
    setActiveOutputId(newOutput.id);
    closeNewOutputModal();
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
             <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="w-4 h-4 accent-pink-500 rounded cursor-pointer" />
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
    const isStage = isStageOutput(activeOutput);

    return (
      <div className="space-y-6">
        {/* The output's name: click it to rename */}
        <div className="flex items-baseline gap-2" data-output-name-heading>
          <InlineName value={activeOutput.name} onRename={(name) => updateOutput(activeOutputId, { name })} className="text-lg font-bold text-white" inputClassName="text-lg font-bold py-0.5 w-72" title="Click to rename this output" />
          <span className="text-[11px] text-neutral-500">Click the name to rename it</span>
        </div>

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
              <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
            </label>
          </div>
        </div>

        {/* What the screen is for (chosen when it was made) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl px-5 py-3 flex items-center gap-3">
          {isStage ? <Tv size={16} className="text-amber-400 shrink-0" /> : <MonitorPlay size={16} className="text-pink-400 shrink-0" />}
          <div className="text-xs">
            <span className="font-semibold text-white">{isStage ? 'Stage output' : 'Normal output'}</span>
            <span className="text-neutral-500"> · {isStage ? 'for the people on stage: current and next slide, section name and time' : 'for the audience: lyrics and scripture in your templates and designs'}</span>
          </div>
        </div>

        {/* Style selector — pick which PresentationStyle this output uses (only styles of the same kind) */}
        <div className="bg-[#121214] border border-white/5 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">{isStage ? 'Stage style' : 'Style'}</span>
            <select
              value={activeOutput.styleId || ''}
              onChange={(e) => updateOutput(activeOutputId, { styleId: e.target.value || undefined })}
              className="bg-[#1e1e28] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-pink-500 cursor-pointer min-w-[160px]"
            >
              <option value="">{isStage ? '(None — ready-made stage layouts)' : '(None — use output defaults)'}</option>
              {local.styles.filter(s => styleKind(s) === (isStage ? 'stage' : 'normal')).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {activeOutput.styleId && (() => {
            const sel = local.styles.find(s => s.id === activeOutput.styleId);
            if (!sel) return null;
            if (isStage) return (
              <div className="text-[11px] text-neutral-500 leading-relaxed space-y-0.5 pt-1 border-t border-white/5">
                <div>Lyrics layout: <span className="text-neutral-300">{stageLayoutFor(sel, { type: 'lyrics' }, local.stageLayouts).name}</span></div>
                <div>Scripture layout: <span className="text-neutral-300">{stageLayoutFor(sel, { type: 'scripture' }, local.stageLayouts).name}</span></div>
                <div>Background: <span className="text-neutral-300">{sel.backgroundColor}</span></div>
              </div>
            );
            return (
              <div className="text-[11px] text-neutral-500 leading-relaxed space-y-0.5 pt-1 border-t border-white/5">
                {sel.lyricsTemplateId && <div>Lyrics template: <span className="text-neutral-300">{getTemplateById(sel.lyricsTemplateId)?.name || sel.lyricsTemplateId}</span></div>}
                {sel.scriptureTemplateId && <div>Scripture template: <span className="text-neutral-300">{getTemplateById(sel.scriptureTemplateId)?.name || sel.scriptureTemplateId}</span></div>}
                <div>Background: <span className="text-neutral-300">{sel.backgroundColor}</span> · Transition: <span className="text-neutral-300">{sel.transition}</span> · Fit: <span className="text-neutral-300">{sel.mediaFit}</span></div>
              </div>
            );
          })()}
        </div>

        {/* TYPE-SPECIFIC: NDI® Settings */}
        {isNdi && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-neutral-400">
              <Wifi size={16} />
              <span className="text-sm font-bold">NDI®</span>
            </div>

            <NdiStatusCard output={activeOutput as any} />

            <div className="bg-[#121214] border border-white/5 rounded-xl overflow-hidden">
              {/* Size & Frame Rate Row */}
              <div className="grid grid-cols-2 divide-x divide-white/5">
                <div className="p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Size</span>
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Frame rate</span>
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400 block mb-1.5">Name</span>
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
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-pink-400">Target Display</span>
                <button onClick={detectScreens} className="text-xs bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-white/10 font-medium">
                  Detect Screens
                </button>
              </div>
              <select 
                value={activeOutput.displayId || ''} 
                onChange={(e) => updateOutput(activeOutputId, { displayId: e.target.value })}
                className="bg-[#09090B] border border-white/10 rounded-lg text-sm px-3 py-2.5 text-white outline-none focus:border-pink-500 w-full"
              >
                <option value="">-- No Display Selected --</option>
                {activeOutput.displayId && !detectedScreens.some(s => s.label === activeOutput.displayId) && <option value={activeOutput.displayId}>{activeOutput.displayId}</option>}
                {detectedScreens.map((s, i) => (
                  <option key={s.label || i} value={s.label}>{s.label || `Display ${i + 1}`}{s.width ? ` (${s.width}×${s.height})` : ''}</option>
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

        {/* Default Background and style overrides: audience screens only (a stage screen's look comes from its Stage style) */}
        {!isStage && <>
        <div className="bg-[#121214] border border-white/5 p-5 rounded-xl shadow-sm">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-3">Default Background</h3>
          <div className="flex flex-wrap items-center gap-3">
            <select 
              className="bg-[#09090B] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500 font-medium min-w-[180px]" 
              value={activeOutput.defaultBackground
                ? (activeOutput.defaultBackground.type === 'ndi' ? 'input' : activeOutput.defaultBackground.type === 'video' ? 'image' : activeOutput.defaultBackground.type)
                : 'none'}
              onChange={(e) => { 
                const val = e.target.value; 
                if (val === 'none') updateOutput(activeOutputId, { defaultBackground: null }); 
                else if (val === 'color') updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: '#0a0a0a' } }); 
                else if (val === 'image') updateOutput(activeOutputId, { defaultBackground: { type: 'image', url: '' } }); 
                else if (val === 'input') updateOutput(activeOutputId, { defaultBackground: { type: 'input' } });
              }}
            >
              <option value="none">None</option>
              <option value="color">Solid Color</option>
              <option value="image">Media (Image / Video)</option>
              <option value="input">Live input (camera, screen or NDI)</option>
            </select>
            {activeOutput.defaultBackground?.type === 'color' && (
              <input type="color" value={activeOutput.defaultBackground.color || '#0a0a0a'} onChange={e => updateOutput(activeOutputId, { defaultBackground: { type: 'color', color: e.target.value }})} className="h-9 w-14 cursor-pointer border-none bg-transparent" />
            )}
            {(activeOutput.defaultBackground?.type === 'input' || activeOutput.defaultBackground?.type === 'ndi') && (
              <div className="flex items-center gap-2 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1 min-w-[260px]" data-default-input>
                <Radio size={14} className="text-red-400 shrink-0" />
                <LiveInputSelect
                  value={activeOutput.defaultBackground.input}
                  onChange={(input) => updateOutput(activeOutputId, { defaultBackground: { type: 'input', input, fileName: input.label } })}
                  className="bg-transparent text-xs text-white font-medium outline-none flex-1 min-w-0 cursor-pointer [&>*]:bg-[#121214]"
                />
              </div>
            )}
            {(activeOutput.defaultBackground?.type === 'image' || activeOutput.defaultBackground?.type === 'video') && (
              <div className="flex items-center gap-3 bg-[#09090B] px-3 py-2 rounded-lg border border-white/5 flex-1">
                {isTauri() ? (
                  <button type="button" onClick={() => void chooseBackgroundFile()} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0" title="Choose a picture or video on this computer. It stays where it is; FlowShow only remembers where." data-choose-background>Browse...</button>
                ) : (
                  <label className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors shrink-0">Browse... <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" /></label>
                )}
                {activeOutput.defaultBackground.url ? (
                  <span className="text-xs text-neutral-300 truncate flex-1 font-mono">{activeOutput.defaultBackground.fileName || 'Local Media File'}</span>
                ) : ( <span className="text-xs text-red-400 italic">No media selected yet</span> )}
              </div>
            )}
            {activeOutput.defaultBackground && (
              <button
                type="button"
                onClick={() => updateOutput(activeOutputId, { defaultBackground: null })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0"
                title="Remove this screen's default background (it shows nothing behind the words until you send one)"
                data-remove-default-background
              >
                <X size={13} /> Remove
              </button>
            )}
          </div>
          {/* How strongly the background shows (over black): lower makes the words easier to read */}
          <div className="mt-4 flex items-center gap-3" data-bg-opacity-setting>
            <span className="text-xs font-medium text-white w-36 shrink-0">Background opacity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={activeOutput.backgroundOpacity ?? 80}
              onChange={(e) => applyOutputLive(activeOutputId, { backgroundOpacity: Number(e.target.value) })}
              className="flex-1 accent-pink-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-neutral-300 w-10 text-right">{activeOutput.backgroundOpacity ?? 80}%</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-1.5">Lower it to darken the background picture or video behind the words. The screens follow the slider as you drag (Cancel puts it back). It applies to every background shown on this output, including media you send from the Media tab.</p>
        </div>

        </>}
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
    { id: 'profiles', name: 'Profiles', icon: Layers },
    { id: 'theme', name: 'Themes', icon: Palette },
    { id: 'smart', name: 'Smart', icon: Activity, hidden: true },
    { id: 'help', name: 'Help', icon: BookOpen },
    { id: 'about', name: 'About', icon: Info },
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
                       ? 'bg-pink-600/20 text-pink-400 shadow-sm' 
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
                            <button onClick={() => void showMessage('Outputs are the screens FlowShow sends to: projectors and TVs (HDMI, DisplayPort or any screen), NDI video over the network (with transparency for overlays), and stage screens.')} className="p-1 hover:text-white transition-colors" title="Output Information">
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
                                    ? 'border-pink-500 bg-pink-600/10' 
                                    : 'border-white/10 bg-[#030303] hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 px-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {isNdi ? <NdiDot output={out as any} /> : <div className={`w-2 h-2 rounded-full ${out.enabled ? 'bg-pink-400' : 'bg-neutral-600'}`} />}
                                    <span className="text-xs font-bold text-white truncate">{out.name}</span>
                                  </div>
                                  <span className="flex items-center gap-1 shrink-0">
                                    {isStageOutput(out) && <span className="text-[9px] font-bold uppercase px-1 rounded bg-amber-500/15 text-amber-400">Stage</span>}
                                    <span className="text-[9px] font-mono uppercase px-1 rounded bg-white/5 text-neutral-400">
                                      {isNdi ? 'NDI' : 'HDMI'}
                                    </span>
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
                          <button onClick={() => { const ids = local.outputs.map(o => o.id); setActiveOutputId(ids[(ids.indexOf(activeOutputId) - 1 + ids.length) % ids.length]); }} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Previous"><ChevronLeft size={14} /></button>
                          <button onClick={() => { const ids = local.outputs.map(o => o.id); setActiveOutputId(ids[(ids.indexOf(activeOutputId) + 1) % ids.length]); }} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Next"><ChevronRight size={14} /></button>
                          <button onClick={() => onTogglePresenting?.()} className={`p-1.5 rounded hover:bg-white/5 transition-colors ${isPresenting ? 'text-red-400' : 'text-pink-400'}`} title="Play / Go Live"><Play size={14} /></button>
                          <button onClick={() => onToggleLockOutput?.(activeOutputId)} className="p-1.5 rounded hover:bg-white/5 hover:text-white" title="Lock Screen"><Lock size={14} /></button>
                        </div>
                     </div>
                  </div>
               )}
               {activeTab === 'profiles' && profilesApi && (
                  <ProfilesPanel
                    {...(profilesApi as ProfilesApi)}
                    // The setup being edited here (with unsaved changes) is what the current profile keeps
                    onSwitch={(id: string) => profilesApi.onSwitch(id, local)}
                    onCreate={(name: string, copy: boolean) => profilesApi.onCreate(name, copy, local)}
                    onExport={(id: string) => profilesApi.onExport(id, local)}
                    onDuplicate={(id: string) => profilesApi.onDuplicate(id, local)}
                  />
               )}
               {activeTab === 'help' && (
                  <div className="space-y-8" data-settings-help>
                     <div>
                        <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Help</h2>
                        <p className="text-neutral-400 text-sm">Getting started, and the keys that run a service. The online documentation is coming soon.</p>
                     </div>
                     <section>
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Rocket size={15} className="text-pink-400" /> Quick start</h3>
                        <QuickStartContent />
                     </section>
                     <section>
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Keyboard size={15} className="text-pink-400" /> Keyboard shortcuts</h3>
                        <ShortcutsContent />
                     </section>
                  </div>
               )}
               {activeTab === 'about' && (
                  <div className="max-w-lg" data-settings-about>
                     <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">About</h2>
                     <AboutContent />
                  </div>
               )}
               {activeTab === 'theme' && (
                  <div data-settings-themes>
                     <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">Themes</h2>
                     <p className="text-neutral-400 text-sm mb-5">The colour of FlowShow's buttons and highlights. It changes at once; the screens your audience sees are not affected.</p>
                     <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {APP_THEMES.map(theme => {
                           const chosen = (local.appTheme || DEFAULT_APP_THEME) === theme.id;
                           const sw = themeSwatch(theme);
                           return (
                              <button
                                 key={theme.id}
                                 type="button"
                                 onClick={() => {
                                    // Saved straight away (like styles), so the whole app shows it at once
                                    commitStyleChange(prev => ({ ...prev, appTheme: theme.id }));
                                 }}
                                 className={`text-left rounded-xl border p-3 transition-colors ${chosen ? 'border-white/60 bg-white/[0.06]' : 'border-white/10 hover:border-white/30 bg-white/[0.02]'}`}
                                 data-theme-choice={theme.id}
                                 data-chosen={chosen ? 'yes' : 'no'}
                              >
                                 <div className="h-14 rounded-lg mb-2.5 flex overflow-hidden border border-white/5" style={{ background: '#09090b' }}>
                                    <div className="flex-1 flex items-center justify-center gap-1.5">
                                       <span className="px-2 py-1 rounded-md text-[11px] font-bold" style={{ background: theme.second.bg, color: theme.second.text }} title="Second colour: the screen you are designing">Output 1</span>
                                       <span className="px-2 py-1 rounded-md text-[11px] font-bold text-white" style={{ background: sw[6] }}>Go live</span>
                                    </div>
                                    <div className="w-1/3 flex flex-col">
                                       {[3, 4, 5, 6, 7].map(i => <div key={i} className="flex-1" style={{ background: sw[i] }} />)}
                                    </div>
                                 </div>
                                 <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-white">{theme.name}</span>
                                    {chosen && <Check size={15} className="text-white" />}
                                 </div>
                                 <span className="text-[11px] text-neutral-500">{theme.description}</span>
                              </button>
                           );
                        })}
                     </div>
                  </div>
               )}
               {activeTab === 'style' && (
                  <StylesManager
                    styles={local.styles}
                    stageLayouts={local.stageLayouts || []}
                    templates={allTemplates}
                    onReloadTemplates={() => getStoredTemplates().then(setAllTemplates)}
                    onAdd={(kind) => {
                      const base: PresentationStyle = {
                        id: `style-${Date.now()}`,
                        name: 'New Style',
                        kind,
                        backgroundColor: '#000000',
                        transition: 'fade',
                        mediaFit: 'contain',
                        aspectRatio: '16:9',
                        activeLayers: { background: true, slide: true, overlays: true },
                      };
                      const newStyle: PresentationStyle = kind === 'stage'
                        ? { ...base, name: 'New Stage Style', transition: 'none', lyricsStageLayoutId: DEFAULT_LYRICS_STAGE_LAYOUT, scriptureStageLayoutId: DEFAULT_SCRIPTURE_STAGE_LAYOUT }
                        : base;
                      commitStyleChange(prev => ({ ...prev, styles: [...prev.styles, newStyle] }));
                      return newStyle.id;
                    }}
                    onUpdate={(updated) => commitStyleChange(prev => ({
                      ...prev,
                      styles: prev.styles.map(s => s.id === updated.id ? updated : s)
                    }))}
                    onDelete={(id) => commitStyleChange(prev => ({
                      ...prev,
                      styles: prev.styles.filter(s => s.id !== id),
                      outputs: prev.outputs.map(o => o.styleId === id ? { ...o, styleId: undefined } : o)
                    }))}
                  />
               )}
               {!['outputs', 'style', 'help', 'about', 'theme', 'profiles'].includes(activeTab) && (
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
                             ? 'bg-[#121214] text-white border border-pink-500/50 shadow-sm' 
                             : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent'
                           }`}
                       >
                         {/* Checkmark icon as shown in Image c & e */}
                         <Check size={12} className={out.enabled ? (isNdi ? 'text-emerald-400' : 'text-pink-400') : 'text-neutral-600'} />
                         {isActive
                           ? <InlineName value={out.name} onRename={(name) => updateOutput(out.id, { name })} className="truncate" inputClassName="w-28 text-xs py-0.5" title="Click to rename this output" />
                           : <span className="truncate">{out.name}</span>}
                         {isStageOutput(out) && <Tv size={10} className="text-amber-400 shrink-0" />}
                         {isNdi && <Wifi size={10} className="text-neutral-500 shrink-0" />}
                         {local.outputs.length > 1 && (
                           <span
                             role="button"
                             onClick={(e) => { e.stopPropagation(); removeOutput(out.id); }}
                             className="ml-1 opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all shrink-0"
                             title="Remove output"
                           >
                             <X size={12} />
                           </span>
                         )}
                       </button>
                     );
                   })}
                   <button
                     onClick={() => setShowNewOutputModal(true)}
                     className="px-3 py-1.5 text-pink-400 hover:text-pink-300 hover:bg-pink-600/10 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ml-1 shrink-0"
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
                <button onClick={cancelSettings} className="px-5 py-2 hover:bg-white/5 text-neutral-300 transition-colors rounded-lg text-xs font-medium">Cancel</button>
                <button onClick={() => { onSave(local); onClose(); }} className="px-6 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-2 shadow-lg"><Save size={14} /> Save Settings</button>
             </div>
          </div>
       </div>
    </div>

    {/* MODAL: New output — what it's for, then how it connects */}
    {showNewOutputModal && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
        <div className="bg-[#121214] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
          <div className="p-6 flex items-center justify-between border-b border-white/5">
            <h3 className="text-lg font-bold text-white">New output</h3>
            <button onClick={closeNewOutputModal} className="text-neutral-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Who the screen is for */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">What is it for?</span>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['normal', 'Normal', 'For the audience: lyrics and scripture in your templates and designs', MonitorPlay],
                  ['stage', 'Stage', 'For the people on stage: current and next slide, section name and time', Tv],
                ] as const).map(([kind, title, text, Icon]) => (
                  <button
                    key={kind}
                    onClick={() => setSelectedNewOutputKind(kind)}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 text-center transition-all ${
                      selectedNewOutputKind === kind
                        ? 'border-pink-500 bg-pink-600/10 text-white'
                        : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <Icon size={28} className={selectedNewOutputKind === kind ? 'text-pink-400' : ''} />
                    <span className="font-bold text-sm">{title}</span>
                    <span className="text-[11px] text-neutral-500 leading-snug">{text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Local Output */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 block">Local output</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedNewOutputType('hdmi')}
                  className={`p-6 rounded-xl border-2 flex flex-col items-center gap-3 transition-all ${
                    selectedNewOutputType === 'hdmi' 
                      ? 'border-pink-500 bg-pink-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <MonitorPlay size={36} className={selectedNewOutputType === 'hdmi' ? 'text-pink-400' : ''} />
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
                      ? 'border-pink-500 bg-pink-600/10 text-white' 
                      : 'border-white/10 bg-[#09090B] text-neutral-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <Wifi size={24} className={selectedNewOutputType === 'ndi' ? 'text-pink-400' : ''} />
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
              onClick={() => { if (selectedNewOutputType && selectedNewOutputKind) addNewOutput(selectedNewOutputType, selectedNewOutputKind); }}
              disabled={!selectedNewOutputType || !selectedNewOutputKind}
              className="w-full py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-30 disabled:hover:bg-pink-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg"
              title={!selectedNewOutputKind ? 'Choose Normal or Stage first' : !selectedNewOutputType ? 'Choose how it connects' : undefined}
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
