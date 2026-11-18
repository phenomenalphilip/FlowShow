import React, { useState } from 'react';
import { 
  X, RotateCcw, Save, Copy, Play, Check, Layers, Sparkles, 
  Type, Move, Sliders, Palette, Trash2, ArrowLeft 
} from 'lucide-react';
import { PresentationTemplate, AnimationType, AnimationConfig } from '../lib/templates';
import { SmartTextLayout } from './SmartTextLayout';

interface TemplateEditorProps {
  template: PresentationTemplate;
  onSave: (updatedTemplate: PresentationTemplate) => void;
  onSaveAsCopy?: (newTemplate: PresentationTemplate) => void;
  onDelete?: (templateId: string) => void;
  onApplyToSlide?: (template: PresentationTemplate) => void;
  onApplyToSong?: (template: PresentationTemplate) => void;
  onClose: () => void;
}

const FONT_OPTIONS = [
  { label: 'Inter (Clean Sans)', value: 'Inter, sans-serif' },
  { label: 'Montserrat (Modern Bold)', value: 'Montserrat, sans-serif' },
  { label: 'Cinzel (Majestic Serif)', value: 'Cinzel, Georgia, serif' },
  { label: 'Space Grotesk (Tech Geometric)', value: 'Space Grotesk, sans-serif' },
  { label: 'Playfair Display (Elegant Serif)', value: 'Playfair Display, serif' },
  { label: 'Bebas Neue (Heavy Condensed)', value: 'Bebas Neue, sans-serif' },
  { label: 'Oswald (Strong Headline)', value: 'Oswald, sans-serif' },
  { label: 'Outfit (Sleek Minimal)', value: 'Outfit, sans-serif' },
  { label: 'Georgia (Classic Editorial)', value: 'Georgia, serif' },
  { label: 'Plus Jakarta Sans (Crisp UI)', value: 'Plus Jakarta Sans, sans-serif' },
];

const MOTION_PRESETS: { type: AnimationType; label: string; desc: string }[] = [
  { type: 'blur-in', label: 'Blur Bloom', desc: 'Soft depth-of-field focus reveal' },
  { type: 'kinetic-punch', label: 'Kinetic Punch', desc: 'High energy spring overshoot' },
  { type: 'mask-slide', label: 'Mask Slide', desc: 'Sleek upward wipe mask' },
  { type: 'golden-shimmer', label: 'Luminous Shimmer', desc: 'Golden text radiance & bloom' },
  { type: 'lead-tracker', label: 'Lead Tracker', desc: 'Line-by-line vocal focus' },
  { type: 'editorial-split', label: 'Editorial Split', desc: 'Dual-scale magazine hierarchy' },
  { type: 'neon-pulse', label: 'Neon Pulse', desc: 'Electric glowing atmosphere' },
  { type: 'acoustic-dissolve', label: 'Acoustic Dissolve', desc: 'Warm cinematic film fade' },
  { type: 'opposing-drift', label: 'Opposing Drift', desc: 'Multi-directional kinetic reveal' },
  { type: 'rhythm-typewriter', label: 'Rhythm Typewriter', desc: 'Cadenced word typewriter' },
  { type: 'vertical-scroll', label: 'Vertical Scroll', desc: 'Large text roll from bottom to top' },
];

const LAYOUT_PRESETS = [
  { label: 'Center Stage', layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 } },
  { label: 'Lower Third (Broadcast)', layout: { x: 0.05, y: 0.65, width: 0.9, height: 0.28 } },
  { label: 'Cinematic Widescreen', layout: { x: 0.12, y: 0.25, width: 0.76, height: 0.5 } },
  { label: 'Top Header', layout: { x: 0.05, y: 0.08, width: 0.9, height: 0.25 } },
  { label: 'Minimal Lower', layout: { x: 0.1, y: 0.75, width: 0.8, height: 0.2 } },
];

