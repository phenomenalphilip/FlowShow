import React, { useEffect, useState } from 'react';
import { askConfirm, askText } from '../lib/appDialogs';
import { BookOpen, ChevronDown, ChevronRight, Folder, FolderOpen, Image as ImageIcon, Music, Pencil, Plus, Trash, Video, Heading } from 'lucide-react';
import { HEADER_COLORS, ProjectsState, ServiceSetlist, SetlistItem } from '../lib/setlist';
import type { SlideDefinition } from '../lib/model';

/** What can be dragged into a setlist (and the setlist's own rows and projects) */
export const DRAG_SONG = 'application/x-flowshow-song';
export const DRAG_MEDIA = 'application/x-flowshow-media';
export const DRAG_SCRIPTURE = 'application/x-flowshow-scripture';
const DRAG_ITEM = 'application/x-flowshow-setlist-item';
const DRAG_PROJECT = 'application/x-flowshow-project';
const ADDABLE = [DRAG_SONG, DRAG_MEDIA, DRAG_SCRIPTURE, DRAG_ITEM];
const UNLABELED = 'Unlabeled';

interface ProjectsPanelProps {
  state: ProjectsState;
  onChange: (next: ProjectsState) => void;
  /** The setlist view is open (so the open project and item are highlighted) */
  setlistOpen: boolean;
  activeItemId?: string | null;
  onOpenProject: (id: string) => void;
  /** One click: open in Preview; double-click (live): send to the screens */
  onOpenItem: (projectId: string, item: SetlistItem, live?: boolean) => void;
  /** A show from the library, for songs dropped in */
  getSong: (id: string) => { id: string; title: string; slides: SlideDefinition[]; category?: string } | undefined;
  /** Make a new project (in this folder) */
  onNewProject: (folder?: string) => void;
}

type Menu = { x: number; y: number } & (
  | { kind: 'item'; projectId: string; itemId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'folder'; folder: string }
);

/** The first and last index of a row and, for a section header, the items under it */
const blockOf = (items: SetlistItem[], index: number): [number, number] => {
  if (items[index]?.type !== 'header') return [index, index];
  let end = index;
  while (end + 1 < items.length && items[end + 1].type !== 'header') end++;
  return [index, end];
};

const itemIcon = (item: SetlistItem) =>
  item.type === 'scripture' ? BookOpen : item.type === 'media' ? (item.mediaType === 'video' ? Video : ImageIcon) : Music;

