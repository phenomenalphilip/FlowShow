import React, { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { FolderPlus, Image as ImageIcon, Video, Trash, Folder, ChevronRight, ArrowUp } from 'lucide-react';

const MOCK_MEDIA = [
  { id: 'm1', url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?q=80&w=1000&auto=format&fit=crop', name: 'Blue Abstract', type: 'image' },
  { id: 'm2', url: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=1000&auto=format&fit=crop', name: 'Dark Particles', type: 'image' },
  { id: 'm3', url: 'https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=1000&auto=format&fit=crop', name: 'Space Stars', type: 'image' },
];

export type MediaItem = {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video';
  path?: string;
};

type VirtualDir = {
  name: string;
  children: Map<string, VirtualDir>;
  files: File[];
};

type DisplayItem = 
  | { kind: 'directory'; name: string; handle?: any; virtualDir?: VirtualDir }
  | { kind: 'file'; name: string; media: MediaItem };

const URL_CACHE = new Map<string, string>();
function getCachedObjectURL(id: string, file: File) {
    if (!URL_CACHE.has(id)) {
        URL_CACHE.set(id, URL.createObjectURL(file));
    }
    return URL_CACHE.get(id)!;
}

export function MediaLibrary({ onSelectBackground }: { onSelectBackground: (url: string, type: 'image' | 'video') => void }) {
   const [topLevelFolders, setTopLevelFolders] = useState<any[]>([]); // Native handles
   const [fallbackSources, setFallbackSources] = useState<{name: string, root: VirtualDir}[]>([]);
   
   const [activeSourceId, setActiveSourceId] = useState<string>('demo');
   const [pathStack, setPathStack] = useState<{name: string, handle?: any, virtualDir?: VirtualDir}[]>([{ name: 'Demo Media' }]);
   const [currentDisplayItems, setCurrentDisplayItems] = useState<DisplayItem[]>(
       MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem }))
   );
   const [isLoadingDir, setIsLoadingDir] = useState(false);
   const [unauthorizedFolders, setUnauthorizedFolders] = useState<any[]>([]);

   useEffect(() => {
      get('media_folders').then(handles => {
         if (handles && Array.isArray(handles)) {
            setTopLevelFolders(handles);
            checkPermissions(handles);
         }
      });
   }, []);

   const checkPermissions = async (handles: any[]) => {
      const unauthorized = [];
      for (const h of handles) {
         if (await h.queryPermission({ mode: 'read' }) !== 'granted') {
             unauthorized.push(h);
         }
      }
      setUnauthorizedFolders(unauthorized);
   };

   const requestFolderPermission = async (handle: any) => {
      if (await handle.requestPermission({ mode: 'read' }) === 'granted') {
          setUnauthorizedFolders(prev => prev.filter(h => h !== handle));
          // If this was the active source, reload it
          if (activeSourceId === handle.name) {
              selectSource(handle.name);
          }
      }
   }

   const removeFolder = async (handleName: string) => {
      const remaining = topLevelFolders.filter(h => h.name !== handleName);
      setTopLevelFolders(remaining);
      await set('media_folders', remaining);
      setUnauthorizedFolders(prev => prev.filter(h => h.name !== handleName));
      if (activeSourceId === handleName) {
          selectSource('demo');
      }
   }

   const removeFallbackFolder = (name: string) => {
       const remaining = fallbackSources.filter(f => f.name !== name);
       setFallbackSources(remaining);
       if (activeSourceId === name) {
           selectSource('demo');
       }
   };

   const loadDirectoryLevel = async (handle: any, virtualDir?: VirtualDir) => {
       setIsLoadingDir(true);
       const items: DisplayItem[] = [];

       try {
           if (handle) {
               // Check permission just in case
               if (await handle.queryPermission({ mode: 'read' }) === 'granted') {
                   for await (const entry of handle.values()) {
                       if (entry.kind === 'directory') {
                           items.push({ kind: 'directory', name: entry.name, handle: entry });
                       } else if (entry.kind === 'file') {
                           if (entry.name.match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i)) {
                               const file = await entry.getFile();
                               const type = file.type.startsWith('video/') || entry.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                               items.push({
                                   kind: 'file',
                                   name: entry.name,
                                   media: {
                                       id: entry.name + file.lastModified,
                                       name: entry.name,
                                       type: type as 'image'|'video',
                                       url: getCachedObjectURL(entry.name + file.lastModified, file)
                                   }
                               });
                           }
                       }
                   }
               }
           } else if (virtualDir) {
               virtualDir.children.forEach(child => {
                   items.push({ kind: 'directory', name: child.name, virtualDir: child });
               });
               virtualDir.files.forEach(file => {
                   const type = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                   items.push({
                       kind: 'file',
                       name: file.name,
                       media: {
                           id: file.name + file.lastModified,
                           name: file.name,
                           type: type as 'image'|'video',
                           url: getCachedObjectURL(file.name + file.lastModified, file)
                       }
                   });
               });
           }
       } catch (e) {
           console.error("Error loading directory", e);
       }

       // Sort items: directories first, then files
       items.sort((a, b) => {
           if (a.kind === b.kind) return a.name.localeCompare(b.name);
           return a.kind === 'directory' ? -1 : 1;
       });

       setCurrentDisplayItems(items);
       setIsLoadingDir(false);
   };

   const selectSource = (sourceId: string) => {
       setActiveSourceId(sourceId);
       
       if (sourceId === 'demo') {
           setPathStack([{ name: 'Demo Media' }]);
           setCurrentDisplayItems(MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem })));
       } else {
           const nativeFolder = topLevelFolders.find(f => f.name === sourceId);
           if (nativeFolder) {
               setPathStack([{ name: nativeFolder.name, handle: nativeFolder }]);
               loadDirectoryLevel(nativeFolder);
               return;
           }
           const virtualFolder = fallbackSources.find(f => f.name === sourceId);
           if (virtualFolder) {
               setPathStack([{ name: virtualFolder.name, virtualDir: virtualFolder.root }]);
               loadDirectoryLevel(null, virtualFolder.root);
               return;
           }
       }
   }

   const enterFolder = (item: DisplayItem) => {
       if (item.kind !== 'directory') return;
       const newStack = [...pathStack, { name: item.name, handle: item.handle, virtualDir: item.virtualDir }];
       setPathStack(newStack);
       loadDirectoryLevel(item.handle, item.virtualDir);
   }

   const goUp = () => {
       if (pathStack.length <= 1) return;
       const newStack = pathStack.slice(0, -1);
       setPathStack(newStack);
       const parent = newStack[newStack.length - 1];
       if (activeSourceId === 'demo') {
           // Not applicable
       } else {
           loadDirectoryLevel(parent.handle, parent.virtualDir);
       }
   };

   const handleAddFolder = async () => {
      try {
         const handle = await (window as any).showDirectoryPicker({
            id: 'media_folder',
            mode: 'read'
         });
         
         const newFolders = [...topLevelFolders.filter(f => f.name !== handle.name), handle];
         setTopLevelFolders(newFolders);
         await set('media_folders', newFolders);
         selectSource(handle.name);
      } catch (err) {
         console.log('User cancelled or error', err);
      }
   };
   
   const handleFallbackFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      
      const rootMap = new Map<string, VirtualDir>();
      
      for (let i=0; i<files.length; i++) {
          const file = files[i];
          if (!file.name.match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i)) continue;
          
          const parts = file.webkitRelativePath.split('/');
          if (parts.length === 0) continue;
          
          const rootName = parts[0];
          if (!rootMap.has(rootName)) {
              rootMap.set(rootName, { name: rootName, children: new Map(), files: [] });
          }
          
          let current = rootMap.get(rootName)!;
          for (let j=1; j<parts.length - 1; j++) {
              const part = parts[j];
              if (!current.children.has(part)) {
                  current.children.set(part, { name: part, children: new Map(), files: [] });
              }
              current = current.children.get(part)!;
          }
          
          current.files.push(file);
      }
      
      const newSources = Array.from(rootMap.values()).map(v => ({ name: v.name, root: v }));
      setFallbackSources(prev => [...prev, ...newSources]);
      
      if (newSources.length > 0) {
          selectSource(newSources[0].name);
      }
   };

   const canUseFileAccessApi = 'showDirectoryPicker' in window;

   return (
      <div className="flex h-full bg-[#1e1e1e] border border-neutral-800 rounded-lg overflow-hidden min-h-[500px]">
         {/* Sidebar */}
         <div className="w-48 md:w-56 border-r border-neutral-800 bg-[#141414] flex flex-col shrink-0 h-full min-h-0">
             <div className="p-3 border-b border-neutral-800 bg-[#1a1a1a]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                   <ImageIcon size={16} className="text-blue-500" />
                   Media Library
                </h3>
             </div>
             
             <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Built-in</div>
                   <button 
                       onClick={() => selectSource('demo')}
                       className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2
                           ${activeSourceId === 'demo' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-neutral-300 hover:bg-[#252525] hover:text-white border border-transparent'}
                       `}
                   >
                       <ImageIcon size={16} /> 
                       Demo Media
                   </button>
                </div>
                
                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2 flex justify-between items-center">
                       <span>Local Folders</span>
                   </div>
                   
                   {topLevelFolders.map(f => (
                       <div key={f.name} className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-neutral-300 hover:bg-[#252525] hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)}>
                               {unauthorizedFolders.includes(f) ? (
                                   <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" title="Needs Permission" />
                               ) : <Folder size={16} className="shrink-0" />}
                               <span className="truncate">{f.name}</span>
                           </div>
                           
                           {unauthorizedFolders.includes(f) ? (
                               <button onClick={() => requestFolderPermission(f)} className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded border border-orange-500/30 hover:bg-orange-500/30 shrink-0 ml-2">Grant</button>
                           ) : (
                               <button onClick={() => removeFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                           )}
                       </div>
                   ))}
                   
                   {fallbackSources.map(f => (
                       <div key={f.name} className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-neutral-300 hover:bg-[#252525] hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)}>
                               <Folder size={16} className="shrink-0" />
                               <span className="truncate">{f.name}</span>
                           </div>
                           <button onClick={() => removeFallbackFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                       </div>
                   ))}
                </div>
             </div>
             
             <div className="p-3 border-t border-neutral-800 bg-[#1a1a1a]">
                  {canUseFileAccessApi ? (
                    <button 
                        onClick={handleAddFolder}
                        className="flex items-center justify-center w-full gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-white transition-colors"
                    >
                        <FolderPlus size={16} />
                        Add Folder
                    </button>
                  ) : (
                    <label className="flex items-center justify-center w-full gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-white transition-colors cursor-pointer">
                        <FolderPlus size={16} />
                        Add Folder
                        <input 
                            type="file" 
                            {...({ webkitdirectory: "", directory: "" } as any)}
                            multiple 
                            className="hidden" 
                            onChange={handleFallbackFolderSelect}
                        />
                    </label>
                  )}
             </div>
         </div>

         {/* Main View Area */}
         <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
            {/* Breadcrumb Path */}
            <div className="h-12 border-b border-neutral-800 flex items-center px-4 bg-[#141414] shrink-0 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {pathStack.length > 1 && (
                        <button 
                           onClick={goUp} 
                           className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors mr-1"
                           title="Go Up"
                        >
                           <ArrowUp size={16} />
                        </button>
                    )}
                    {pathStack.map((p, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={14} className="text-neutral-600" />}
                            <span className={`text-sm ${i === pathStack.length - 1 ? 'text-white font-medium' : 'text-neutral-500'}`}>
                                {p.name}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
            </div>
            
            {/* Folder Contents */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
               {isLoadingDir ? (
                   <div className="flex items-center justify-center h-full text-neutral-500 animate-pulse text-sm">
                       Reading directory...
                   </div>
               ) : currentDisplayItems.length === 0 ? (
                   <div className="flex items-center justify-center h-full text-neutral-600 text-sm italic">
                       Folder is empty
                   </div>
               ) : (
                   <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {currentDisplayItems.map((item, idx) => (
                         item.kind === 'directory' ? (
                            <div 
                               key={`dir-${idx}`}
                               onClick={() => enterFolder(item)} 
                               className="cursor-pointer bg-[#141414] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-blue-500/50 rounded-xl p-4 flex flex-col items-center justify-center text-center aspect-video gap-3 transition-colors group shadow-sm"
                            >
                               <div className="bg-blue-500/10 p-3 rounded-full group-hover:scale-110 transition-transform">
                                   <Folder size={28} className="text-blue-500" />
                               </div>
                               <span className="text-sm font-medium text-neutral-300 group-hover:text-white truncate w-full px-2" title={item.name}>
                                   {item.name}
                               </span>
                            </div>
                         ) : (
                            <MediaCard 
                               key={`file-${idx}`} 
                               media={item.media!} 
                               onSelect={() => onSelectBackground(item.media!.url, item.media!.type)} 
                            />
                         )
                      ))}
                   </div>
               )}
            </div>
         </div>
      </div>
   );
}

function MediaCard({ media, onSelect }: { media: MediaItem, onSelect: () => void, key?: React.Key }) {
   return (
      <div 
         onClick={onSelect}
         className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group border border-neutral-800 hover:border-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-[#1a1a1a] transition-all"
         title={media.name}
      >
         {media.type === 'video' ? (
            <video 
              src={media.url} 
              className="absolute inset-0 w-full h-full object-cover" 
              muted loop playsInline
              onMouseOver={e => (e.target as HTMLVideoElement).play()}
              onMouseOut={e => {
                  const v = (e.target as HTMLVideoElement);
                  v.pause();
                  v.currentTime = 0;
              }}
            />
         ) : (
            <img src={media.url} alt={media.name} className="absolute inset-0 w-full h-full object-cover" />
         )}
         
         <div className="absolute top-2 left-2 bg-black/60 p-1.5 rounded-lg text-white backdrop-blur-md pointer-events-none shadow-sm">
            {media.type === 'video' ? <Video size={14} /> : <ImageIcon size={14} />}
         </div>
         
         <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 pointer-events-none">
            <div className="text-xs text-neutral-200 truncate font-medium">
               {media.name}
            </div>
         </div>
      </div>
   );
}
