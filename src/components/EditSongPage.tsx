import React, { useState, useEffect, useMemo } from 'react';
import useMeasure from 'react-use-measure';
import { Rnd } from 'react-rnd';
import { SlideDefinition } from '../App';
import { SmartTextLayout } from './SmartTextLayout';
import { tokenize, Token } from '../lib/TokenEngine';
import { X, Copy, Trash, EyeOff, Eye, Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';

interface EditSongPageProps {
  song: {
    id: string;
    title: string;
    slides: SlideDefinition[];
  };
  initialSlideIndex?: number;
  onSave: (songId: string, updatedSlides: SlideDefinition[]) => void;
  onClose: () => void;
}

export function EditSongPage({ song, initialSlideIndex = 0, onSave, onClose }: EditSongPageProps) {
  const [slides, setSlides] = useState<SlideDefinition[]>(song.slides);
  
  const [selectedSlideIndices, setSelectedSlideIndices] = useState<number[]>([initialSlideIndex]);
  const [selectedWordIndices, setSelectedWordIndices] = useState<number[]>([]);
  const [isEditingText, setIsEditingText] = useState(false);
  const [previewRef, bounds] = useMeasure();
  
  // Ref for the left panel container to handle Ctrl+A
  const leftPanelRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if focus is in a text area or input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
         return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedSlideIndices(slides.map((_, i) => i));
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length]);
  
  const activeSlideIndex = selectedSlideIndices[0] ?? 0;
  const activeSlide = slides[activeSlideIndex] as SlideDefinition | undefined;

  const updateSlideStyle = (newStyles: React.CSSProperties | { layout: any }) => {
    setSlides(prev => {
      const next = [...prev];
      selectedSlideIndices.forEach(slideIdx => {
        const slide = { ...next[slideIdx] };
        if (!slide.styleOverrides) {
           slide.styleOverrides = {};
        } else {
           slide.styleOverrides = { ...slide.styleOverrides };
        }
        
        if ('layout' in newStyles) {
           slide.styleOverrides.layout = newStyles.layout;
        } else {
            if (selectedWordIndices.length > 0) {
               // Apply to specific words
               slide.styleOverrides.words = { ...(slide.styleOverrides.words || {}) };
               selectedWordIndices.forEach(wordIdx => {
                 slide.styleOverrides!.words![wordIdx] = {
                   ...slide.styleOverrides!.words![wordIdx],
                   ...newStyles
                 };
               });
            } else {
               // Apply globally to the slide
               slide.styleOverrides.global = {
                 ...(slide.styleOverrides.global || {}),
                 ...newStyles
               };
            }
        }
        next[slideIdx] = slide;
      });
      return next;
    });
  };
  
  const toggleStyle = (prop: keyof React.CSSProperties, valueOn: string | number, valueOff: string | number) => {
     // Determine the current state based on the first selected slide/word
     if (!activeSlide) return;
     let currentState = valueOff;
     
     if (selectedWordIndices.length > 0) {
        const wordIdx = selectedWordIndices[0];
        const val = activeSlide.styleOverrides?.words?.[wordIdx]?.[prop];
        if (val === valueOn) currentState = valueOn;
        // else off
     } else {
        const val = activeSlide.styleOverrides?.global?.[prop];
        if (val === valueOn) currentState = valueOn;
     }

     const newValue = currentState === valueOn ? valueOff : valueOn;
     updateSlideStyle({ [prop]: newValue });
  };

  const handleDuplicate = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      const copy = { ...next[idx], id: `slide-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` };
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleDelete = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      if (next.length > 1) {
        next.splice(idx, 1);
      } else {
        next[idx] = { ...next[idx], text: '' };
      }
      return next;
    });
    if (selectedSlideIndices.includes(idx)) {
       setSelectedSlideIndices([Math.max(0, idx - 1)]);
    }
  };

  const toggleDisable = (idx: number) => {
    setSlides(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], disabled: !next[idx].disabled };
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex h-screen bg-[#0a0a0a] text-white">
      {/* Left Panel: Slide List */}
      <div 
         ref={leftPanelRef}
         tabIndex={0}
         className="w-64 border-r border-neutral-800 flex flex-col h-full bg-[#111] shrink-0 outline-none"
      >
        <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-[#1a1a1a]">
           <h2 className="text-sm font-semibold text-neutral-300">Slides</h2>
           <span className="text-xs text-neutral-500">Ctrl+A to select all</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
           {slides.map((slide, idx) => {
              const isSelected = selectedSlideIndices.includes(idx);
              return (
                 <div 
                   key={slide.id}
                   onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                         setSelectedSlideIndices(prev => 
                           prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                         );
                      } else if (e.shiftKey && selectedSlideIndices.length > 0) {
                         const start = Math.min(selectedSlideIndices[0], idx);
                         const end = Math.max(selectedSlideIndices[0], idx);
                         const newSelection = [];
                         for (let i = start; i <= end; i++) newSelection.push(i);
                         setSelectedSlideIndices(newSelection);
                      } else {
                         setSelectedSlideIndices([idx]);
                         setSelectedWordIndices([]);
                      }
                   }}
                   className={`
                     p-2 rounded cursor-pointer border transition-colors group relative select-none
                     ${isSelected ? 'bg-blue-600/20 border-blue-500' : 'bg-neutral-800 border-neutral-700 hover:border-neutral-500'}
                     ${slide.disabled ? 'opacity-40' : 'opacity-100'}
                   `}
                 >
                   <div className="text-xs text-neutral-500 mb-1 font-mono">{idx + 1}</div>
                   <div className="text-sm font-medium line-clamp-3 whitespace-pre-wrap leading-tight text-neutral-300 pointer-events-none">
                     {slide.text}
                   </div>
                   
                   {/* Context Actions */}
                   <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center bg-black/80 rounded overflow-hidden">
                     <button onClick={(e) => { e.stopPropagation(); toggleDisable(idx); }} className="p-1 hover:bg-white/20 text-neutral-400" title="Toggle Disable">
                        {slide.disabled ? <Eye size={12} /> : <EyeOff size={12} />}
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); handleDuplicate(idx); }} className="p-1 hover:bg-white/20 text-neutral-400" title="Duplicate">
                        <Copy size={12} />
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); handleDelete(idx); }} className="p-1 hover:bg-red-500/50 text-neutral-400" title="Delete">
                        <Trash size={12} />
                     </button>
                   </div>
                 </div>
              );
           })}
        </div>
      </div>
      
      {/* Middle Panel: active slide text editor + live preview */}
      <div className="flex-1 flex flex-col h-full bg-neutral-950 relative border-r border-neutral-800">
         <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-[#1a1a1a]">
            <h2 className="text-sm font-semibold">{song.title}</h2>
            <div className="flex gap-2">
               <button onClick={onClose} className="px-4 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors">Cancel</button>
               <button onClick={() => { onSave(song.id, slides); onClose(); }} className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">Save Changes</button>
            </div>
         </div>
         
         {activeSlide ? (
           <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8 custom-scrollbar">
              <div 
                 ref={previewRef}
                 className={`w-full max-w-4xl aspect-video border border-neutral-800 rounded-lg bg-[#0a0a0a] shadow-xl relative overflow-hidden ${isEditingText ? 'ring-2 ring-blue-500' : ''}`}
                 onClick={() => {
                    if (!isEditingText) setSelectedWordIndices([]);
                 }}
                 onDoubleClick={() => setIsEditingText(true)}
              >
                 {bounds.width > 0 && (
                   <Rnd
                     bounds="parent"
                     dragHandleClassName="drag-handle"
                     position={{
                       x: (activeSlide.styleOverrides?.layout?.x ?? 0) * bounds.width,
                       y: (activeSlide.styleOverrides?.layout?.y ?? 0) * bounds.height
                     }}
                     size={{
                       width: (activeSlide.styleOverrides?.layout?.width ?? 1) * bounds.width,
                       height: (activeSlide.styleOverrides?.layout?.height ?? 1) * bounds.height
                     }}
                     onDragStop={(e, d) => {
                        updateSlideStyle({ 
                          layout: {
                            ...activeSlide.styleOverrides?.layout,
                            x: d.x / bounds.width,
                            y: d.y / bounds.height,
                            width: activeSlide.styleOverrides?.layout?.width ?? 1,
                            height: activeSlide.styleOverrides?.layout?.height ?? 1
                          } 
                        });
                     }}
                     onResizeStop={(e, direction, refElem, delta, position) => {
                        updateSlideStyle({ 
                          layout: {
                            x: position.x / bounds.width,
                            y: position.y / bounds.height,
                            width: refElem.offsetWidth / bounds.width,
                            height: refElem.offsetHeight / bounds.height
                          } 
                        });
                     }}
                     className={`${isEditingText ? "border border-blue-500 bg-white/5" : "border border-transparent hover:border-neutral-500"} transition-colors`}
                   >
                      <div className="w-full h-full drag-handle cursor-move flex flex-col justify-center">
                        {isEditingText ? (
                          <textarea
  autoFocus
  className="
    w-full h-full
    bg-transparent
    resize-none
    outline-none
    border-none
    custom-scrollbar
    font-display
  "
  style={{
    ...activeSlide.styleOverrides?.global,
    fontSize:
      activeSlide.styleOverrides?.global?.fontSize ||
      '2rem',
    lineHeight:
      activeSlide.styleOverrides?.global?.lineHeight ||
      1.3,
    textAlign:
      (activeSlide.styleOverrides?.global
        ?.textAlign as any) || 'left'
  }}
  value={activeSlide.text}
  onChange={(e) => {
    setSlides(prev => {
      const next = [...prev];
      next[activeSlideIndex] = {
        ...next[activeSlideIndex],
        text: e.target.value
      };
      return next;
    });
  }}
  onBlur={() => setIsEditingText(false)}
  onKeyDown={(e) => {
    if (e.key === 'Escape') {
      setIsEditingText(false);
    }
  }}
/>
                        ) : (
                          <SmartTextLayout
                             className="w-full h-full"
                             text={activeSlide.text}
                             source={activeSlide.source}
                             type={activeSlide.type}
                             styleOverrides={{ ...activeSlide.styleOverrides, layout: undefined }}
                             selectedWordIndices={selectedWordIndices}
                             onWordClick={(idx, e) => {
                                if (e.ctrlKey || e.metaKey) {
                                   setSelectedWordIndices(prev => 
                                     prev.includes(idx) ? prev.filter(w => w !== idx) : [...prev, idx]
                                   );
                                } else {
                                   setSelectedWordIndices([idx]);
                                }
                             }}
                          />
                        )}
                      </div>
                   </Rnd>
                 )}
                  
                  {!isEditingText && (
                     <div className="absolute top-2 right-2 flex gap-2 pointer-events-none">
                        <button 
                           onClick={(e) => { e.stopPropagation(); setIsEditingText(true); }}
                           className="text-xs bg-black/50 hover:bg-black p-1.5 px-3 rounded text-neutral-400 hover:text-white transition-colors pointer-events-auto"
                        >
                           Edit Text
                        </button>
                     </div>
                  )}
              </div>
           </div>
         ) : (
           <div className="flex-1 flex items-center justify-center text-neutral-500">
             No slide selected
           </div>
         )}
      </div>
      
      {/* Right Panel: Formatting */}
      <div className="w-72 bg-[#111] h-full flex flex-col shrink-0">
          <div className="p-4 border-b border-neutral-800 bg-[#1a1a1a]">
             <h2 className="text-sm font-semibold text-neutral-300">Format</h2>
             <p className="text-xs text-neutral-500 mt-1">
               {selectedWordIndices.length > 0 
                 ? `${selectedWordIndices.length} word(s) selected` 
                 : selectedSlideIndices.length > 1 
                   ? `${selectedSlideIndices.length} slides selected` 
                   : 'Entire slide selected'}
             </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
             {/* Text Style */}
             <div className="space-y-3">
               <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Style</label>
               <div className="flex gap-2">
                 <button onClick={() => toggleStyle('fontWeight', 'bold', 'normal')} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <Bold size={16} />
                 </button>
                 <button onClick={() => toggleStyle('fontStyle', 'italic', 'normal')} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <Italic size={16} />
                 </button>
                 <button onClick={() => toggleStyle('textDecoration', 'underline', 'none')} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <UnderlineIcon size={16} />
                 </button>
                 <button onClick={() => toggleStyle('textDecoration', 'line-through', 'none')} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <Strikethrough size={16} />
                 </button>
               </div>
             </div>
             
             {/* Alignment */}
             <div className="space-y-3">
               <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Alignment</label>
               <div className="flex gap-2">
                 <button onClick={() => updateSlideStyle({ textAlign: 'left' })} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <AlignLeft size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'center' })} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <AlignCenter size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'right' })} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <AlignRight size={16} />
                 </button>
                 <button onClick={() => updateSlideStyle({ textAlign: 'justify' })} className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 rounded flex justify-center items-center transition-colors">
                    <AlignJustify size={16} />
                 </button>
               </div>
             </div>
             
             {/* Color */}
             <div className="space-y-3">
               <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Color</label>
               <div className="flex flex-wrap gap-2">
                 {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#FFD700', '#a3a3a3'].map(color => (
                    <button 
                      key={color}
                      onClick={() => updateSlideStyle({ color })}
                      className="w-8 h-8 rounded-full border border-neutral-700 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                    />
                 ))}
                 <div className="w-full flex items-center gap-2 mt-2">
                   <input 
                     type="color" 
                     className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer p-0"
                     onChange={(e) => updateSlideStyle({ color: e.target.value })}
                   />
                   <span className="text-xs text-neutral-400">Custom Color</span>
                 </div>
               </div>
             </div>
             
             {/* Font Family */}
             <div className="space-y-3">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Font Family</label>
                <select 
                  className="w-full bg-neutral-800 border-none rounded p-2 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
                  onChange={(e) => updateSlideStyle({ fontFamily: e.target.value })}
                >
                   <option value="">Default (From Theme)</option>
                   <option value="Inter, sans-serif">Inter</option>
                   <option value="Space Grotesk, sans-serif">Space Grotesk</option>
                   <option value="Outfit, sans-serif">Outfit</option>
                   <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                </select>
             </div>
             
             {/* Size Adjustments */}
             <div className="space-y-3">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Font Size (%)</label>
                <input 
                  type="range" 
                  min="50" max="200" defaultValue="100"
                  className="w-full accent-blue-500"
                  onChange={(e) => updateSlideStyle({ '--font-scale': parseInt(e.target.value) / 100 } as any)}
                />
             </div>
             
             <div className="pt-4 border-t border-neutral-800">
               <button 
                 onClick={() => {
                   // Clear selected styles
                   setSlides(prev => {
                     const next = [...prev];
                     selectedSlideIndices.forEach(slideIdx => {
                        const slide = { ...next[slideIdx] };
                        if (slide.styleOverrides) {
                           if (selectedWordIndices.length > 0) {
                              selectedWordIndices.forEach(w => {
                                 if (slide.styleOverrides!.words) delete slide.styleOverrides!.words[w];
                              });
                           } else {
                              slide.styleOverrides.global = {};
                           }
                        }
                        next[slideIdx] = slide;
                     });
                     return next;
                   });
                 }}
                 className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-sm rounded transition-colors text-neutral-300"
               >
                  Clear Formatting
               </button>
             </div>
          </div>
      </div>
    </div>
  );
}
