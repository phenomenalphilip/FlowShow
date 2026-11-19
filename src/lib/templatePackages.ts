/**
 * Template packages (.fstemplates): templates you can give or sell to other FlowShow users.
 *
 * A package is one JSON file: who made it (name, author, version, licence…), its templates, the fonts they use
 * (optionally with the font files, for fonts the author may share), and a SHA-256 checksum so a damaged or
 * altered file is refused. Installing gives each template a stable id from the package, so installing a newer
 * version of the same package updates its templates instead of adding copies.
 */
import { PresentationTemplate, getTemplateById, saveTemplate } from './templates';
import { FONT_OPTIONS, primaryFont } from './fonts';
import { StoredFont, installFonts } from './fontStore';

export const PACKAGE_EXTENSION = '.fstemplates';
const FORMAT = 'flowshow-templates';
const FORMAT_VERSION = 1;
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;
const MAX_TEMPLATES = 500;

export interface PackageInfo {
  id: string;
  name: string;
  author: string;
  version: string;
  description?: string;
  /** The terms the templates come with (e.g. "For use by one church", "CC BY 4.0") */
  license?: string;
  website?: string;
  createdAt: string;
}

export interface PackageFont { family: string; file?: { name: string; type: string; data: string } }

export interface TemplatePackage {
  format: typeof FORMAT;
  formatVersion: number;
  package: PackageInfo;
  templates: PresentationTemplate[];
  fonts: PackageFont[];
  /** SHA-256 (hex) of the package, templates and fonts */
  checksum: string;
}

/** Where an installed template came from */
export interface TemplateOrigin { packageId: string; packageName: string; author: string; version: string; originalId: string }

const sha256 = async (text: string) => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};
const body = (p: Pick<TemplatePackage, 'package' | 'templates' | 'fonts'>) => JSON.stringify([p.package, p.templates, p.fonts]);
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** The fonts a template uses (first family of each text style) */
export function fontsUsedBy(templates: PresentationTemplate[]): string[] {
  const names = new Set<string>();
  templates.forEach(t => [t.styles.global?.fontFamily, t.styles.sourceGlobal?.fontFamily].forEach(f => {
    const name = primaryFont(f as string | undefined);
    if (name) names.add(name);
  }));
  return [...names].sort((a, b) => a.localeCompare(b));
}
/** Fonts every FlowShow has */
export const isFlowShowFont = (family: string) => FONT_OPTIONS.some(f => primaryFont(f.value) === family) || ['Georgia', 'sans-serif', 'serif'].includes(family);

// ─── Exporting ───
export async function buildPackage(
  info: Omit<PackageInfo, 'id' | 'createdAt'> & { id?: string },
  templates: PresentationTemplate[],
  fontFiles: { family: string; file: File }[],
): Promise<Blob> {
  const pkg: PackageInfo = { ...info, id: info.id || crypto.randomUUID(), createdAt: new Date().toISOString() };
  const cleanTemplates = templates.map(t => {
    const { isCustom: _custom, ...rest } = t as PresentationTemplate & { origin?: TemplateOrigin };
    return { ...rest, id: (t as any).origin?.originalId || t.id };
  });
  const fonts: PackageFont[] = [];
  for (const family of fontsUsedBy(templates).filter(f => !isFlowShowFont(f))) {
    const attached = fontFiles.find(f => f.family === family);
    fonts.push(attached
      ? { family, file: { name: attached.file.name, type: attached.file.type || 'font/ttf', data: toBase64(new Uint8Array(await attached.file.arrayBuffer())) } }
      : { family });
  }
  const content = { package: pkg, templates: cleanTemplates as PresentationTemplate[], fonts };
  const file: TemplatePackage = { format: FORMAT, formatVersion: FORMAT_VERSION, ...content, checksum: await sha256(body(content)) };
  return new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
}

