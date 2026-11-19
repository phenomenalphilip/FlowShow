import React, { useState, useEffect, useRef } from 'react';
import {
  X, Sparkles, Check, Layers, Monitor, Pencil, Plus,
  ArrowRight, Radio, Tv, Music, Type, Copy, Trash
} from 'lucide-react';
import {
  STARTER_TEMPLATES,
  PresentationTemplate,
  SCRIPTURE_SAMPLES,
  getStoredTemplates,
  saveTemplate,
  deleteTemplate
} from '../lib/templates';
import { SmartTextLayout } from './SmartTextLayout';
import { FixedStage } from './FixedStage';
import { TemplateEditor } from './TemplateEditor';
import { ExportTemplatesDialog, ImportTemplatesDialog } from './TemplatePackageDialogs';

export interface TemplateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'modal' wraps in a full-screen overlay (default). 'inline' renders directly into its parent container. */
  variant?: 'modal' | 'inline';
  mode?: 'manage' | 'select-for-slide' | 'select-for-output';
  targetSongTitle?: string;
  targetSlideIndex?: number;
  targetOutputName?: string;
  targetOutputId?: string;
  availableSongs?: { id: string; title: string; slides: any[] }[];
  availableOutputs?: { id: string; name: string }[];
  activeTemplateId?: string;
  initialEditTemplate?: PresentationTemplate;
  onApplyToSlide?: (template: PresentationTemplate, outputId?: string) => void;
  onApplyToSong?: (template: PresentationTemplate, songId?: string, outputId?: string) => void;
  onApplyToOutput?: (template: PresentationTemplate, outputId?: string) => void;
}

