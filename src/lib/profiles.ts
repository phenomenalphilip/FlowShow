/**
 * Profiles: a whole screen setup (outputs, styles, stage layouts) saved under a name, e.g. "Main church" and
 * "Youth camp venue". One profile is active; its settings are the app's settings. Songs, Bibles and templates are
 * shared by every profile. A profile can be exported to a file that also carries the templates it uses.
 */
import { get, set } from 'idb-keyval';
import { PresentationTemplate, STARTER_TEMPLATES, getTemplateById, saveTemplate } from './templates';

export interface ProfileRecord {
  id: string;
  name: string;
  /** The saved settings of an inactive profile (the active one's live in the app) */
  settings?: any;
  createdAt: string;
  updatedAt: string;
}

const KEY = 'flowshow_profiles';
const FORMAT = 'flowshow-profile';
export const PROFILE_EXTENSION = '.flowshow-profile';

export async function loadProfiles(): Promise<{ profiles: ProfileRecord[]; activeId: string }> {
  try {
    const saved = await get<{ profiles: ProfileRecord[]; activeId: string }>(KEY);
    if (saved?.profiles?.length && saved.profiles.some(p => p.id === saved.activeId)) return saved;
  } catch { /* storage blocked */ }
  const now = new Date().toISOString();
  return { profiles: [{ id: 'main', name: 'Main', createdAt: now, updatedAt: now }], activeId: 'main' };
}
export const saveProfiles = (profiles: ProfileRecord[], activeId: string) => set(KEY, { profiles, activeId }).catch(() => {});

/** Template ids a set of settings points at (screen defaults, scripture/declaration templates, style templates) */
export function templateIdsIn(settings: any): string[] {
  const ids = new Set<string>();
  (settings?.outputs || []).forEach((o: any) => [o.defaultTemplateId, o.scriptureTemplateId, o.declarationTemplateId].forEach(id => id && ids.add(id)));
  (settings?.styles || []).forEach((s: any) => [s.lyricsTemplateId, s.scriptureTemplateId, s.declarationTemplateId].forEach(id => id && ids.add(id)));
  return [...ids].filter(id => id !== 'none');
}

/** A profile file: its settings and every template they use that isn't a ready-made one as shipped */
export function buildProfileFile(name: string, settings: any): Blob {
  const templates = templateIdsIn(settings)
    .map(id => getTemplateById(id))
    .filter((t): t is PresentationTemplate => !!t)
    .filter(t => {
      const starter = STARTER_TEMPLATES.find(s => s.id === t.id);
      return !starter || JSON.stringify(starter) !== JSON.stringify(t);
    });
  const file = { format: FORMAT, formatVersion: 1, name, exportedAt: new Date().toISOString(), settings, templates };
  return new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
}

/**
 * Read a profile file and install its templates. A template is added when it isn't here yet; when this computer
 * has a different template with the same id (or it is a changed ready-made one), the profile's version is added as a
 * copy and the profile's settings point at the copy, so nothing already here is changed.
 */
export async function readProfileFile(file: File): Promise<{ name: string; settings: any; templatesAdded: number }> {
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error(`“${file.name}” isn't a FlowShow profile.`); }
  if (data?.format !== FORMAT || !data.settings || !Array.isArray(data.settings.outputs)) throw new Error(`“${file.name}” isn't a FlowShow profile.`);
  const remap = new Map<string, string>();
  let templatesAdded = 0;
  for (const t of (Array.isArray(data.templates) ? data.templates : []) as PresentationTemplate[]) {
    if (!t?.id || !t.styles || !t.animation) continue;
    const here = getTemplateById(t.id);
    const isStarter = STARTER_TEMPLATES.some(s => s.id === t.id);
    if (here && JSON.stringify(here) === JSON.stringify(t)) continue;
    const id = here || isStarter ? `${t.id}-${Date.now().toString(36)}${templatesAdded}` : t.id;
    if (id !== t.id) remap.set(t.id, id);
    await saveTemplate({ ...t, id, isCustom: true, name: id !== t.id ? `${t.name} (${data.name || 'imported'})` : t.name });
    templatesAdded++;
  }
  const fix = (id?: string) => (id && remap.get(id)) || id;
  const settings = {
    ...data.settings,
    outputs: data.settings.outputs.map((o: any) => ({ ...o, defaultTemplateId: fix(o.defaultTemplateId), scriptureTemplateId: fix(o.scriptureTemplateId), declarationTemplateId: fix(o.declarationTemplateId) })),
    styles: (data.settings.styles || []).map((s: any) => ({ ...s, lyricsTemplateId: fix(s.lyricsTemplateId), scriptureTemplateId: fix(s.scriptureTemplateId), declarationTemplateId: fix(s.declarationTemplateId) })),
  };
  return { name: String(data.name || file.name.replace(/\.[^.]+$/, '')).slice(0, 60), settings, templatesAdded };
}
