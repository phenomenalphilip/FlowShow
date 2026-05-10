import React, { useState } from 'react';
import useMeasure from 'react-use-measure';
import { Rnd } from 'react-rnd';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { FixedStage } from './FixedStage';
import { SmartTextLayout } from './SmartTextLayout';
import { SlideDefinition } from '../App';

export interface OutputStyleConfig {
  global?: React.CSSProperties & { '--font-scale'?: number };
  layout?: { x: number; y: number; width: number; height: number };
}

interface OutputStyleEditorProps {
  initialStyle: OutputStyleConfig;
  type: 'lyrics' | 'scripture';
  outputName: string;
  onSave: (newStyle: OutputStyleConfig) => void;
  onCancel: () => void;
}

export function OutputStyleEditor({ initialStyle, type, outputName, onSave, onCancel }: OutputStyleEditorProps) {
  const [style, setStyle] = useState<OutputStyleConfig>(initialStyle);
  
  const sampleText = type === 'lyrics' 
    ? "Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see"
    : "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.\nJohn 3:16";

  const updateStyle = (newStyles: React.CSSProperties | { layout: any }) => {
    setStyle(prev => {
      const next = { ...prev };
      if ('layout' in newStyles) {
        next.layout = newStyles.layout;
      } else {
        next.global = { ...(next.global || {}), ...newStyles };
      }
      return next;
    });
  };

  const toggleStyle = (prop: keyof React.CSSProperties, valueOn: string | number, valueOff: string | number) => {
    const currentState = style.global?.[prop] || valueOff;
    const newValue = currentState === valueOn ? valueOff : valueOn;
    updateStyle({ [prop]: newValue });
  };

  return (
    <div className="fixed inset-0 z-[60] flex h-screen bg-black/90 backdrop-blur-md text-white">
       <div className="flex-1 flex flex-col h-full bg-[#030303] relative border-r border-white/5">
         <div className="h-16 px-6 border-b border-white/5 flex justify-between items-center bg-[#09090B] shadow-sm relative z-10">
            <div>
               <h2 className="text-lg font-bold tracking-tight">Edit {type === 'lyrics' ? 'Lyrics' : 'Bible'} Style</h2>
               <p className="text-xs text-neutral-500 font-medium mt-0.5">Editing override for: {outputName}</p>
            </div>
            <div className="flex gap-3">
               <button onClick={onCancel} className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-all">Cancel</button>
               <button onClick={() => onSave(style)} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">Save Changes</button>
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-12 flex flex-col items-center justify-center gap-8 custom-scrollbar relative">
            <div className="text-neutral-500 text-sm font-medium absolute top-8 left-1/2 -translate-x-1/2 bg-white/5 py-1.5 px-4 rounded-full backdrop-blur-sm border border-white/10">Drag to move, drag edges to resize workspace.</div>
            <FixedStage className="w-full max-w-5xl aspect-video rounded-xl bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-2 border-white/5 workspace-bg relative overflow-hidden">
             {(scale) => (
               <div className="w-full h-full relative workspace-bg">
                 <Rnd
                   bounds="parent"
                   scale={scale}
                   dragHandleClassName="drag-handle"
                   position={{
                     x: (style.layout?.x ?? 0.05) * 1920,
                     y: (style.layout?.y ?? 0.05) * 1080
                   }}
                   size={{
                     width: (style.layout?.width ?? 0.9) * 1920,
                     height: (style.layout?.height ?? 0.9) * 1080
                   }}
                   onDragStop={(e, d) => {
                      updateStyle({ 
                        layout: {
                          ...style.layout,
                          x: d.x / 1920,
                          y: d.y / 1080,
                          width: style.layout?.width ?? 0.9,
                          height: style.layout?.height ?? 0.9
                        } 
                      });
                   }}
                   onResizeStop={(e, direction, refElem, delta, position) => {
                      updateStyle({ 
                        layout: {
                          x: position.x / 1920,
                          y: position.y / 1080,
                          width: refElem.offsetWidth / 1920,
                          height: refElem.offsetHeight / 1080
                        } 
                      });
                   }}
                   className="border-[3px] border-blue-500/50 hover:border-blue-500 transition-colors group shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-white/5 backdrop-blur-sm"
                 >
                    <div className="w-full h-full drag-handle cursor-move flex flex-col justify-center">
                        <SmartTextLayout
                           className="w-full h-full pointer-events-none"
                           text={sampleText}
                           type={type}
                           styleOverrides={{
                             global: style.global,
                             layout: { x: 0, y: 0, width: 1, height: 1 } // Position inside Rnd is 100% since Rnd is the container
                           }}
                           disableAbsoluteLayout={false}
                        />
                    </div>
                 </Rnd>
               </div>
             )}
            </FixedStage>
         </div>
       </div>

       {/* Right Panel: Formatting */}
       <div className="w-80 bg-[#09090B] h-full flex flex-col shrink-0 shadow-2xl relative z-20">
           <div className="h-16 px-6 border-b border-white/5 bg-[#09090B] flex items-center shrink-0">
              <h2 className="text-sm font-bold tracking-wide text-white">Format & Layout</h2>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Text Style */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Style</label>
                <div className="flex gap-2">
                  <button onClick={() => toggleStyle('fontWeight', 'bold', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.fontWeight === 'bold' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Bold size={16} />
                  </button>
                  <button onClick={() => toggleStyle('fontStyle', 'italic', 'normal')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.fontStyle === 'italic' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Italic size={16} />
                  </button>
                  <button onClick={() => toggleStyle('textDecoration', 'underline', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textDecoration === 'underline' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <UnderlineIcon size={16} />
                  </button>
                  <button onClick={() => toggleStyle('textDecoration', 'line-through', 'none')} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textDecoration === 'line-through' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <Strikethrough size={16} />
                  </button>
                </div>
              </div>
              
              {/* Alignment */}
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Alignment</label>
                <div className="flex gap-2">
                  <button onClick={() => updateStyle({ textAlign: 'left' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textAlign === 'left' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignLeft size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'center' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textAlign === 'center' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignCenter size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'right' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textAlign === 'right' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignRight size={16} />
                  </button>
                  <button onClick={() => updateStyle({ textAlign: 'justify' })} className={`flex-1 py-3 hover:bg-white/10 rounded-lg flex justify-center items-center transition-all ${style.global?.textAlign === 'justify' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-white/5 text-neutral-400 border border-transparent'}`}>
                     <AlignJustify size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Letter Spacing</label>
                <input 
                  type="text" 
                  value={style.global?.letterSpacing || 'normal'}
                  onChange={(e) => updateStyle({ letterSpacing: e.target.value })}
                  placeholder="e.g. 0.05em or 2px"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Color</label>
                <div className="flex flex-wrap gap-3">
                  {['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#FFD700', '#a3a3a3'].map(color => (
                     <button 
                       key={color}
                       onClick={() => updateStyle({ color })}
                       className="w-9 h-9 rounded-full shadow-inner hover:scale-110 transition-transform ring-2 ring-transparent focus:ring-blue-500 hover:ring-white/20"
                       style={{ backgroundColor: color }}
                     />
                  ))}
                  <div className="w-full flex items-center gap-3 mt-3 bg-white/5 p-2 rounded-lg border border-white/10">
                    <input 
                      type="color" 
                      className="w-10 h-10 rounded cursor-pointer border-none bg-transparent"
                      value={style.global?.color || '#ffffff'}
                      onChange={(e) => updateStyle({ color: e.target.value })}
                    />
                    <span className="text-sm font-medium text-neutral-300 flex-1">Custom Color</span>
                  </div>
                </div>
              </div>
              
              {/* Font Family */}
              <div className="space-y-3">
                 <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font Family</label>
                 <select 
                   className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                   value={style.global?.fontFamily || ''}
                   onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                 >
                    <option value="">Default (From Theme)</option>
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Space Grotesk, sans-serif">Space Grotesk</option>
                    <option value="Outfit, sans-serif">Outfit</option>
                    <option value="Playfair Display, serif">Playfair Display</option>
                    <option value="JetBrains Mono, monospace">JetBrains Mono</option>
                 </select>
              </div>
              
              <div className="space-y-3">
                 <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font Size</label>
                 <div className="flex items-center gap-3">
                   <input 
                     type="number" 
                     min="10" max="400" 
                     value={parseInt(
                        (style.global?.fontSize as string) || (type === 'scripture' ? '90' : '110')
                     )}
                     className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-blue-500 transition-all font-medium"
                     onChange={(e) => updateStyle({ fontSize: `${e.target.value}px` })}
                   />
                   <span className="text-sm font-bold text-neutral-500">px</span>
                 </div>
                 <p className="text-xs text-neutral-500">Note: Dynamic sizing might adjust actual preview size</p>
              </div>
              
              <div className="pt-6 border-t border-white/5 space-y-3">
                <button 
                  onClick={() => setStyle({ layout: style.layout })}
                  className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-sm font-bold rounded-lg transition-all text-red-400"
                >
                   Clear Text Formatting
                </button>
                <button 
                  onClick={() => setStyle({ global: style.global })}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold rounded-lg transition-all text-neutral-300"
                >
                   Reset Layout Box
                </button>
              </div>
           </div>
       </div>
    </div>
  );
}