const BACKGROUND_PRESETS = [
  { label: 'Midnight Blue', value: 'radial-gradient(ellipse at center, #1e1b4b 0%, #030712 100%)' },
  { label: 'Deep Dark', value: 'linear-gradient(180deg, #09090b 0%, #121214 100%)' },
  { label: 'Warm Slate', value: 'linear-gradient(135deg, #1c1917 0%, #0c0a09 100%)' },
  { label: 'Luminous Gold', value: 'radial-gradient(circle at 50% 40%, #291e0a 0%, #090703 100%)' },
  { label: 'Neon Cyber', value: 'radial-gradient(ellipse at bottom, #1e1035 0%, #05020a 100%)' },
  { label: 'Stage Black', value: '#000000' },
  { label: 'Broadcast Green (Chroma)', value: '#00b140' }
];

const SHADOW_PRESETS = [
  { label: 'None', value: 'none' },
  { label: 'Subtle Drop', value: '0 4px 12px rgba(0,0,0,0.8)' },
  { label: 'Heavy Contrast', value: '0 8px 0px rgba(0,0,0,1), 0 20px 40px rgba(0,0,0,0.9)' },
  { label: 'Ambient Bloom', value: '0 10px 30px rgba(0,0,0,0.9), 0 0 25px rgba(255,255,255,0.2)' },
  { label: 'Golden Glow', value: '0 0 35px rgba(234,179,8,0.4), 0 10px 20px rgba(0,0,0,0.9)' },
  { label: 'Neon Cyan', value: '0 0 30px rgba(56,189,248,0.5), 0 0 10px rgba(255,255,255,0.8)' }
];