// ─── Reading and checking ───
const SAFE_VALUE = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && v.length < 500 && !/url\s*\(|@import|expression\s*\(|javascript:|<\s*script/i.test(v));
const cleanStyle = (style: unknown): Record<string, string | number> | undefined => {
  if (!style || typeof style !== 'object') return undefined;
  const out: Record<string, string | number> = {};
  Object.entries(style as Record<string, unknown>).forEach(([k, v]) => { if (/^[a-zA-Z-]{1,40}$/.test(k) && SAFE_VALUE(v)) out[k] = v as string | number; });
  return out;
};
const cleanRect = (r: any) => r && ['x', 'y', 'width', 'height'].every(k => typeof r[k] === 'number' && r[k] >= -1 && r[k] <= 2)
  ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined;

function cleanTemplate(t: any): PresentationTemplate | null {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.name !== 'string' || !t.styles || !t.animation?.type) return null;
  const lines: Record<number, any> = {};
  Object.entries(t.styles.lines || {}).forEach(([k, v]) => { const n = Number(k); if (Number.isInteger(n) && n >= 0 && n < 50) lines[n] = cleanStyle(v); });
  const anim: any = {};
  Object.entries(t.animation).forEach(([k, v]) => { if (k === 'exit' && v && typeof v === 'object') anim.exit = { type: String((v as any).type), duration: Number((v as any).duration) || undefined }; else if (SAFE_VALUE(v) || typeof v === 'boolean') anim[k] = v; });
  const vAlign = (v: unknown) => (v === 'top' || v === 'middle' || v === 'bottom' ? v : undefined);
  return {
    id: t.id.slice(0, 80),
    name: t.name.slice(0, 80),
    category: ['worship', 'high-energy', 'broadcast', 'scripture', 'declaration', 'modern', 'custom'].includes(t.category) ? t.category : 'custom',
    tagline: String(t.tagline || '').slice(0, 120),
    description: String(t.description || '').slice(0, 1000),
    badge: t.badge ? String(t.badge).slice(0, 20) : undefined,
    backgroundPreview: SAFE_VALUE(t.backgroundPreview) ? t.backgroundPreview : undefined,
    styles: {
      global: cleanStyle(t.styles.global) as any,
      lines,
      layout: cleanRect(t.styles.layout),
      sourceGlobal: cleanStyle(t.styles.sourceGlobal) as any,
      sourceLayout: cleanRect(t.styles.sourceLayout),
      verticalAlign: vAlign(t.styles.verticalAlign),
      sourceVerticalAlign: vAlign(t.styles.sourceVerticalAlign),
    },
    animation: anim,
  };
}

/** Read a package file; throws a message that can be shown as it is */
export async function readPackage(file: File): Promise<TemplatePackage> {
  if (file.size > MAX_PACKAGE_BYTES) throw new Error('This file is too large to be a template package.');
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error(`“${file.name}” isn't a FlowShow template package.`); }
  if (data?.format !== FORMAT || !Array.isArray(data.templates) || !data.package) throw new Error(`“${file.name}” isn't a FlowShow template package.`);
  if (data.formatVersion > FORMAT_VERSION) throw new Error('This package was made with a newer FlowShow. Update FlowShow to install it.');
  if (data.checksum !== await sha256(body(data))) throw new Error('This package is damaged or was changed after it was made, so it was not installed.');
  const templates = data.templates.slice(0, MAX_TEMPLATES).map(cleanTemplate).filter(Boolean) as PresentationTemplate[];
  if (!templates.length) throw new Error('This package has no templates FlowShow can use.');
  const p = data.package;
  return {
    format: FORMAT, formatVersion: data.formatVersion, checksum: data.checksum, templates,
    package: { id: String(p.id || '').slice(0, 64) || 'package', name: String(p.name || 'Templates').slice(0, 80), author: String(p.author || 'Unknown').slice(0, 80), version: String(p.version || '1.0').slice(0, 20), description: p.description ? String(p.description).slice(0, 2000) : undefined, license: p.license ? String(p.license).slice(0, 2000) : undefined, website: /^https:\/\//.test(p.website || '') ? String(p.website).slice(0, 200) : undefined, createdAt: String(p.createdAt || '') },
    fonts: (Array.isArray(data.fonts) ? data.fonts : []).filter((f: any) => typeof f?.family === 'string').map((f: any) => ({
      family: f.family.slice(0, 80),
      file: f.file && typeof f.file.data === 'string' && /^font\/|application\/(font|x-font|octet)/.test(f.file.type || 'font/ttf') ? { name: String(f.file.name).slice(0, 120), type: f.file.type || 'font/ttf', data: f.file.data } : undefined,
    })),
  };
}

/** The id an installed template gets: the same for every version of the same package */
export const installedId = (pkg: PackageInfo, originalId: string) => `pkg_${pkg.id.replace(/[^\w-]/g, '')}_${originalId.replace(/[^\w-]/g, '')}`;

/** Install a package: templates (new or updated) and any fonts it carries. Returns how many were new/updated. */
export async function installPackage(pkg: TemplatePackage): Promise<{ added: number; updated: number; fonts: number }> {
  let added = 0, updated = 0;
  for (const t of pkg.templates) {
    const id = installedId(pkg.package, t.id);
    if (getTemplateById(id)) updated++; else added++;
    const origin: TemplateOrigin = { packageId: pkg.package.id, packageName: pkg.package.name, author: pkg.package.author, version: pkg.package.version, originalId: t.id };
    await saveTemplate({ ...t, id, isCustom: true, badge: t.badge || pkg.package.name.slice(0, 14), origin } as PresentationTemplate);
  }
  const fonts: StoredFont[] = pkg.fonts.filter(f => f.file).map(f => ({ family: f.family, fileName: f.file!.name, type: f.file!.type, data: f.file!.data }));
  await installFonts(fonts);
  return { added, updated, fonts: fonts.length };
}
