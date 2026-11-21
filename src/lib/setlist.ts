import { get, set } from 'idb-keyval';
import { SlideDefinition } from '../App';

export interface SetlistItem {
  id: string;
  type: 'song' | 'scripture' | 'media' | 'header';
  title: string;
  subtitle?: string;
  songId?: string;
  slides?: SlideDefinition[];
  backgroundUrl?: string;
  mediaType?: 'image' | 'video';
  /** A picture or video from an added folder: found again there when played (its URL only lasts a session) */
  mediaRef?: { folder: string; path: string[] };
  /** The video's path on this computer (desktop app), to know if it is a playback video */
  mediaPath?: string;
  headerColor?: string;
  templateId?: string;
}

export interface ServiceSetlist {
  id: string;
  name: string;
  date: string;
  items: SetlistItem[];
  /** The folder it is in (none = Unlabeled) */
  folder?: string;
}

const SETLIST_STORAGE_KEY = 'flowshow_current_setlist';
const ALL_SETLISTS_KEY = 'flowshow_all_setlists';

export const DEFAULT_SAMPLE_SETLIST: ServiceSetlist = {
  id: 'setlist-default',
  name: 'Sunday Morning Service',
  date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  items: [
    {
      id: 'item-0',
      type: 'song',
      title: 'Welcome',
      subtitle: '1 Slide',
      slides: [
        { id: 'welcome-slide-1', text: 'Welcome!', type: 'lyrics' }
      ]
    },
    {
      id: 'item-1',
      type: 'header',
      title: 'Praise & Worship',
      headerColor: '#ec4899'
    },
    {
      id: 'item-2',
      type: 'song',
      title: 'Way Maker',
      subtitle: 'Sinach • 4 Slides',
      songId: 'song-1'
    },
    {
      id: 'item-3',
      type: 'song',
      title: 'Amazing Grace',
      subtitle: 'John Newton • 5 Slides',
      songId: 'song-2'
    },
    {
      id: 'item-4',
      type: 'header',
      title: 'Scripture Reading',
      headerColor: '#10b981'
    },
    {
      id: 'item-5',
      type: 'scripture',
      title: 'John 3:16-17',
      subtitle: 'King James Version',
      slides: [
        {
          id: 'scrip-1',
          text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
          source: 'John 3:16',
          type: 'scripture'
        },
        {
          id: 'scrip-2',
          text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
          source: 'John 3:17',
          type: 'scripture'
        }
      ]
    },
    {
      id: 'item-6',
      type: 'header',
      title: 'Closing Response',
      headerColor: '#8b5cf6'
    },
    {
      id: 'item-7',
      type: 'song',
      title: 'Goodness of God',
      subtitle: 'Bethel Music • 6 Slides',
      songId: 'song-3'
    }
  ]
};

export async function loadCurrentSetlist(): Promise<ServiceSetlist> {
  try {
    const saved = await get(SETLIST_STORAGE_KEY);
    if (saved && saved.items) return saved;
  } catch (err) {
    console.warn('Could not load setlist from IndexedDB', err);
  }
  return DEFAULT_SAMPLE_SETLIST;
}

export async function saveCurrentSetlist(setlist: ServiceSetlist): Promise<void> {
  try {
    await set(SETLIST_STORAGE_KEY, setlist);
  } catch (err) {
    console.warn('Could not save setlist to IndexedDB', err);
  }
}

// ─── Projects: several setlists (one per service), grouped in folders ───────────────

/** Every project, the one open now, and the folders made to group them */
export interface ProjectsState {
  projects: ServiceSetlist[];
  activeId: string;
  /** Folders made with + → Folder (a project's `folder` names one; none = Unlabeled) */
  folders: string[];
}

/** The projects; the first time, the setlist saved before projects existed becomes the first project */
export async function loadProjects(): Promise<ProjectsState> {
  try {
    const saved = await get(ALL_SETLISTS_KEY) as ProjectsState | undefined;
    if (saved?.projects?.length) {
      return { ...saved, folders: saved.folders || [], activeId: saved.projects.some(p => p.id === saved.activeId) ? saved.activeId : saved.projects[0].id };
    }
  } catch (err) {
    console.warn('Could not load projects', err);
  }
  const first = await loadCurrentSetlist();
  return { projects: [first], activeId: first.id, folders: [] };
}

export async function saveProjects(state: ProjectsState): Promise<void> {
  try {
    await set(ALL_SETLISTS_KEY, state);
  } catch (err) {
    console.warn('Could not save projects', err);
  }
}

/** Colours given to new section headers in turn */
export const HEADER_COLORS = ['#ec4899', '#10b981', '#8b5cf6', '#f59e0b', '#38bdf8', '#ef4444'];