export function TemplateEditor({
  template,
  onSave,
  onSaveAsCopy,
  onDelete,
  onApplyToSlide,
  onApplyToSong,
  onClose,
}: TemplateEditorProps) {
  // Working draft state
  const [draft, setDraft] = useState<PresentationTemplate>({ ...template });
  const [activeTab, setActiveTab] = useState<'typography' | 'motion' | 'layout' | 'meta'>('typography');
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [sampleText, setSampleText] = useState<string>("AMAZING GRACE HOW SWEET\nTHE SOUND THAT SAVED A WRETCH");

  const globalStyle = draft.styles.global || {};
  const currentAnimation = draft.animation;

  const updateGlobalStyle = (patch: Partial<React.CSSProperties>) => {
    setDraft(prev => ({
      ...prev,
      styles: {
        ...prev.styles,
        global: {
          ...prev.styles.global,
          ...patch
        }
      }
    }));
  };

  const updateAnimation = (patch: Partial<AnimationConfig>) => {
    setDraft(prev => ({
      ...prev,
      animation: {
        ...prev.animation,
        ...patch
      }
    }));
    setPreviewKey(k => k + 1);
  };

  const replay = () => setPreviewKey(k => k + 1);

  const handleSave = () => {
    onSave(draft);
  };

  const handleSaveCopy = () => {
    if (onSaveAsCopy) {
      const copy: PresentationTemplate = {
        ...draft,
        id: `custom-${Date.now()}`,
        name: `${draft.name} (Copy)`,
        badge: 'Custom',
        isCustom: true
      };
      onSaveAsCopy(copy);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] text-neutral-200 overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0c0c0e]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Back to Gallery"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-bold">Template Studio</span>
            <span className="text-neutral-600">/</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
              className="bg-transparent border-b border-dashed border-white/20 hover:border-blue-500 focus:border-blue-500 px-1 py-0.5 text-base font-bold text-white outline-none transition-colors"
              placeholder="Template Name"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onSaveAsCopy && (
            <button
              onClick={handleSaveCopy}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/5 cursor-pointer"
            >
              <Copy size={13} />
              Save as Copy
            </button>
          )}

          {draft.isCustom && onDelete && (
            <button
              onClick={() => onDelete(draft.id)}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-1.5 transition-all border border-red-500/20 cursor-pointer"
              title="Delete Custom Template"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}

          {onApplyToSlide && (
            <button
              onClick={() => {
                handleSave();
                onApplyToSlide(draft);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-blue-500/30 transition-all cursor-pointer"
            >
              <Check size={13} />
              Apply to Slide
            </button>
          )}

          {onApplyToSong && (
            <button
              onClick={() => {
                handleSave();
                onApplyToSong(draft);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-white text-xs font-bold flex items-center gap-1.5 border border-indigo-500/30 transition-all cursor-pointer"
            >
              <Layers size={13} />
              Apply to Song
            </button>
          )}

          <button
            onClick={() => {
              handleSave();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Save size={13} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Main Body: Split View (Interactive Preview + Control Panel) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Side: Real-time 16:9 Stage Preview */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center bg-[#070709] border-r border-white/5 relative overflow-hidden">
          
          {/* Top Preview Bar */}
          <div className="w-full max-w-3xl mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live 16:9 Canvas
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={replay}
                className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw size={12} className="text-blue-400" />
                Replay Motion
              </button>
            </div>
          </div>

          {/* 16:9 Monitor Frame */}
          <div className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden shadow-2xl border border-white/10 relative flex items-center justify-center select-none"
            style={{ background: draft.backgroundPreview || '#09090b' }}
          >
            <div 
              key={previewKey} 
              className="w-full h-full relative"
            >
              <SmartTextLayout
                text={sampleText}
                animation={draft.animation}
                styleOverrides={{
                  global: {
                    ...draft.styles.global,
                    fontSize: draft.styles.global?.fontSize || '26px'
                  },
                  lines: draft.styles.lines,
                  layout: draft.styles.layout
                }}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Sample Text Editor Input */}
          <div className="w-full max-w-3xl mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Preview Sample Lyrics & Text
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSampleText("AMAZING GRACE HOW SWEET\nTHE SOUND THAT SAVED A WRETCH");
                    setPreviewKey(k => k + 1);
                  }}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-400 hover:text-white cursor-pointer"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSampleText("WHEN PEACE LIKE A RIVER\nATTENDETH MY WAY\nWHEN SORROWS LIKE SEA BILLOWS ROLL\nWHATEVER MY LOT\nTHOU HAST TAUGHT ME TO SAY\nIT IS WELL WITH MY SOUL");
                    setPreviewKey(k => k + 1);
                  }}
                  className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/20 cursor-pointer"
                >
                  Multi-Line Hymn Roll
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSampleText("FOR GOD SO LOVED THE WORLD\nTHAT HE GAVE HIS ONE AND ONLY SON\nTHAT WHOEVER BELIEVES IN HIM\nSHALL NOT PERISH\nBUT HAVE ETERNAL LIFE\n— JOHN 3:16");
                    setPreviewKey(k => k + 1);
                  }}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10px] text-neutral-400 hover:text-white cursor-pointer"
                >
                  Scripture
                </button>
              </div>
            </div>
            <textarea
              rows={3}
              value={sampleText}
              onChange={(e) => {
                setSampleText(e.target.value);
                setPreviewKey(k => k + 1);
              }}
              className="w-full bg-[#111114] border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono resize-none transition-colors"
            />
          </div>

        </div>

        {/* Right Side: Tabbed Parameter Studio */}
        <div className="w-full lg:w-[420px] bg-[#0c0c0e] flex flex-col shrink-0 overflow-hidden">
          
          {/* Sub Navigation Tabs */}
          <div className="h-12 border-b border-white/5 flex items-center px-4 gap-1 shrink-0 bg-[#09090b]">
            <button
              onClick={() => setActiveTab('typography')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'typography'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Type size={13} />
              Type
            </button>
            <button
              onClick={() => setActiveTab('motion')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'motion'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles size={13} />
              Motion
            </button>
            <button
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'layout'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Move size={13} />
              Layout
            </button>
            <button
              onClick={() => setActiveTab('meta')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'meta'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders size={13} />
              Details
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6">
            
            {/* TAB: TYPOGRAPHY */}
            {activeTab === 'typography' && (
              <div className="space-y-5">
                
                {/* Font Family */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                    Font Family
                  </label>
                  <select
                    value={globalStyle.fontFamily || 'Inter, sans-serif'}
                    onChange={(e) => updateGlobalStyle({ fontFamily: e.target.value })}
                    className="w-full bg-[#141417] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {FONT_OPTIONS.map(f => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Font Size & Weight */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Font Size
                      </label>
                      <span className="text-[11px] font-mono text-blue-400">
                        {globalStyle.fontSize || '26px'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="96"
                      step="2"
                      value={parseInt(String(globalStyle.fontSize || '26'), 10)}
                      onChange={(e) => updateGlobalStyle({ fontSize: `${e.target.value}px` })}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                      Font Weight
                    </label>
                    <select
                      value={globalStyle.fontWeight || '600'}
                      onChange={(e) => updateGlobalStyle({ fontWeight: e.target.value })}
                      className="w-full bg-[#141417] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="300">Light (300)</option>
                      <option value="400">Regular (400)</option>
                      <option value="600">SemiBold (600)</option>
                      <option value="700">Bold (700)</option>
                      <option value="900">Black (900)</option>
                    </select>
                  </div>
                </div>

                {/* Text Color & Swatches */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      Text Color
                    </label>
                    <span className="text-[11px] font-mono text-neutral-400">
                      {String(globalStyle.color || '#ffffff')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(globalStyle.color || '#ffffff').startsWith('#') ? String(globalStyle.color) : '#ffffff'}
                      onChange={(e) => updateGlobalStyle({ color: e.target.value })}
                      className="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer p-0.5"
                    />
                    <div className="flex items-center gap-1.5 flex-1">
                      {['#ffffff', '#fbbf24', '#38bdf8', '#f87171', '#4ade80', '#e2e8f0'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateGlobalStyle({ color: c })}
                          className="w-6 h-6 rounded-md border border-white/20 transition-transform hover:scale-110 cursor-pointer"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Text Transform & Alignment */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                      Case
                    </label>
                    <div className="flex rounded-lg bg-[#141417] border border-white/10 p-1">
                      {[
                        { label: 'AA', val: 'uppercase', title: 'UPPERCASE' },
                        { label: 'Aa', val: 'capitalize', title: 'Title Case' },
                        { label: 'aa', val: 'none', title: 'Normal' },
                      ].map(item => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => updateGlobalStyle({ textTransform: item.val as any })}
                          className={`flex-1 py-1 text-xs font-bold rounded cursor-pointer transition-all ${
                            (globalStyle.textTransform || 'none') === item.val
                              ? 'bg-blue-600 text-white'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                          title={item.title}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                      Alignment
                    </label>
                    <div className="flex rounded-lg bg-[#141417] border border-white/10 p-1">
                      {['left', 'center', 'right'].map(align => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => updateGlobalStyle({ textAlign: align as any })}
                          className={`flex-1 py-1 text-xs capitalize font-medium rounded cursor-pointer transition-all ${
                            (globalStyle.textAlign || 'center') === align
                              ? 'bg-blue-600 text-white font-bold'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {align}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Letter Spacing & Line Height */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Spacing
                      </label>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {globalStyle.letterSpacing || '0em'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-0.04"
                      max="0.25"
                      step="0.01"
                      value={parseFloat(String(globalStyle.letterSpacing || '0').replace('em', ''))}
                      onChange={(e) => updateGlobalStyle({ letterSpacing: `${e.target.value}em` })}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Line Height
                      </label>
                      <span className="text-[11px] font-mono text-neutral-400">
                        {globalStyle.lineHeight || 1.25}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="1.8"
                      step="0.05"
                      value={Number(globalStyle.lineHeight || 1.25)}
                      onChange={(e) => updateGlobalStyle({ lineHeight: parseFloat(e.target.value) })}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Text Shadow & Glow Presets */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                    Shadow & Glow
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SHADOW_PRESETS.map(s => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => updateGlobalStyle({ textShadow: s.value })}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${
                          (globalStyle.textShadow || 'none') === s.value
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-[#141417] border-white/5 text-neutral-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* TAB: MOTION & PHYSICS */}
            {activeTab === 'motion' && (
              <div className="space-y-5">
                
                {/* Animation Type Selector */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                    Motion Engine
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {MOTION_PRESETS.map(m => (
                      <button
                        key={m.type}
                        type="button"
                        onClick={() => updateAnimation({ type: m.type })}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          currentAnimation.type === m.type
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                            : 'bg-[#141417] border-white/5 text-neutral-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Play size={10} className="text-blue-400 fill-blue-400" />
                            {m.label}
                          </div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">{m.desc}</div>
                        </div>
                        {currentAnimation.type === m.type && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                            <Check size={11} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {currentAnimation.type === 'vertical-scroll' ? (
                  /* Dedicated Vertical Scroll Controls */
                  <div className="space-y-5 p-4 rounded-xl bg-blue-950/20 border border-blue-500/20">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Move size={13} />
                        Vertical Scroll Settings
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">Bottom → Top</span>
                    </div>

                    {/* Scroll Duration / Speed */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                          Scroll Duration (Speed)
                        </label>
                        <span className="text-[11px] font-mono text-blue-400 font-bold">
                          {currentAnimation.duration}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="60"
                        step="1"
                        value={currentAnimation.duration || 14}
                        onChange={(e) => updateAnimation({ duration: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-neutral-500 font-mono mt-1">
                        <span>Fast (3s)</span>
                        <span>Normal (14s)</span>
                        <span>Slow Roll (60s)</span>
                      </div>
                    </div>

                    {/* Start Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                          Where Scrolling Starts
                        </label>
                        <span className="text-[11px] font-mono text-amber-400 font-bold">
                          +{currentAnimation.scrollStart ?? 100}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {[
                          { label: 'Offscreen Bottom', val: 100 },
                          { label: 'Lower Half', val: 50 },
                          { label: 'Center', val: 0 }
                        ].map(p => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => updateAnimation({ scrollStart: p.val })}
                            className={`py-1 text-[10px] font-semibold rounded border transition-all cursor-pointer ${
                              (currentAnimation.scrollStart ?? 100) === p.val
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-[#141417] text-neutral-400 hover:text-white border-white/5'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="150"
                        step="5"
                        value={currentAnimation.scrollStart ?? 100}
                        onChange={(e) => updateAnimation({ scrollStart: parseInt(e.target.value, 10) })}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>

                    {/* Stop / End Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                          Where Scrolling Stops
                        </label>
                        <span className="text-[11px] font-mono text-emerald-400 font-bold">
                          {currentAnimation.scrollEnd ?? -100}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {[
                          { label: 'Offscreen Top', val: -100 },
                          { label: 'Hold Center', val: 0 },
                          { label: 'Top Third', val: -40 }
                        ].map(p => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => updateAnimation({ scrollEnd: p.val })}
                            className={`py-1 text-[10px] font-semibold rounded border transition-all cursor-pointer ${
                              (currentAnimation.scrollEnd ?? -100) === p.val
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-[#141417] text-neutral-400 hover:text-white border-white/5'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min="-150"
                        max="50"
                        step="5"
                        value={currentAnimation.scrollEnd ?? -100}
                        onChange={(e) => updateAnimation({ scrollEnd: parseInt(e.target.value, 10) })}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                    </div>

                    {/* Loop Mode */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                        Playback Loop
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateAnimation({ scrollLoop: true })}
                          className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            currentAnimation.scrollLoop !== false
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-[#141417] text-neutral-400 hover:text-white border-white/5'
                          }`}
                        >
                          Loop Continuously
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAnimation({ scrollLoop: false })}
                          className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            currentAnimation.scrollLoop === false
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-[#141417] text-neutral-400 hover:text-white border-white/5'
                          }`}
                        >
                          Scroll Once & Hold
                        </button>
                      </div>
                    </div>

                    {/* Easing */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                        Scroll Physics
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: 'linear', label: 'Constant Speed' },
                          { val: 'easeOut', label: 'Smooth Deceleration' }
                        ].map(e => (
                          <button
                            key={e.val}
                            type="button"
                            onClick={() => updateAnimation({ easing: e.val as any })}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              (currentAnimation.easing || 'linear') === e.val
                                ? 'bg-blue-600 text-white border-blue-500'
                                : 'bg-[#141417] text-neutral-400 hover:text-white border-white/5'
                            }`}
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Duration Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                          Duration
                        </label>
                        <span className="text-[11px] font-mono text-blue-400">
                          {currentAnimation.duration.toFixed(2)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.5"
                        step="0.05"
                        value={currentAnimation.duration}
                        onChange={(e) => updateAnimation({ duration: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Stagger Delay */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                          Stagger Delay (Words / Lines)
                        </label>
                        <span className="text-[11px] font-mono text-blue-400">
                          {(currentAnimation.stagger || 0.04).toFixed(3)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.00"
                        max="0.20"
                        step="0.01"
                        value={currentAnimation.stagger || 0.04}
                        onChange={(e) => updateAnimation({ stagger: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Easing Physics */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                        Easing Curve
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: 'easeOut', label: 'Smooth Ease Out' },
                          { val: 'spring', label: 'Spring Physics' },
                          { val: 'backOut', label: 'Playful Overshoot' },
                          { val: 'easeInOut', label: 'Linear Ease' }
                        ].map(e => (
                          <button
                            key={e.val}
                            type="button"
                            onClick={() => updateAnimation({ easing: e.val as any })}
                            className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${
                              currentAnimation.easing === e.val
                                ? 'bg-blue-600/20 border-blue-500 text-white'
                                : 'bg-[#141417] border-white/5 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {e.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Ambient Continuous Loop */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                    Ambient Continuous Motion
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { val: 'none', label: 'Static' },
                      { val: 'drift', label: 'Slow Float Drift' },
                      { val: 'breathe', label: 'Gentle Breathe' }
                    ].map(loop => (
                      <button
                        key={loop.val}
                        type="button"
                        onClick={() => updateAnimation({ ambientLoop: loop.val as any })}
                        className={`px-3 py-2 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                          (currentAnimation.ambientLoop || 'none') === loop.val
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-[#141417] border-white/5 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {loop.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* TAB: LAYOUT & CANVAS */}
            {activeTab === 'layout' && (
              <div className="space-y-5">
                
                {/* Layout Presets */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                    Screen Positioning Preset
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {LAYOUT_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setDraft(d => ({
                          ...d,
                          styles: { ...d.styles, layout: p.layout }
                        }))}
                        className="px-3.5 py-2.5 rounded-xl border border-white/5 bg-[#141417] hover:bg-white/5 hover:border-blue-500/50 text-xs font-medium text-white flex items-center justify-between transition-all cursor-pointer"
                      >
                        <span>{p.label}</span>
                        <Move size={12} className="text-neutral-500" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Color & Gradient */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                    Canvas Background Preview
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_PRESETS.map(bg => (
                      <button
                        key={bg.label}
                        type="button"
                        onClick={() => setDraft(d => ({ ...d, backgroundPreview: bg.value }))}
                        className={`h-16 rounded-xl border p-2 flex flex-col justify-end text-left relative overflow-hidden transition-all cursor-pointer ${
                          draft.backgroundPreview === bg.value
                            ? 'ring-2 ring-blue-500 border-transparent'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                        style={{ background: bg.value }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow-md z-10 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm self-start">
                          {bg.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* TAB: DETAILS & METADATA */}
            {activeTab === 'meta' && (
              <div className="space-y-5">
                
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                    Category
                  </label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft(d => ({ ...d, category: e.target.value as any }))}
                    className="w-full bg-[#141417] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="worship">Worship & Ambient</option>
                    <option value="high-energy">High Energy & LED</option>
                    <option value="broadcast">Broadcast & Stream</option>
                    <option value="scripture">Scripture & Serif</option>
                    <option value="modern">Modern Editorial</option>
                    <option value="custom">Custom Presets</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                    Badge Label
                  </label>
                  <input
                    type="text"
                    value={draft.badge || ''}
                    onChange={(e) => setDraft(d => ({ ...d, badge: e.target.value }))}
                    placeholder="e.g. Popular, High Impact, Custom"
                    className="w-full bg-[#141417] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}