/** The Projects panel: projects (one setlist per service) in folders; drop songs, media and verses in; drag to reorder */
export function ProjectsPanel({ state, onChange, setlistOpen, activeItemId, onOpenProject, onOpenItem, getSong, onNewProject }: ProjectsPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dropAt, setDropAt] = useState<{ projectId: string; index: number } | null>(null);
  const [folderDrop, setFolderDrop] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target instanceof Element && e.target.closest('[data-projects-menu]'))) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', onKey, true); };
  }, [menu]);

  const setProject = (id: string, fn: (p: ServiceSetlist) => ServiceSetlist) =>
    onChange({ ...state, projects: state.projects.map(p => p.id === id ? fn(p) : p) });
  const isOpen = (id: string) => id === state.activeId || expanded.has(id);

  // ─── Dropping ───
  const accepts = (e: React.DragEvent) => ADDABLE.some(t => e.dataTransfer.types.includes(t));
  /** A new setlist item for what was dropped (a song, media or a verse) */
  const itemFromDrop = (dt: DataTransfer): SetlistItem | null => {
    const now = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const songId = dt.getData(DRAG_SONG);
    if (songId) {
      const song = getSong(songId);
      if (!song) return null;
      return { id: `setlist-song-${now}`, type: 'song', title: song.title, subtitle: `${song.category === 'Declarations' ? 'Declaration · ' : song.category === 'Presentations' ? 'Presentation · ' : ''}${song.slides.length} slides`, songId: song.id, slides: song.slides };
    }
    const media = dt.getData(DRAG_MEDIA);
    if (media) {
      const m = JSON.parse(media) as { name: string; url: string; type: 'image' | 'video'; ref?: { folder: string; path: string[] }; path?: string };
      return { id: `setlist-media-${now}`, type: 'media', title: m.name, subtitle: m.type === 'video' ? 'Video' : 'Image', backgroundUrl: m.url, mediaType: m.type, mediaRef: m.ref, mediaPath: m.path };
    }
    const verse = dt.getData(DRAG_SCRIPTURE);
    if (verse) {
      const slide = JSON.parse(verse) as SlideDefinition;
      return { id: `setlist-scripture-${now}`, type: 'scripture', title: slide.source || 'Scripture', subtitle: 'Scripture', slides: [{ ...slide, id: `${slide.id}-${now}` }] };
    }
    return null;
  };

  const drop = (e: React.DragEvent, projectId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropAt(null);
    const moved = e.dataTransfer.getData(DRAG_ITEM);
    const target = state.projects.find(p => p.id === projectId);
    if (!target) return;
    if (moved) {
      const { projectId: fromId, itemId } = JSON.parse(moved) as { projectId: string; itemId: string };
      const source = state.projects.find(p => p.id === fromId);
      const from = source?.items.findIndex(i => i.id === itemId) ?? -1;
      if (!source || from < 0) return;
      const [a, b] = blockOf(source.items, from);
      const block = source.items.slice(a, b + 1);
      if (fromId === projectId) {
        if (index >= a && index <= b + 1) return; // dropped onto itself
        const rest = [...source.items.slice(0, a), ...source.items.slice(b + 1)];
        const at = index > b ? index - block.length : index;
        rest.splice(at, 0, ...block);
        setProject(projectId, p => ({ ...p, items: rest }));
      } else {
        onChange({
          ...state,
          projects: state.projects.map(p => p.id === fromId ? { ...p, items: [...p.items.slice(0, a), ...p.items.slice(b + 1)] }
            : p.id === projectId ? { ...p, items: [...p.items.slice(0, index), ...block, ...p.items.slice(index)] } : p),
        });
      }
      return;
    }
    const item = itemFromDrop(e.dataTransfer);
    if (!item) return;
    setProject(projectId, p => ({ ...p, items: [...p.items.slice(0, index), item, ...p.items.slice(index)] }));
    setExpanded(prev => new Set(prev).add(projectId));
  };

  const rowDragOver = (e: React.DragEvent, projectId: string, index: number) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DRAG_ITEM) ? 'move' : 'copy';
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < r.top + r.height / 2 ? index : index + 1;
    if (dropAt?.projectId !== projectId || dropAt.index !== at) setDropAt({ projectId, index: at });
  };

  // ─── Menu actions ───
  const askName = async (question: string, value = '') => (await askText(question, value)) || '';
  const addHeader = async (projectId: string, at?: number) => {
    const title = await askName('Section header (for example Praise & Worship, Declaration, Creed)');
    if (!title) return;
    setProject(projectId, p => {
      const color = HEADER_COLORS[p.items.filter(i => i.type === 'header').length % HEADER_COLORS.length];
      const header: SetlistItem = { id: `setlist-header-${Date.now().toString(36)}`, type: 'header', title, headerColor: color };
      const index = at ?? p.items.length;
      return { ...p, items: [...p.items.slice(0, index), header, ...p.items.slice(index)] };
    });
    setExpanded(prev => new Set(prev).add(projectId));
  };
  const runMenu = (fn: () => void | Promise<void>) => () => { setMenu(null); void fn(); };

  const folders = [UNLABELED, ...state.folders];
  const inFolder = (folder: string) => state.projects.filter(p => (p.folder && state.folders.includes(p.folder) ? p.folder : UNLABELED) === folder);
  const menuItem = 'w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs text-neutral-200 hover:bg-white/10 transition-colors';

  const renderItems = (project: ServiceSetlist) => (
    <div
      className="pl-4 space-y-0.5 pt-0.5 pb-1"
      onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); if (!dropAt || dropAt.projectId !== project.id) setDropAt({ projectId: project.id, index: project.items.length }); } }}
      onDrop={(e) => drop(e, project.id, dropAt?.projectId === project.id ? dropAt.index : project.items.length)}
      data-setlist={project.name}
    >
      {project.items.length === 0 && (
        <div className={`px-2 py-2 text-[10px] leading-snug rounded border border-dashed ${dropAt?.projectId === project.id ? 'border-pink-500 text-pink-300' : 'border-white/10 text-neutral-500'}`}>
          Drag songs, media or verses here. Right-click the project to add a section header.
        </div>
      )}
      {project.items.map((item, index) => {
        const line = dropAt?.projectId === project.id && dropAt.index === index;
        const dragProps = {
          draggable: true,
          onDragStart: (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.setData(DRAG_ITEM, JSON.stringify({ projectId: project.id, itemId: item.id })); e.dataTransfer.effectAllowed = 'copyMove'; },
          onDragEnd: () => setDropAt(null),
          onDragOver: (e: React.DragEvent) => rowDragOver(e, project.id, index),
          // Where the pointer is now: the upper half of a row drops before it, the lower half after it
          onDrop: (e: React.DragEvent) => { const r = e.currentTarget.getBoundingClientRect(); drop(e, project.id, e.clientY < r.top + r.height / 2 ? index : index + 1); },
          onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, kind: 'item', projectId: project.id, itemId: item.id }); },
        };
        return (
          <React.Fragment key={item.id}>
            {/* The drop line takes no space, so the rows never move under the pointer */}
            {line && <div className="relative h-0 !mt-0 pointer-events-none" data-drop-line><div className="absolute inset-x-1 -top-px h-0.5 rounded bg-pink-500" /></div>}
            {item.type === 'header' ? (
              <div {...dragProps} data-setlist-row={item.title} className="pt-2 pb-0.5 px-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5 cursor-grab">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.headerColor || '#ec4899' }} />
                <span className="truncate">{item.title}</span>
              </div>
            ) : (() => {
              const Icon = itemIcon(item);
              const active = setlistOpen && project.id === state.activeId && activeItemId === item.id;
              return (
                <div
                  {...dragProps}
                  data-setlist-row={item.title}
                  onClick={() => onOpenItem(project.id, item, false)}
                  onDoubleClick={() => onOpenItem(project.id, item, true)}
                  title="Click to open it in Preview · double-click to send it to the screens"
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${active ? 'bg-pink-500/20 text-white font-medium' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Icon size={12} className={active ? 'text-pink-400 shrink-0' : 'text-neutral-500 shrink-0'} />
                  <span className="truncate">{item.title}</span>
                </div>
              );
            })()}
          </React.Fragment>
        );
      })}
      {dropAt?.projectId === project.id && dropAt.index === project.items.length && project.items.length > 0 && <div className="relative h-0 !mt-0 pointer-events-none" data-drop-line><div className="absolute inset-x-1 -top-px h-0.5 rounded bg-pink-500" /></div>}
    </div>
  );

  return (
    <div className="space-y-1" data-projects-panel onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setDropAt(null); setFolderDrop(null); } }}>
      {folders.map(folder => {
        const projects = inFolder(folder);
        if (folder === UNLABELED && projects.length === 0 && state.folders.length > 0) return null;
        return (
          <div key={folder}>
            <div
              className={`text-[10px] uppercase font-bold px-2 pt-1 pb-0.5 rounded flex items-center gap-1.5 ${folderDrop === folder ? 'bg-pink-500/15 text-pink-300' : 'text-neutral-500'}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_PROJECT)) { e.preventDefault(); setFolderDrop(folder); } }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(DRAG_PROJECT);
                setFolderDrop(null);
                if (id) onChange({ ...state, projects: state.projects.map(p => p.id === id ? { ...p, folder: folder === UNLABELED ? undefined : folder } : p) });
              }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'folder', folder }); }}
              data-project-folder={folder}
            >
              {folder !== UNLABELED && <FolderOpen size={11} />}
              <span className="truncate">{folder}</span>
            </div>
            {projects.map(project => {
              const open = isOpen(project.id);
              const current = project.id === state.activeId;
              const projectDropLine = dropAt?.projectId === project.id;
              return (
                <div key={project.id}>
                  <div
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData(DRAG_PROJECT, project.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => onOpenProject(project.id)}
                    onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); setDropAt({ projectId: project.id, index: project.items.length }); } }}
                    onDrop={(e) => drop(e, project.id, project.items.length)}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'project', projectId: project.id }); }}
                    data-project={project.name}
                    className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg cursor-pointer transition-all border-l-2 ${
                      projectDropLine && !open ? 'bg-pink-500/20 border-pink-500 text-white'
                        : current && setlistOpen ? 'bg-pink-500/15 border-pink-500 text-pink-300 font-semibold'
                        : current ? 'bg-white/5 border-pink-500/50 text-neutral-200'
                        : 'hover:bg-white/5 text-neutral-400 border-transparent'
                    }`}
                    title="Click to open · drag songs, media or verses onto it · right-click for more"
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (current) return; setExpanded(prev => { const n = new Set(prev); if (n.has(project.id)) n.delete(project.id); else n.add(project.id); return n; }); }}
                      className="text-neutral-500 hover:text-white shrink-0"
                    >
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                    <Folder size={14} className={current ? 'text-pink-400 shrink-0' : 'text-neutral-500 shrink-0'} />
                    <span className="text-xs truncate">{project.name}</span>
                  </div>
                  {open && renderItems(project)}
                </div>
              );
            })}
          </div>
        );
      })}

      {menu && (
        <div data-projects-menu className="fixed z-[170] w-52 py-1 rounded-lg border border-white/10 bg-[#18181b] shadow-2xl" style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 200) }}>
          {menu.kind === 'item' && (() => {
            const project = state.projects.find(p => p.id === menu.projectId);
            const index = project?.items.findIndex(i => i.id === menu.itemId) ?? -1;
            const item = project?.items[index];
            if (!project || !item) return null;
            if (item.type === 'header') return (
              <>
                <button className={menuItem} onClick={runMenu(async () => { const title = await askName('Section header', item.title); if (title) setProject(project.id, p => ({ ...p, items: p.items.map(i => i.id === item.id ? { ...i, title } : i) })); })}><Pencil size={13} className="text-neutral-400" /> Rename section</button>
                <button className={menuItem} onClick={runMenu(() => addHeader(project.id, blockOf(project.items, index)[1] + 1))}><Heading size={13} className="text-neutral-400" /> Add section header below…</button>
                <div className="my-1 border-t border-white/10" />
                <button className={`${menuItem} text-red-300`} onClick={runMenu(() => setProject(project.id, p => ({ ...p, items: p.items.filter(i => i.id !== item.id) })))}><Trash size={13} /> Remove (keep its items)</button>
              </>
            );
            return <button className={`${menuItem} text-red-300`} onClick={runMenu(() => setProject(project.id, p => ({ ...p, items: p.items.filter(i => i.id !== item.id) })))}><Trash size={13} /> Remove</button>;
          })()}
          {menu.kind === 'project' && (() => {
            const project = state.projects.find(p => p.id === menu.projectId);
            if (!project) return null;
            return (
              <>
                <button className={menuItem} onClick={runMenu(() => onOpenProject(project.id))}><FolderOpen size={13} className="text-neutral-400" /> Open</button>
                <button className={menuItem} onClick={runMenu(() => addHeader(project.id))}><Heading size={13} className="text-neutral-400" /> Add section header…</button>
                <button className={menuItem} onClick={runMenu(async () => { const name = await askName('Project name', project.name); if (name) setProject(project.id, p => ({ ...p, name })); })}><Pencil size={13} className="text-neutral-400" /> Rename</button>
                <div className="my-1 border-t border-white/10" />
                <button
                  className={`${menuItem} text-red-300`}
                  onClick={runMenu(async () => {
                    if (!(await askConfirm(`Delete the project "${project.name}" and its setlist? Songs and media stay in the library.`, { okLabel: 'Delete', danger: true }))) return;
                    const rest = state.projects.filter(p => p.id !== project.id);
                    const projects = rest.length ? rest : [{ id: `project-${Date.now().toString(36)}`, name: 'New project', date: new Date().toLocaleDateString(), items: [] }];
                    onChange({ ...state, projects, activeId: state.activeId === project.id ? projects[0].id : state.activeId });
                  })}
                >
                  <Trash size={13} /> Delete project
                </button>
              </>
            );
          })()}
          {menu.kind === 'folder' && (
            <>
              <button className={menuItem} onClick={runMenu(() => onNewProject(menu.folder === UNLABELED ? undefined : menu.folder))}><Plus size={13} className="text-neutral-400" /> New project here</button>
              {menu.folder !== UNLABELED && (
                <>
                  <button className={menuItem} onClick={runMenu(async () => {
                    const name = await askName('Folder name', menu.folder);
                    if (!name || name === menu.folder || state.folders.includes(name)) return;
                    onChange({ ...state, folders: state.folders.map(f => f === menu.folder ? name : f), projects: state.projects.map(p => p.folder === menu.folder ? { ...p, folder: name } : p) });
                  })}><Pencil size={13} className="text-neutral-400" /> Rename folder</button>
                  <button className={`${menuItem} text-red-300`} onClick={runMenu(() => onChange({ ...state, folders: state.folders.filter(f => f !== menu.folder), projects: state.projects.map(p => p.folder === menu.folder ? { ...p, folder: undefined } : p) }))}><Trash size={13} /> Delete folder (keep its projects)</button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
