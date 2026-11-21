import React, { useState, useEffect, useRef } from 'react';
import { DRAG_MEDIA } from './ProjectsPanel';
import { get, set } from 'idb-keyval';
import { Image as ImageIcon, Video, Trash, Folder, ChevronRight, ArrowUp, Plus, Radio, Camera, Monitor, RefreshCw, Search, LayoutGrid, Play } from 'lucide-react';
import { isTauri } from '../lib/tauriScreen';
import { listMediaFolder, mediaUrl, pickMediaFolder, type FolderEntry } from '../lib/nativeFiles';
import { DRAG_INPUT, LiveInput, LiveInputKind, LiveInputView, listCameras, listNdiSources, listScreens, sameInput } from '../lib/liveInputs';
import { ndiInfo } from '../lib/nativeOutputs';
import { folderKey, folderTag, isPlayback, tagFolder, tagVideo, useMediaTags } from '../lib/playback';

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
  /** Where it is in an added folder, so a setlist can find it again after a restart */
  ref?: MediaRef;
  /** Browser folders chosen with the folder chooser: where it is (for playback tags; they last until FlowShow closes) */
  place?: string;
};

/** A file in one of the added folders: the folder's name and the folders and file name inside it */
export type MediaRef = { folder: string; path: string[] };

/**
 * Desktop app: an added folder is kept by its path, and FlowShow reads it itself (no permission boxes).
 * `aliases`: the names it had before (a folder added again under another name), so older references still work.
 */
type NativeFolder = { name: string; path: string; aliases?: string[] };
const NATIVE_FOLDERS_KEY = 'media_folder_paths';
const joinPath = (root: string, parts: string[]) => [root.replace(/[\\/]+$/, ''), ...parts].join('\\');
const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

/**
 * The file a MediaRef points at, as a URL to show (null if its folder isn't added or the file is gone).
 * In the browser it may ask for permission to read the folder again (call it from a click).
 */
