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
  headerColor?: string;
  templateId?: string;
}

export interface ServiceSetlist {
  id: string;
  name: string;
  date: string;
  items: SetlistItem[];
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