export function TemplateGalleryModal({
  isOpen,
  onClose,
  variant = 'modal',
  mode = 'manage',
  targetSongTitle,
  targetSlideIndex,
  targetOutputName,
  targetOutputId,
  availableSongs = [],
  availableOutputs = [],
  activeTemplateId,
  initialEditTemplate,
  onApplyToSlide,
  onApplyToSong,
  onApplyToOutput,
}: TemplateGalleryModalProps) {
  const [templates, setTemplates] = useState<PresentationTemplate[]>(STARTER_TEMPLATES);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [editingTemplate, setEditingTemplate] = useState<PresentationTemplate | null>(initialEditTemplate || null);

  // Target assignment dialog for 'manage' mode
  const [assigningTemplate, setAssigningTemplate] = useState<PresentationTemplate | null>(null);
  const [assignTargetType, setAssignTargetType] = useState<'song' | 'output'>('song');
  const [selectedSongId, setSelectedSongId] = useState<string>(availableSongs[0]?.id || '');
  const [selectedScreenOutputId, setSelectedScreenOutputId] = useState<string>(availableOutputs[0]?.id || 'main');
  const [selectedScreenScope, setSelectedScreenScope] = useState<string>('all'); // 'all' | 'main' | 'livestream'
  const [assignScope, setAssignScope] = useState<'all-slides' | 'current-slide'>('all-slides');

  // Slide picker output target
  const [slideOutputTarget, setSlideOutputTarget] = useState<string>('all');

  // Sync templates from IndexedDB
  useEffect(() => {
    if (isOpen) {
      getStoredTemplates().then(loaded => {
        setTemplates(loaded);
      });
      if (initialEditTemplate) {
        setEditingTemplate(initialEditTemplate);
      }
    }
  }, [isOpen, initialEditTemplate]);

  useEffect(() => {
    if (availableSongs.length > 0 && !selectedSongId) {
      setSelectedSongId(availableSongs[0].id);
    }
  }, [availableSongs, selectedSongId]);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'worship', label: 'Worship & Ambient' },
    { id: 'high-energy', label: 'High Energy & LED' },
    { id: 'broadcast', label: 'Broadcast & Stream' },
    { id: 'scripture', label: 'Scripture & Serif' },
    { id: 'modern', label: 'Modern Editorial' },
    { id: 'custom', label: 'My Custom' },
  ];

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : selectedCategory === 'custom'
      ? templates.filter(t => t.isCustom || t.category === 'custom')
      : templates.filter(t => t.category === selectedCategory);

  const handleSaveEditedTemplate = async (updated: PresentationTemplate) => {
    const updatedList = await saveTemplate(updated);
    setTemplates(updatedList);
    setEditingTemplate(null);
  };

  const handleSaveAsCopy = async (newCopy: PresentationTemplate) => {
    const updatedList = await saveTemplate(newCopy);
    setTemplates(updatedList);
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const updatedList = await deleteTemplate(templateId);
    setTemplates(updatedList);
    setEditingTemplate(null);
  };

  const handleCreateNewTemplate = () => {
    const blankTemplate: PresentationTemplate = {
      id: `custom-${Date.now()}`,
      name: 'Custom Preset',
      category: 'custom',
      tagline: 'Custom Designed Preset',
      description: 'Operator tailored custom motion and typography preset.',
      badge: 'Custom',
      isCustom: true,
      styles: {
        global: {
          fontFamily: 'Inter, sans-serif',
          fontWeight: '700',
          fontSize: '28px',
          color: '#ffffff',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          textAlign: 'center',
          textShadow: '0 8px 24px rgba(0,0,0,0.9)'
        },
        layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 }
      },
      animation: {
        type: 'blur-in',
        duration: 0.7,
        stagger: 0.04,
        easing: 'easeOut',
        ambientLoop: 'none'
      },
      backgroundPreview: 'linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)'
    };
    setEditingTemplate(blankTemplate);
  };

  // Execution of explicit assignment dialog
  const handleConfirmAssignment = () => {
    if (!assigningTemplate) return;

    if (assignTargetType === 'song') {
      const outputId = selectedScreenScope === 'all' ? undefined : selectedScreenScope;
      if (assignScope === 'all-slides') {
        onApplyToSong?.(assigningTemplate, selectedSongId, outputId);
      } else {
        onApplyToSlide?.(assigningTemplate, outputId);
      }
    } else {
      // Screen Output Default
      onApplyToOutput?.(assigningTemplate, selectedScreenOutputId);
    }

    setAssigningTemplate(null);
    onClose();
  };

  const inner = (
      <div className={variant === 'inline' ? 'flex flex-col h-full w-full overflow-hidden relative bg-[#09090b]' : 'bg-[#09090b] border border-white/10 rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl overflow-hidden relative'}>

        {/* If in Edit Mode, render TemplateEditor */}
        {editingTemplate ? (
          <TemplateEditor
            template={editingTemplate}
            onSave={handleSaveEditedTemplate}
            onSaveAsCopy={handleSaveAsCopy}
            onDelete={handleDeleteTemplate}
            onApplyToSlide={(t) => onApplyToSlide?.(t, slideOutputTarget === 'all' ? undefined : slideOutputTarget)}
            onApplyToSong={(t) => onApplyToSong?.(t, selectedSongId, slideOutputTarget === 'all' ? undefined : slideOutputTarget)}
            onClose={() => setEditingTemplate(null)}
          />
        ) : (
          <>
            {/* Top Header */}
            <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#09090b]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                    {mode === 'select-for-slide' 
                      ? `Select Template for ${targetSongTitle ? `"${targetSongTitle}"` : 'Slide'}`
                      : mode === 'select-for-output'
                        ? `Default Template for ${targetOutputName || 'Screen Output'}`
                        : 'Motion Templates Studio'}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
                      {filteredTemplates.length} Presets
                    </span>
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    {mode === 'select-for-slide'
                      ? targetSlideIndex !== undefined ? `Applying to Slide ${targetSlideIndex + 1}` : 'Choose visual style & animation for this slide'
                      : mode === 'select-for-output'
                        ? `Slides projected on ${targetOutputName || 'this screen'} will use this template by default`
                        : 'Visual presentation templates — edit to taste, or assign to songs and screen outputs'}
                  </p>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${selectedCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {mode === 'manage' && (
                  <button
                    onClick={handleCreateNewTemplate}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    New Template
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Sub-bar for 'select-for-slide' mode: Target Screen Selector */}
            {mode === 'select-for-slide' && availableOutputs.length > 0 && (
              <div className="h-10 px-6 bg-[#0c0c0e] border-b border-white/5 flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-medium">Screen Target:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSlideOutputTarget('all')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                      slideOutputTarget === 'all'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    All Screens
                  </button>
                  {availableOutputs.map(out => (
                    <button
                      key={out.id}
                      onClick={() => setSlideOutputTarget(out.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        slideOutputTarget === out.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-neutral-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {out.name} Only
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pure Thumbnail Grid with Dedicated Action Bar Below */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#09090b]">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTemplates.map(template => {
                  const isSelected = activeTemplateId === template.id;
                  const isHovered = hoveredCardId === template.id;

                  return (
                    <div
                      key={template.id}
                      className={`group bg-[#121214] rounded-xl overflow-hidden flex flex-col border transition-all duration-200 select-none ${isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/20'
                        : 'border-white/10 hover:border-white/30 hover:shadow-xl hover:shadow-black/60'
                        }`}
                      onMouseEnter={() => {
                        setHoveredCardId(template.id);
                        setPreviewKey(k => k + 1);
                      }}
                      onMouseLeave={() => setHoveredCardId(null)}
                    >
                      {/* The Live Slide Preview (Full 16:9 Canvas) — 100% Unobstructed */}
                      <div
                        className="aspect-video w-full relative flex items-center justify-center overflow-hidden cursor-pointer p-3.5"
                        style={{ background: template.backgroundPreview || '#09090b' }}
                        onClick={() => {
                          if (mode === 'select-for-slide') {
                            onApplyToSlide?.(template, slideOutputTarget === 'all' ? undefined : slideOutputTarget);
                            onClose();
                          } else if (mode === 'select-for-output') {
                            onApplyToOutput?.(template, targetOutputId);
                            onClose();
                          } else {
                            setEditingTemplate(template);
                          }
                        }}
                        title={mode === 'select-for-slide' ? 'Click to apply to slide' : 'Click to edit in studio'}
                      >
                        <FixedStage
                          key={isHovered ? `hover-${previewKey}` : 'static'}
                          className="w-full h-full pointer-events-none"
                        >
                          <TemplateSample template={template} lyrics={"AMAZING GRACE HOW SWEET\nTHE SOUND THAT SAVED A WRETCH"} />
                        </FixedStage>

                        {/* Active Slide Indicator */}
                        {isSelected && (
                          <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-md pointer-events-none">
                            <Check size={10} /> Active
                          </div>
                        )}

                        {/* Subtle Border Glow on Hover */}
                        <div className="absolute inset-0 ring-1 ring-inset ring-white/5 group-hover:ring-blue-500/40 transition-all pointer-events-none rounded-t-xl" />
                      </div>

                      {/* Clean Action Bar (Below Thumbnail — Never Covers Preview) */}
                      <div className="px-3 py-2 bg-[#0d0d10] border-t border-white/5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-white truncate" title={template.name}>
                            {template.name}
                          </span>
                          {template.badge && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-400/20 shrink-0">
                              {template.badge}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* CONTEXT 1: SLIDE SELECTION MODE (From Song Editor) */}
                          {mode === 'select-for-slide' && (
                            <>
                              <button
                                onClick={() => {
                                  onApplyToSlide?.(template, slideOutputTarget === 'all' ? undefined : slideOutputTarget);
                                  onClose();
                                }}
                                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                                title="Apply to this slide"
                              >
                                <Check size={11} />
                                Slide
                              </button>

                              <button
                                onClick={() => {
                                  onApplyToSong?.(template, undefined, slideOutputTarget === 'all' ? undefined : slideOutputTarget);
                                  onClose();
                                }}
                                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold transition-all border border-white/10 flex items-center gap-1 cursor-pointer"
                                title="Apply to all slides in this song"
                              >
                                <Layers size={10} />
                                Song
                              </button>
                            </>
                          )}

                          {/* CONTEXT 2: OUTPUT SELECTION MODE (From Output Settings) */}
                          {mode === 'select-for-output' && (
                            <button
                              onClick={() => {
                                onApplyToOutput?.(template, targetOutputId);
                                onClose();
                              }}
                              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                              title={`Set as default template for ${targetOutputName || 'this screen'}`}
                            >
                              <Check size={11} />
                              Set as Default
                            </button>
                          )}

                          {/* CONTEXT 3: MANAGE MODE (From Navigation Dock) */}
                          {mode === 'manage' && (
                            <button
                              onClick={() => setAssigningTemplate(template)}
                              className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-white border border-blue-500/30 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="Assign this template to a song or screen output"
                            >
                              <ArrowRight size={11} />
                              Apply to...
                            </button>
                          )}

                          {/* Edit in Studio is always available */}
                          <button
                            onClick={() => setEditingTemplate(template)}
                            className="p-1 rounded bg-white/5 hover:bg-blue-600/30 text-neutral-400 hover:text-blue-300 transition-colors cursor-pointer"
                            title="Edit template in studio"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Minimal Footer */}
            <div className="h-12 px-6 border-t border-white/5 bg-[#030303] flex items-center justify-between shrink-0 text-xs text-neutral-500">
              <span>
                {mode === 'select-for-slide'
                  ? 'Click any template to apply to your selected slide, or click Song to apply across the entire song.'
                  : mode === 'select-for-output'
                    ? 'Click any template to set it as the baseline default theme for this screen output.'
                    : 'Templates Studio: Edit and customize templates, or click "Apply to..." to assign to a specific song or screen.'}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* EXPLICIT TARGET ASSIGNMENT DIALOG (For 'manage' mode) */}
        {assigningTemplate && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-150">
            <div className="bg-[#121214] border border-white/15 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-5">
              
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-400" />
                  <h3 className="text-sm font-bold text-white">
                    Apply "{assigningTemplate.name}"
                  </h3>
                </div>
                <button
                  onClick={() => setAssigningTemplate(null)}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Step 1: Destination Type (Song vs Screen Output) */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                  Where do you want to apply this template?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignTargetType('song')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      assignTargetType === 'song'
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Music size={13} className="text-blue-400" />
                      A Song
                    </div>
                    <span className="text-[10px] text-neutral-500">Apply to a song in your library</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignTargetType('output')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      assignTargetType === 'output'
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-black/30 border-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Tv size={13} className="text-blue-400" />
                      Screen Default
                    </div>
                    <span className="text-[10px] text-neutral-500">Set as baseline for an output</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Details depending on type */}
              {assignTargetType === 'song' ? (
                <div className="space-y-4 bg-black/40 p-4 rounded-xl border border-white/5">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                      Select Song:
                    </label>
                    {availableSongs.length > 0 ? (
                      <select
                        value={selectedSongId}
                        onChange={(e) => setSelectedSongId(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/15 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {availableSongs.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.title || 'Untitled Song'} ({s.slides?.length || 0} slides)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-neutral-500 italic">No songs found in library</p>
                    )}
                  </div>

                  {availableOutputs.length > 0 && (
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                        Target Screen:
                      </label>
                      <select
                        value={selectedScreenScope}
                        onChange={(e) => setSelectedScreenScope(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/15 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                      >
                        <option value="all">All Screens</option>
                        {availableOutputs.map(out => (
                          <option key={out.id} value={out.id}>
                            {out.name} Only
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                      Apply Scope:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAssignScope('all-slides')}
                        className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                          assignScope === 'all-slides'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-white/5 text-neutral-400 border-white/5'
                        }`}
                      >
                        All Slides
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignScope('current-slide')}
                        className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                          assignScope === 'current-slide'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-white/5 text-neutral-400 border-white/5'
                        }`}
                      >
                        Active Slide Only
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 bg-black/40 p-4 rounded-xl border border-white/5">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block mb-1.5">
                      Select Screen Output:
                    </label>
                    <select
                      value={selectedScreenOutputId}
                      onChange={(e) => setSelectedScreenOutputId(e.target.value)}
                      className="w-full bg-[#18181b] border border-white/15 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                    >
                      {availableOutputs.map(out => (
                        <option key={out.id} value={out.id}>
                          {out.name} ({out.id === 'main' ? 'Primary Stage' : out.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Setting this will make <strong>"{assigningTemplate.name}"</strong> the default layout, font, and motion style for all presentations projected onto this screen.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setAssigningTemplate(null)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAssignment}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <Check size={13} />
                  Confirm Apply
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
  );

  if (variant === 'inline') return inner;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 lg:p-8 animate-in fade-in duration-200">
      {inner}
    </div>
  );
}

// ─── Compact inline template grid (bottom panel Templates tab) ────────────────

export interface InlineTemplateGridProps {
  templates: PresentationTemplate[];
  category: string;
  onCategoryChange: (c: string) => void;
  onLoadTemplates: () => void;
  onEdit: (t: PresentationTemplate) => void;
  onApplyToSong?: (t: PresentationTemplate, songId?: string, outputId?: string) => void;
  activeSongId?: string;
}

const INLINE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'worship', label: 'Worship' },
  { id: 'high-energy', label: 'High Energy' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'declaration', label: 'Declarations' },
  { id: 'modern', label: 'Modern' },
  { id: 'custom', label: 'Custom' },
];

export function InlineTemplateGrid({
  templates,
  category,
  onCategoryChange,
  onLoadTemplates,
  onApplyToSong,
  activeSongId,
}: InlineTemplateGridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState<PresentationTemplate | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [packageDialog, setPackageDialog] = useState<'import' | 'export' | null>(null);

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; template: PresentationTemplate } | null>(null);
  // Inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { onLoadTemplates(); }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [ctxMenu]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.select(), 30);
  }, [renamingId]);

  const reload = () => getStoredTemplates().then(list => { /* parent state updated via onLoadTemplates */ onLoadTemplates(); });

  const handleApply = (t: PresentationTemplate) => {
    if (!onApplyToSong || !activeSongId) return;
    onApplyToSong(t, activeSongId);
    setAppliedId(t.id);
    setTimeout(() => setAppliedId(null), 1400);
  };

  const handleSave = async (updated: PresentationTemplate) => {
    await saveTemplate(updated);
    reload();
    setEditingTemplate(null);
  };

  const handleSaveAsCopy = async (copy: PresentationTemplate) => {
    await saveTemplate(copy);
    reload();
    setEditingTemplate(null);
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    reload();
    setEditingTemplate(null);
    setCtxMenu(null);
  };

  const handleRenameCommit = async (t: PresentationTemplate) => {
    const name = renameValue.trim();
    if (name && name !== t.name) {
      await saveTemplate({ ...t, name });
      reload();
    }
    setRenamingId(null);
  };

  const handleNewTemplate = () => {
    const blank: PresentationTemplate = {
      id: `custom-${Date.now()}`,
      name: 'Custom Preset',
      category: 'custom',
      tagline: 'Custom Designed Preset',
      description: 'Operator tailored custom motion and typography preset.',
      badge: 'Custom',
      isCustom: true,
      styles: {
        global: { fontFamily: 'Inter, sans-serif', fontWeight: '700', fontSize: '28px', color: '#ffffff', letterSpacing: '0.02em', textTransform: 'uppercase', textAlign: 'center', textShadow: '0 8px 24px rgba(0,0,0,0.9)' },
        layout: { x: 0.08, y: 0.15, width: 0.84, height: 0.7 }
      },
      animation: { type: 'blur-in', duration: 0.7, stagger: 0.04, easing: 'easeOut', ambientLoop: 'none' },
      backgroundPreview: 'linear-gradient(135deg, #09090b 0%, #1e1b4b 100%)'
    };
    setEditingTemplate(blank);
  };

  const filtered = category === 'all'
    ? templates
    : category === 'custom'
      ? templates.filter(t => t.isCustom || t.category === 'custom')
      : templates.filter(t => t.category === category);

  if (editingTemplate) {
    return (
      <div className="flex-1 min-h-0 bg-[#09090b] flex flex-col overflow-hidden">
        <TemplateEditor
          template={editingTemplate}
          onSave={handleSave}
          onSaveAsCopy={handleSaveAsCopy}
          onDelete={handleDelete}
          onApplyToSlide={() => {}}
          onApplyToSong={(t) => { handleApply(t); setEditingTemplate(null); }}
          onClose={() => setEditingTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 bg-[#0c0c11] flex flex-col overflow-hidden">
      {/* Category strip */}
      <div className="h-8 px-3 flex items-center gap-1 border-b border-[#1e1e2a] shrink-0 overflow-x-auto">
        {INLINE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap transition-all ${
              category === cat.id ? 'bg-pink-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {cat.label}
          </button>
        ))}
        <div className="ml-auto shrink-0 text-[10px] text-neutral-600">{filtered.length} templates</div>
        <button type="button" onClick={() => setPackageDialog('import')} className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold text-neutral-300 hover:text-white hover:bg-white/5" title="Install a template package (.fstemplates)">Import</button>
        <button type="button" onClick={() => setPackageDialog('export')} className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold text-neutral-300 hover:text-white hover:bg-white/5" title="Save templates as a package other FlowShow users can install">Export</button>
      </div>
      {packageDialog === 'export' && <ExportTemplatesDialog templates={templates} onClose={() => setPackageDialog(null)} />}
      {packageDialog === 'import' && <ImportTemplatesDialog onClose={() => setPackageDialog(null)} onInstalled={() => onLoadTemplates()} />}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar" onClick={() => setCtxMenu(null)}>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {filtered.map(t => {
            const isHovered = hoveredId === t.id;
            const isApplied = appliedId === t.id;
            const isRenaming = renamingId === t.id;
            return (
              <div
                key={t.id}
                className={`group flex flex-col rounded-lg overflow-hidden border transition-all duration-150 cursor-pointer bg-[#121218] ${
                  isApplied ? 'border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.4)]' : 'border-white/8 hover:border-pink-500/60'
                }`}
                onMouseEnter={() => { setHoveredId(t.id); setPreviewKey(k => k + 1); }}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleApply(t)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, template: t });
                }}
              >
                {/* 16:9 preview */}
                <div
                  className="aspect-video w-full relative overflow-hidden"
                  style={{ background: t.backgroundPreview || '#09090b' }}
                >
                  <FixedStage
                    key={isHovered ? `h-${previewKey}-${t.id}` : `s-${t.id}`}
                    className="w-full h-full pointer-events-none"
                  >
                    <TemplateSample template={t} />
                  </FixedStage>
                  {/* Applied flash */}
                  {isApplied && (
                    <div className="absolute inset-0 flex items-center justify-center bg-pink-600/30 backdrop-blur-[1px] pointer-events-none">
                      <Check size={18} className="text-white drop-shadow-lg" />
                    </div>
                  )}
                </div>
                {/* Name bar */}
                <div className="px-2 py-1 flex items-center bg-[#0e0e14]" onClick={(e) => e.stopPropagation()}>
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameCommit(t);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={() => handleRenameCommit(t)}
                      className="flex-1 bg-transparent border-b border-pink-500 text-[10px] text-white outline-none py-0.5"
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-neutral-300 truncate flex-1 leading-tight">{t.name}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* New template button */}
          <div
            className="flex flex-col items-center justify-center aspect-video rounded-lg border border-dashed border-white/15 hover:border-pink-500/40 text-neutral-500 hover:text-pink-400 transition-all cursor-pointer bg-[#0e0e14] text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); handleNewTemplate(); }}
          >
            <Plus size={16} />
            <span>New</span>
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="fixed z-[200] bg-[#1a1a24] border border-white/10 rounded-lg shadow-2xl py-1 w-44 text-xs"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/5 text-neutral-200 hover:text-white flex items-center gap-2 transition-colors"
            onClick={() => { handleApply(ctxMenu.template); setCtxMenu(null); }}
          >
            <Check size={12} className="text-pink-400" /> Apply to Song
          </button>
          <div className="h-px bg-white/5 my-1" />
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/5 text-neutral-200 hover:text-white flex items-center gap-2 transition-colors"
            onClick={() => { setEditingTemplate(ctxMenu.template); setCtxMenu(null); }}
          >
            <Pencil size={12} className="text-blue-400" /> Edit Template
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/5 text-neutral-200 hover:text-white flex items-center gap-2 transition-colors"
            onClick={() => { setRenameValue(ctxMenu.template.name); setRenamingId(ctxMenu.template.id); setCtxMenu(null); }}
          >
            <Type size={12} className="text-neutral-400" /> Rename
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-white/5 text-neutral-200 hover:text-white flex items-center gap-2 transition-colors"
            onClick={async () => {
              const copy: PresentationTemplate = { ...ctxMenu.template, id: `custom-${Date.now()}`, name: `${ctxMenu.template.name} (Copy)`, badge: 'Custom', isCustom: true };
              await saveTemplate(copy);
              reload();
              setCtxMenu(null);
            }}
          >
            <Copy size={12} className="text-neutral-400" /> Save as Copy
          </button>
          {(ctxMenu.template.isCustom) && (
            <>
              <div className="h-px bg-white/5 my-1" />
              <button
                className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2 transition-colors"
                onClick={() => handleDelete(ctxMenu.template.id)}
              >
                <Trash size={12} /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A template's look on sample words: a verse with its reference for scripture templates, otherwise lyrics */
function TemplateSample({ template, lyrics = "AMAZING GRACE\nHOW SWEET THE SOUND" }: { template: PresentationTemplate; lyrics?: string }) {
  const { global, lines, layout, sourceGlobal, sourceLayout } = template.styles;
  if (template.category === 'scripture') {
    const verse = SCRIPTURE_SAMPLES.find(s => s.id === 'typical') || SCRIPTURE_SAMPLES[0];
    return (
      <SmartTextLayout
        text={verse.text}
        source={verse.source}
        type="scripture"
        animation={template.animation}
        styleOverrides={{ global, lines, layout, sourceGlobal, sourceLayout }}
        className="w-full h-full"
      />
    );
  }
  return <SmartTextLayout text={lyrics} animation={template.animation} styleOverrides={{ global, lines, layout }} className="w-full h-full" />;
}