export async function resolveMediaRef(ref: MediaRef): Promise<string | null> {
  if (isTauri()) {
    const folders = ((await get(NATIVE_FOLDERS_KEY)) || []) as NativeFolder[];
    const root = folders.find(f => f.name === ref.folder || f.aliases?.includes(ref.folder));
    return root ? mediaUrl(joinPath(root.path, ref.path)) : null;
  }
  try {
    const handles = ((await get('media_folders')) || []) as any[];
    const root = handles.find(h => h.name === ref.folder);
    if (!root) return null;
    if (await root.queryPermission({ mode: 'read' }) !== 'granted' && await root.requestPermission({ mode: 'read' }) !== 'granted') return null;
    let dir = root;
    for (const name of ref.path.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
    const file = await (await dir.getFileHandle(ref.path[ref.path.length - 1])).getFile();
    return getCachedObjectURL(`${ref.folder}/${ref.path.join('/')}${file.lastModified}`, file);
  } catch {
    return null;
  }
}

type VirtualDir = {
  name: string;
  children: Map<string, VirtualDir>;
  files: File[];
};

type DisplayItem =
  | { kind: 'directory'; name: string; handle?: any; virtualDir?: VirtualDir; dirPath?: string }
  | { kind: 'file'; name: string; media: MediaItem };

type StackEntry = { name: string; handle?: any; virtualDir?: VirtualDir; dir?: string };

const URL_CACHE = new Map<string, string>();
function getCachedObjectURL(id: string, file: File) {
    if (!URL_CACHE.has(id)) {
        URL_CACHE.set(id, URL.createObjectURL(file));
    }
    return URL_CACHE.get(id)!;
}

const INPUTS = 'inputs';
const ALL = 'all';
/** All media: at most this many files, and folders this deep */
const ALL_LIMIT = 3000;
const ALL_DEPTH = 8;
const byName = (a: DisplayItem, b: DisplayItem) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export function MediaLibrary({ onSelectBackground, onPlayVideo, onSelectInput, activeInput }: {
   onSelectBackground: (url: string, type: 'image' | 'video') => void;
   /** A video tagged Playback: play it once, with sound */
   onPlayVideo?: (url: string, name: string) => void;
   /** Put a live input (camera, screen, NDI source) on the screens as the background */
   onSelectInput?: (input: LiveInput) => void;
   /** The live input on the screens now (its tile is marked) */
   activeInput?: LiveInput | null;
}) {
   const desktop = isTauri();
   const [topLevelFolders, setTopLevelFolders] = useState<any[]>([]); // Browser: folder handles
   const [nativeFolders, setNativeFolders] = useState<NativeFolder[]>([]); // Desktop app: folder paths
   // Desktop app: folders added in FlowShow 1.1 (browser-style), to choose again once
   const [legacyNames, setLegacyNames] = useState<string[]>([]);
   const [fallbackSources, setFallbackSources] = useState<{name: string, root: VirtualDir}[]>([]);

   const [activeSourceId, setActiveSourceId] = useState<string>('demo');
   const [pathStack, setPathStack] = useState<StackEntry[]>([{ name: 'Demo Media' }]);
   const [currentDisplayItems, setCurrentDisplayItems] = useState<DisplayItem[]>(
       MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem }))
   );
   const [isLoadingDir, setIsLoadingDir] = useState(false);
   const [loadProblem, setLoadProblem] = useState<string | null>(null);
   const [unauthorizedFolders, setUnauthorizedFolders] = useState<any[]>([]);
   const [allCount, setAllCount] = useState<number | null>(null);

   useEffect(() => {
      if (desktop) {
         Promise.all([get(NATIVE_FOLDERS_KEY), get('media_folders')]).then(([paths, handles]) => {
            const folders = (Array.isArray(paths) ? paths : []) as NativeFolder[];
            setNativeFolders(folders);
            if (folders.length) {
               setActiveSourceId(ALL);
               setPathStack([{ name: 'All media' }]);
               void loadAll(folders);
            }
            const known = new Set(folders.flatMap(f => [f.name, ...(f.aliases || [])]));
            setLegacyNames(Array.isArray(handles) ? handles.map((h: any) => h?.name).filter((n: string) => n && !known.has(n)) : []);
         });
         return;
      }
      get('media_folders').then(handles => {
         if (handles && Array.isArray(handles)) {
            setTopLevelFolders(handles);
            checkPermissions(handles);
         }
      });
   // eslint-disable-next-line react-hooks/exhaustive-deps
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

   const saveNativeFolders = async (folders: NativeFolder[]) => {
      setNativeFolders(folders);
      await set(NATIVE_FOLDERS_KEY, folders);
   };
   const removeNativeFolder = async (name: string) => {
      await saveNativeFolders(nativeFolders.filter(f => f.name !== name));
      if (activeSourceId === name) selectSource('demo');
   };
   /** Desktop app: add a folder with the Windows folder dialog (`replacing`: a folder from FlowShow 1.1 chosen again) */
   const addNativeFolder = async (replacing?: string) => {
      const path = await pickMediaFolder().catch(() => null);
      if (!path) return;
      let name = baseName(path);
      const same = nativeFolders.find(f => f.path.toLowerCase() === path.toLowerCase());
      let folders = nativeFolders;
      if (same) {
         name = same.name;
         if (replacing && replacing !== same.name) folders = folders.map(f => f === same ? { ...f, aliases: [...(f.aliases || []), replacing] } : f);
      } else {
         // Names identify folders in setlists and mixes: keep them different
         let n = 2;
         while (folders.some(f => f.name === name)) name = `${baseName(path)} (${n++})`;
         folders = [...folders, { name, path, ...(replacing && replacing !== name ? { aliases: [replacing] } : {}) }];
      }
      await saveNativeFolders(folders);
      if (replacing) {
         setLegacyNames(prev => prev.filter(n => n !== replacing));
         const handles = ((await get('media_folders')) || []) as any[];
         await set('media_folders', handles.filter(h => h?.name !== replacing));
      }
      setActiveSourceId(name);
      setPathStack([{ name, dir: path }]);
      void loadNativeLevel(path, { folder: name, dirs: [] });
   };

   const removeFallbackFolder = (name: string) => {
       const remaining = fallbackSources.filter(f => f.name !== name);
       setFallbackSources(remaining);
       if (activeSourceId === name) {
           selectSource('demo');
       }
   };

   /** Every picture and video in every added folder (and the folders inside them), by name */
   const loadAll = async (folders: NativeFolder[] = nativeFolders) => {
      setIsLoadingDir(true);
      setLoadProblem(null);
      const items: DisplayItem[] = [];
      const fileItem = (name: string, media: MediaItem): DisplayItem => ({ kind: 'file', name, media });
      if (desktop) {
         for (const f of folders) {
            const queue: { dir: string; dirs: string[] }[] = [{ dir: f.path, dirs: [] }];
            while (queue.length && items.length < ALL_LIMIT) {
               const { dir, dirs } = queue.shift()!;
               let entries: FolderEntry[] = [];
               try { entries = await listMediaFolder(dir); } catch { continue; }
               for (const e of entries) {
                  if (e.dir) { if (dirs.length < ALL_DEPTH) queue.push({ dir: e.path, dirs: [...dirs, e.name] }); }
                  else items.push(fileItem(e.name, { id: e.path, name: e.name, type: e.type === 'video' ? 'video' : 'image', url: mediaUrl(e.path), path: e.path, ref: { folder: f.name, path: [...dirs, e.name] } }));
               }
            }
         }
      } else {
         // Browser: folders it may read now, and folders chosen with the folder chooser
         for (const h of topLevelFolders) {
            if (await h.queryPermission({ mode: 'read' }).catch(() => 'denied') !== 'granted') continue;
            const queue: { handle: any; dirs: string[] }[] = [{ handle: h, dirs: [] }];
            while (queue.length && items.length < ALL_LIMIT) {
               const { handle, dirs } = queue.shift()!;
               try {
                  for await (const entry of handle.values()) {
                     if (entry.kind === 'directory') { if (dirs.length < ALL_DEPTH) queue.push({ handle: entry, dirs: [...dirs, entry.name] }); }
                     else if (/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i.test(entry.name)) {
                        const file = await entry.getFile();
                        const type = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(entry.name) ? 'video' : 'image';
                        items.push(fileItem(entry.name, { id: entry.name + file.lastModified, name: entry.name, type, url: getCachedObjectURL(entry.name + file.lastModified, file), ref: { folder: h.name, path: [...dirs, entry.name] } }));
                     }
                  }
               } catch { /* skip this folder */ }
            }
         }
         const walk = (d: VirtualDir, folder: string, dirs: string[]) => {
            d.files.forEach(file => {
               const type = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name) ? 'video' : 'image';
               items.push(fileItem(file.name, { id: file.name + file.lastModified, name: file.name, type, url: getCachedObjectURL(file.name + file.lastModified, file), place: folderKey({ folder, dirs: [...dirs, file.name] }) }));
            });
            d.children.forEach(child => walk(child, folder, [...dirs, child.name]));
         };
         fallbackSources.forEach(f => walk(f.root, f.name, []));
      }
      items.sort(byName);
      setCurrentDisplayItems(items);
      setAllCount(items.length);
      setIsLoadingDir(false);
   };

   /** Desktop app: one folder's contents, read by FlowShow (pictures and videos load from where they are) */
   const loadNativeLevel = async (dir: string, at: { folder: string; dirs: string[] }) => {
       setIsLoadingDir(true);
       setLoadProblem(null);
       try {
           const entries = await listMediaFolder(dir);
           setCurrentDisplayItems(entries.map((e): DisplayItem => e.dir
               ? { kind: 'directory', name: e.name, dirPath: e.path }
               : { kind: 'file', name: e.name, media: { id: e.path, name: e.name, type: e.type === 'video' ? 'video' : 'image', url: mediaUrl(e.path), path: e.path, ref: { folder: at.folder, path: [...at.dirs, e.name] } } }));
       } catch (e) {
           setCurrentDisplayItems([]);
           setLoadProblem(e instanceof Error ? e.message : String(e));
       }
       setIsLoadingDir(false);
   };

   // `at`: the added folder's name and the folders inside it, for native folders (so files can be found again)
   const loadDirectoryLevel = async (handle: any, virtualDir?: VirtualDir, at?: { folder: string; dirs: string[] }) => {
       setIsLoadingDir(true);
       setLoadProblem(null);
       const items: DisplayItem[] = [];

       try {
           if (handle) {
               if (await handle.queryPermission({ mode: 'read' }) === 'granted') {
                   for await (const entry of handle.values()) {
                       if (entry.kind === 'directory') {
                           items.push({ kind: 'directory', name: entry.name, handle: entry });
                       } else if (entry.kind === 'file') {
                           if (entry.name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i)) {
                               const file = await entry.getFile();
                               const type = file.type.startsWith('video/') || entry.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
                               items.push({
                                   kind: 'file',
                                   name: entry.name,
                                   media: {
                                       id: entry.name + file.lastModified,
                                       name: entry.name,
                                       type: type as 'image'|'video',
                                       url: getCachedObjectURL(entry.name + file.lastModified, file),
                                       ref: at ? { folder: at.folder, path: [...at.dirs, entry.name] } : undefined,
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
                           url: getCachedObjectURL(file.name + file.lastModified, file),
                           place: at ? folderKey({ folder: at.folder, dirs: [...at.dirs, file.name] }) : undefined,
                       }
                   });
               });
           }
       } catch (e) {
           console.error("Error loading directory", e);
       }

       items.sort((a, b) => {
           if (a.kind === b.kind) return a.name.localeCompare(b.name);
           return a.kind === 'directory' ? -1 : 1;
       });

       setCurrentDisplayItems(items);
       setIsLoadingDir(false);
   };

   const selectSource = (sourceId: string) => {
       setActiveSourceId(sourceId);
       setLoadProblem(null);

       if (sourceId === INPUTS) return;
       if (sourceId === ALL) {
           setPathStack([{ name: 'All media' }]);
           void loadAll();
           return;
       }
       if (sourceId === 'demo') {
           setPathStack([{ name: 'Demo Media' }]);
           setCurrentDisplayItems(MOCK_MEDIA.map(m => ({ kind: 'file', name: m.name, media: m as MediaItem })));
           return;
       }
       const native = nativeFolders.find(f => f.name === sourceId);
       if (native) {
           setPathStack([{ name: native.name, dir: native.path }]);
           void loadNativeLevel(native.path, { folder: native.name, dirs: [] });
           return;
       }
       const handleFolder = topLevelFolders.find(f => f.name === sourceId);
       if (handleFolder) {
           setPathStack([{ name: handleFolder.name, handle: handleFolder }]);
           loadDirectoryLevel(handleFolder, undefined, { folder: handleFolder.name, dirs: [] });
           return;
       }
       const virtualFolder = fallbackSources.find(f => f.name === sourceId);
       if (virtualFolder) {
           setPathStack([{ name: virtualFolder.name, virtualDir: virtualFolder.root }]);
           loadDirectoryLevel(null, virtualFolder.root, { folder: virtualFolder.name, dirs: [] });
       }
   }

   const enterFolder = (item: DisplayItem) => {
       if (item.kind !== 'directory') return;
       const newStack = [...pathStack, { name: item.name, handle: item.handle, virtualDir: item.virtualDir, dir: item.dirPath }];
       setPathStack(newStack);
       const at = { folder: activeSourceId, dirs: newStack.slice(1).map(p => p.name) };
       if (item.dirPath) { void loadNativeLevel(item.dirPath, at); return; }
       loadDirectoryLevel(item.handle, item.virtualDir, at);
   }

   const goUp = () => {
       if (pathStack.length <= 1) return;
       const newStack = pathStack.slice(0, -1);
       setPathStack(newStack);
       const parent = newStack[newStack.length - 1];
       if (activeSourceId === 'demo') return;
       const at = { folder: activeSourceId, dirs: newStack.slice(1).map(p => p.name) };
       if (parent.dir) { void loadNativeLevel(parent.dir, at); return; }
       loadDirectoryLevel(parent.handle, parent.virtualDir, at);
   };

   const handleAddFolder = async () => {
      if (desktop) { await addNativeFolder(); return; }
      try {
         const handle = await (window as any).showDirectoryPicker({
            id: 'media_folder',
            mode: 'read'
         });

         const newFolders = [...topLevelFolders.filter(f => f.name !== handle.name), handle];
         setTopLevelFolders(newFolders);
         await set('media_folders', newFolders);
         setActiveSourceId(handle.name);
         setPathStack([{ name: handle.name, handle }]);
         loadDirectoryLevel(handle, undefined, { folder: handle.name, dirs: [] });
      } catch (err: any) {
         if (err?.name === 'AbortError') return; // cancelled
         console.warn('Folder picker not available here; using the folder chooser instead', err);
         fallbackInputRef.current?.click();
      }
   };
   const fallbackInputRef = useRef<HTMLInputElement>(null);
   // Clicking a folder that needs permission again asks for it, then opens the folder
   const openFolder = async (handle: any) => {
      if (unauthorizedFolders.includes(handle)) {
          if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return;
          setUnauthorizedFolders(prev => prev.filter(h => h !== handle));
      }
      selectSource(handle.name);
   };

   const handleFallbackFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const rootMap = new Map<string, VirtualDir>();

      for (let i=0; i<files.length; i++) {
          const file = files[i];
          if (!file.name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i)) continue;

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
          const first = newSources[0];
          setActiveSourceId(first.name);
          setPathStack([{ name: first.name, virtualDir: first.root }]);
          loadDirectoryLevel(null, first.root, { folder: first.name, dirs: [] });
      }
      e.target.value = '';
   };

   let isIframe = false;
   try {
     isIframe = window.self !== window.top;
   } catch (e) {
     isIframe = true;
   }
   const isAIStudioPreview = window.location.hostname.includes('webcontainer') || window.location.hostname.includes('preview');
   const canUseFileAccessApi = desktop || ('showDirectoryPicker' in window && !isIframe && !isAIStudioPreview);
   const noFolders = nativeFolders.length === 0 && topLevelFolders.length === 0 && fallbackSources.length === 0 && legacyNames.length === 0;
   // Playback / background tags (right-click a video or a folder)
   const mediaTags = useMediaTags();
   const [menu, setMenu] = useState<{ x: number; y: number; kind: 'video'; media: MediaItem } | { x: number; y: number; kind: 'folder'; key: string; name: string } | null>(null);
   useEffect(() => {
      if (!menu) return;
      const close = () => setMenu(null);
      window.addEventListener('pointerdown', close);
      return () => window.removeEventListener('pointerdown', close);
   }, [menu]);
   const openFolderMenu = (e: React.MouseEvent, key: string, name: string) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, kind: 'folder', key, name }); };
   /** The key of a folder tile in the folder shown now */
   const tileFolderKey = (item: DisplayItem) => item.kind !== 'directory' ? null
      : item.dirPath ? folderKey({ path: item.dirPath })
      : (item.handle || item.virtualDir) ? folderKey({ folder: activeSourceId, dirs: [...pathStack.slice(1).map(p => p.name), item.name] })
      : null;
   const playMedia = (m: MediaItem) => {
      if (m.type === 'video' && isPlayback(m, mediaTags) && onPlayVideo) onPlayVideo(m.url, m.name.replace(/\.[^.]+$/, ''));
      else onSelectBackground(m.url, m.type);
   };
   const sourceBtn = (on: boolean) => `w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 border ${on ? 'bg-pink-600/20 text-pink-300 border-pink-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}`;

   return (
      <div className="flex h-full bg-[#030303] border border-white/5 rounded-xl overflow-hidden min-h-0 shadow-lg relative">
         {/* Sidebar */}
         <div className="w-48 md:w-56 border-r border-white/5 bg-[#09090B] flex flex-col shrink-0 h-full min-h-0">
             <div className="p-4 border-b border-white/5 bg-[#09090B]">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                   <ImageIcon size={16} className="text-pink-500" />
                   Media Library
                </h3>
             </div>

             <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                <button type="button" onClick={() => selectSource(ALL)} className={`${sourceBtn(activeSourceId === ALL)} justify-between`} data-media-all title="Every picture and video in your folders">
                   <span className="flex items-center gap-2"><LayoutGrid size={16} /> All media</span>
                   {allCount !== null && <span className="text-[11px] text-neutral-500">{allCount}</span>}
                </button>

                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2">Live</div>
                   <button type="button" onClick={() => selectSource(INPUTS)} className={sourceBtn(activeSourceId === INPUTS)} data-media-inputs title="Cameras, capture cards, screens and NDI sources">
                       <Radio size={16} />
                       Inputs
                   </button>
                </div>

                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2">Built-in</div>
                   <button type="button" onClick={() => selectSource('demo')} className={sourceBtn(activeSourceId === 'demo')}>
                       <ImageIcon size={16} />
                       Demo Media
                   </button>
                </div>

                <div>
                   <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2 flex justify-between items-center">
                       <span>Local Folders</span>
                       <button
                          type="button"
                          onClick={() => canUseFileAccessApi ? handleAddFolder() : fallbackInputRef.current?.click()}
                          className="w-5 h-5 rounded-full bg-pink-600/20 hover:bg-pink-600/40 text-pink-300 hover:text-white flex items-center justify-center transition-colors"
                          title="Add a folder of pictures and videos from your computer"
                          data-add-media-folder
                       >
                          <Plus size={12} />
                       </button>
                   </div>
                   {noFolders && (
                       <button
                          type="button"
                          onClick={() => canUseFileAccessApi ? handleAddFolder() : fallbackInputRef.current?.click()}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-white/5 border border-dashed border-white/10 leading-snug"
                       >
                          Add a folder from your computer to use its pictures and videos.
                       </button>
                   )}
                   <input
                       ref={fallbackInputRef}
                       type="file"
                       {...({ webkitdirectory: "true", directory: "true" } as any)}
                       multiple
                       className="hidden"
                       onChange={handleFallbackFolderSelect}
                   />

                   {nativeFolders.map(f => (
                       <div key={f.path} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-pink-600/20 text-pink-300 border-pink-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}
                       `} data-media-folder={f.name} onContextMenu={(e) => openFolderMenu(e, folderKey({ path: f.path }), f.name)}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)} title={f.path}>
                               <Folder size={16} className="shrink-0 text-pink-400" />
                               <span className="truncate">{f.name}</span>
                           </div>
                           <button onClick={() => void removeNativeFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0" title="Remove from FlowShow (the folder stays on your computer)"><Trash size={14} /></button>
                       </div>
                   ))}

                   {legacyNames.map(name => (
                       <div key={`legacy-${name}`} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-400 border border-dashed border-amber-500/30 mb-1" data-media-legacy-folder={name}>
                           <span className="flex items-center gap-2 min-w-0" title="Added in an earlier FlowShow. Choose it once more and FlowShow reads it itself from now on (no more permission boxes).">
                               <Folder size={16} className="shrink-0 text-amber-400" />
                               <span className="truncate">{name}</span>
                           </span>
                           <button type="button" onClick={() => void addNativeFolder(name)} className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-1 rounded border border-amber-500/30 hover:bg-amber-500/30 shrink-0 flex items-center gap-1">
                               <Search size={10} /> Find again
                           </button>
                       </div>
                   ))}

                   {topLevelFolders.map(f => (
                       <div key={f.name} onContextMenu={(e) => openFolderMenu(e, folderKey({ folder: f.name, dirs: [] }), f.name)} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-pink-600/20 text-pink-300 border-pink-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => openFolder(f)} title={unauthorizedFolders.includes(f) ? 'Click to allow FlowShow to read this folder again' : undefined}>
                               {unauthorizedFolders.includes(f) ? (
                                   <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 shadow-[0_0_8px_rgba(249,115,22,0.6)]" title="Needs Permission" />
                               ) : <Folder size={16} className="shrink-0 text-pink-400" />}
                               <span className="truncate">{f.name}</span>
                           </div>

                           {unauthorizedFolders.includes(f) ? (
                               <button onClick={() => requestFolderPermission(f)} className="text-[10px] font-bold bg-orange-500/20 text-orange-400 px-2 py-1 rounded border border-orange-500/30 hover:bg-orange-500/30 shrink-0 ml-2 uppercase tracking-wide">Grant</button>
                           ) : (
                               <button onClick={() => removeFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                           )}
                       </div>
                   ))}

                   {fallbackSources.map(f => (
                       <div key={f.name} className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all cursor-pointer mb-1
                           ${activeSourceId === f.name ? 'bg-pink-600/20 text-pink-300 border-pink-500/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white border-transparent'}
                       `}>
                           <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => selectSource(f.name)}>
                               <Folder size={16} className="shrink-0 text-pink-400" />
                               <span className="truncate">{f.name}</span>
                           </div>
                           <button onClick={() => removeFallbackFolder(f.name)} className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"><Trash size={14} /></button>
                       </div>
                   ))}
                </div>
             </div>

         </div>

         {menu && (
            <div className="fixed z-[150] min-w-[260px] py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl text-xs text-neutral-200"
               style={{ left: Math.min(menu.x, window.innerWidth - 280), top: menu.y, transform: menu.y > window.innerHeight / 2 ? 'translateY(-100%)' : undefined }}
               onPointerDown={(e) => e.stopPropagation()} data-media-menu>
               {menu.kind === 'video' ? (() => {
                  const on = isPlayback(menu.media, mediaTags);
                  return (
                     <button type="button" className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/10 text-left"
                        onClick={() => { tagVideo(menu.media, on ? 'background' : 'playback'); setMenu(null); }} data-media-tag-video>
                        {on ? <Video size={13} className="text-neutral-400 mt-0.5" /> : <Play size={13} className="text-pink-400 mt-0.5" />}
                        <span>{on ? 'Make it a background video' : 'Make it a playback video'}<span className="block text-[10px] text-neutral-500">{on ? 'Silent, loops under the words' : 'Plays once with sound (this computer), with controls'}</span></span>
                     </button>
                  );
               })() : (() => {
                  const on = folderTag(menu.key, mediaTags) === 'playback';
                  return (
                     <button type="button" className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/10 text-left"
                        onClick={() => { tagFolder(menu.key, on ? null : 'playback'); setMenu(null); }} data-media-tag-folder>
                        {on ? <Folder size={13} className="text-neutral-400 mt-0.5" /> : <Play size={13} className="text-pink-400 mt-0.5" />}
                        <span>{on ? `Make "${menu.name}" background videos again` : `Everything in "${menu.name}" is playback`}<span className="block text-[10px] text-neutral-500">{on ? 'Its videos are silent backgrounds' : 'Its videos (and those in folders inside) play once with sound'}</span></span>
                     </button>
                  );
               })()}
            </div>
         )}

         {activeSourceId === INPUTS ? (
            <InputsView onSelectInput={onSelectInput} activeInput={activeInput} />
         ) : (
         <div className="flex-1 flex flex-col min-w-0 bg-[#030303]">
            {/* Breadcrumb Path */}
            <div className="h-14 border-b border-white/5 flex items-center px-6 bg-[#09090B] shrink-0 overflow-x-auto custom-scrollbar">
                <div className="flex items-center gap-2 min-w-max">
                    {pathStack.length > 1 && (
                        <button
                           onClick={goUp}
                           className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/5 rounded-md transition-all mr-2"
                           title="Go Up"
                        >
                           <ArrowUp size={16} />
                        </button>
                    )}
                    {pathStack.map((p, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <ChevronRight size={14} className="text-neutral-600 mx-1" />}
                            <span className={`text-sm ${i === pathStack.length - 1 ? 'text-white font-medium' : 'text-neutral-500'}`}>
                                {p.name}
                            </span>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Folder Contents */}
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
               {isLoadingDir ? (
                   <div className="flex flex-col items-center justify-center h-full gap-4 text-neutral-500 animate-pulse text-sm">
                       <Folder size={32} className="text-neutral-700 opacity-50" />
                       Reading directory...
                   </div>
               ) : loadProblem ? (
                   <div className="flex flex-col items-center justify-center h-full text-amber-300/90 text-sm gap-2 text-center px-6" data-media-problem>
                       <Folder size={24} className="text-amber-500/60" />
                       {loadProblem}
                   </div>
               ) : currentDisplayItems.length === 0 && activeSourceId === ALL ? (
                   <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-sm gap-2 text-center px-6" data-media-all-empty>
                       <LayoutGrid size={24} className="text-neutral-700" />
                       No pictures or videos yet. Add a folder under Local Folders (+) and everything in it shows here.
                   </div>
               ) : currentDisplayItems.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-full text-neutral-600 text-sm italic gap-4">
                       <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                           <Folder size={24} className="text-neutral-700" />
                       </div>
                       Folder is empty
                   </div>
               ) : (
                   <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }} data-media-grid>
                      {currentDisplayItems.map((item, idx) => (
                         item.kind === 'directory' ? (
                            <div
                               key={`dir-${idx}`}
                               onClick={() => enterFolder(item)}
                               onContextMenu={(e) => { const k = tileFolderKey(item); if (k) openFolderMenu(e, k, item.name); }}
                               className="cursor-pointer rounded-md overflow-hidden bg-[#121214] border border-white/5 hover:border-pink-500/60 transition-colors group"
                               title={`${item.name}\nRight-click: make every video in it a playback video`}
                               data-media-folder-tile={item.name}
                            >
                               <div className="relative aspect-video flex items-center justify-center bg-[#0c0c10]">
                                   <Folder size={30} className="text-pink-500/80 group-hover:scale-110 transition-transform" />
                                   {(() => { const k = tileFolderKey(item); return k && folderTag(k, mediaTags) === 'playback' ? <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-pink-600 text-white text-[8px] font-bold tracking-wider">▶ PLAYBACK</span> : null; })()}
                               </div>
                               <div className="h-6 px-2 flex items-center gap-1.5 text-[11px] text-neutral-300">
                                   <Folder size={11} className="text-neutral-500 shrink-0" />
                                   <span className="truncate">{item.name}</span>
                               </div>
                            </div>
                         ) : (
                            <MediaCard
                               key={`file-${idx}`}
                               media={item.media!}
                               playback={item.media!.type === 'video' && isPlayback(item.media!, mediaTags)}
                               onSelect={() => playMedia(item.media!)}
                               onMenu={(e) => { if (item.media!.type !== 'video') return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'video', media: item.media! }); }}
                            />
                         )
                      ))}
                   </div>
               )}
            </div>
         </div>
         )}
      </div>
   );
}

const INPUT_TABS: { kind: LiveInputKind; label: string; icon: typeof Camera }[] = [
   { kind: 'camera', label: 'Cameras', icon: Camera },
   { kind: 'screen', label: 'Screens', icon: Monitor },
   { kind: 'ndi', label: 'NDI', icon: Radio },
];

/** Inputs: live tiles of every camera, screen and NDI source; click one to make it the background, or drag it into Mix */
function InputsView({ onSelectInput, activeInput }: { onSelectInput?: (input: LiveInput) => void; activeInput?: LiveInput | null }) {
   const desktop = isTauri();
   const [tab, setTab] = useState<LiveInputKind>('camera');
   const [found, setFound] = useState<Record<LiveInputKind, LiveInput[] | null>>({ camera: null, screen: null, ndi: null });
   const [busy, setBusy] = useState(false);
   const [problem, setProblem] = useState<string | null>(null);

   const look = async (kind: LiveInputKind) => {
      setBusy(true);
      setProblem(null);
      try {
         let list: LiveInput[] = [];
         if (kind === 'camera') list = await listCameras();
         else if (kind === 'screen') list = await listScreens();
         else {
            const info = await ndiInfo();
            if (!info.available) { setProblem(info.error || 'NDI isn’t available on this computer.'); list = []; }
            else list = await listNdiSources(2500);
         }
         setFound(prev => ({ ...prev, [kind]: list }));
      } catch (e) {
         setProblem(e instanceof Error ? e.message : String(e));
         setFound(prev => ({ ...prev, [kind]: [] }));
      }
      setBusy(false);
   };
   useEffect(() => {
      if (found[tab] === null && (tab === 'camera' || desktop)) void look(tab);
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [tab]);

   const list = found[tab];
   const emptyText = tab === 'camera' ? 'No cameras found. Connect a webcam or capture card (or start OBS Virtual Camera / NDI Webcam), then click Look again.'
      : tab === 'screen' ? 'No screens found.'
      : 'No NDI sources found on the network. Start a source (OBS with NDI, NDI Tools, a camera…) and click Look again.';

   return (
      <div className="flex-1 flex flex-col min-w-0 bg-[#030303]" data-media-inputs-view>
         <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#09090B] shrink-0">
            <div className="flex items-center gap-1">
               {INPUT_TABS.map(t => {
                  const Icon = t.icon;
                  return (
                     <button key={t.kind} type="button" onClick={() => setTab(t.kind)}
                        className={`px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors ${tab === t.kind ? 'bg-pink-600/20 text-pink-300' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                        data-input-tab={t.kind}>
                        <Icon size={15} /> {t.label}
                     </button>
                  );
               })}
            </div>
            <button type="button" onClick={() => void look(tab)} disabled={busy || (tab !== 'camera' && !desktop)}
               className="px-3 py-1.5 rounded-md text-xs font-semibold text-neutral-300 hover:text-white hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-40"
               data-input-refresh>
               <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy ? (tab === 'ndi' ? 'Looking on the network…' : 'Looking…') : 'Look again'}
            </button>
         </div>
         <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {tab !== 'camera' && !desktop ? (
               <p className="text-sm text-neutral-500">Screens and NDI sources work in the FlowShow desktop app.</p>
            ) : problem ? (
               <p className="text-sm text-amber-300/90 max-w-xl" data-input-problem>{problem}</p>
            ) : list === null || (busy && !list.length) ? (
               <p className="text-sm text-neutral-500">{tab === 'ndi' ? 'Looking for NDI sources on the network…' : 'Looking…'}</p>
            ) : list.length === 0 ? (
               <p className="text-sm text-neutral-500 max-w-xl">{emptyText}</p>
            ) : (
               <>
                  <p className="text-[11px] text-neutral-500 mb-3">Click to make it the background on the screens · drag into Mix to use it as a layer.</p>
                  <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                     {list.map(input => {
                        const on = sameInput(input, activeInput);
                        const Icon = INPUT_TABS.find(t => t.kind === input.kind)!.icon;
                        return (
                           <div key={`${input.kind}:${input.id}`}
                              onClick={() => onSelectInput?.(input)}
                              draggable
                              onDragStart={(e) => { e.dataTransfer.setData(DRAG_INPUT, JSON.stringify(input)); e.dataTransfer.effectAllowed = 'copy'; }}
                              className={`rounded-md overflow-hidden cursor-pointer bg-[#121214] border transition-colors ${on ? 'border-pink-500 ring-1 ring-pink-500' : 'border-white/5 hover:border-pink-500'}`}
                              title={`${input.label}\nClick to make it the background · drag into Mix to use it as a layer`}
                              data-input-tile={input.label}>
                              <div className="relative aspect-video overflow-hidden bg-black">
                                 <LiveInputView input={input} quality={input.kind === 'camera' ? 'high' : 'low'} className="absolute inset-0 w-full h-full" showProblems />
                                 {on && <span className="absolute top-1 right-1 px-1 py-0.5 rounded bg-pink-600 text-white text-[8px] font-bold tracking-wider">ON SCREEN</span>}
                              </div>
                              <div className="h-6 px-2 flex items-center gap-1.5 text-[11px] text-neutral-300">
                                 <Icon size={11} className={on ? 'text-pink-400 shrink-0' : 'text-neutral-400 shrink-0'} />
                                 <span className="truncate">{input.label}</span>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </>
            )}
         </div>
      </div>
   );
}

/**
 * One picture or video. In the desktop app it shows Windows' small thumbnail (fast; loads as the tile scrolls into
 * view); a video only plays (silently) while the mouse is over it. Without a thumbnail, a picture shows itself.
 */
function MediaCard({ media, onSelect, playback = false, onMenu }: { media: MediaItem, onSelect: () => void, playback?: boolean, onMenu?: (e: React.MouseEvent) => void, key?: React.Key }) {
   const label = media.name.replace(/\.[^.]+$/, '');
   const thumb = media.path ? `${media.url}?thumb` : null;
   const [thumbFailed, setThumbFailed] = useState(false);
   const [hover, setHover] = useState(false);
   const isVideo = media.type === 'video';
   return (
      <div
         onClick={onSelect}
         onContextMenu={onMenu}
         onMouseEnter={() => setHover(true)}
         onMouseLeave={() => setHover(false)}
         data-playback={playback ? '' : undefined}
         draggable
         onDragStart={(e) => { e.dataTransfer.setData(DRAG_MEDIA, JSON.stringify({ name: media.name, url: media.url, type: media.type, ref: media.ref, path: media.path })); e.dataTransfer.effectAllowed = 'copy'; }}
         className="rounded-md overflow-hidden cursor-pointer group border border-white/5 hover:border-pink-500 bg-[#121214] transition-colors"
         title={isVideo ? `${media.name}\n${playback ? 'Playback video: plays once with sound' : 'Background video: silent, loops'} · right-click to change` : media.name}
         data-media-card={media.name}
      >
      <div className="relative aspect-video overflow-hidden bg-black">
         {playback && <span className="absolute top-1 left-1 z-10 px-1 py-0.5 rounded bg-pink-600 text-white text-[8px] font-bold tracking-wider pointer-events-none">▶ PLAYBACK</span>}
         {thumb && !thumbFailed ? (
            <img src={thumb} alt={media.name} loading="lazy" decoding="async" draggable={false} onError={() => setThumbFailed(true)} className="absolute inset-0 w-full h-full object-cover" data-media-thumb />
         ) : !isVideo ? (
            <img src={media.url} alt={media.name} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
         ) : !thumb ? (
            // Browser folders: the video's first picture
            <video src={media.url} preload="metadata" className="absolute inset-0 w-full h-full object-cover" muted playsInline />
         ) : (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-600"><Video size={22} /></div>
         )}
         {/* A video plays (silently) only while the mouse is over it */}
         {isVideo && hover && (
            <video src={media.url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover pointer-events-none" data-media-hover-preview />
         )}
      </div>
         <div className="h-6 px-2 flex items-center gap-1.5 text-[11px] text-neutral-300">
            {isVideo ? <Video size={11} className="text-pink-400 shrink-0" /> : <ImageIcon size={11} className="text-neutral-400 shrink-0" />}
            <span className="truncate">{label}</span>
         </div>
      </div>
   );
}
