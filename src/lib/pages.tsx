/// <reference types="vite/client" />
/**
 * PDF and PowerPoint pages as slides: each page becomes a picture, shown on the screens exactly as it looks in the
 * file. The pictures are kept in FlowShow's own database (like stage media), so every window can show them, they
 * survive restarts and are in backups. PowerPoint files are first turned into a PDF by PowerPoint or LibreOffice
 * on this computer (src-tauri: convert_to_pdf).
 */
import React from 'react';
import { motion } from 'motion/react';
import { saveStageMedia, useStageMediaUrl } from './stageMedia';
import { isTauri } from './tauriScreen';

/** A slide that is a page of a PDF or PowerPoint */
export interface SlidePage {
  /** The page's picture in the database (stageMedia) */
  storedId: string;
  /** e.g. "Sermon.pdf · page 3" */
  name: string;
}

/** Pages are made this wide at most (sharp on a 1080p screen, and on 4K text stays readable) */
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 1440;

/** Every page of a PDF as a JPEG picture. onPage(done, total) reports progress. */
export async function pdfToPictures(data: ArrayBuffer, onPage?: (done: number, total: number) => void): Promise<Blob[]> {
  // pdf.js loads only when a PDF is imported (it's big)
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const pictures: Blob[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_WIDTH / base.width, MAX_HEIGHT / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // White behind the page (PDF pages are white paper unless they paint their own background)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('could not make the picture')), 'image/jpeg', 0.92));
      pictures.push(blob);
      page.cleanup();
      onPage?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pictures;
}

/** Keep the pictures; one SlidePage per page */
export async function storePages(title: string, pictures: Blob[]): Promise<SlidePage[]> {
  const pages: SlidePage[] = [];
  for (let i = 0; i < pictures.length; i++) {
    const name = `${title} · page ${i + 1}`;
    const stored = await saveStageMedia(new File([pictures[i]], `${name}.jpg`, { type: 'image/jpeg' }));
    pages.push({ storedId: stored.id, name });
  }
  return pages;
}

export const isPdfFile = (name: string) => /\.pdf$/i.test(name);
export const isPowerPointFile = (name: string) => /\.(pptx|ppt|pptm|ppsx|pps|odp)$/i.test(name);
export const LIBREOFFICE_URL = 'https://www.libreoffice.org/download/download-libreoffice/';

/** No PowerPoint and no LibreOffice on this computer: a PowerPoint can't be turned into pictures */
export class NoConverterError extends Error {
  constructor() { super('NO_CONVERTER'); this.name = 'NoConverterError'; }
}

/** A PowerPoint (or OpenDocument) file → PDF bytes, made by PowerPoint or LibreOffice on this computer */
export async function powerPointToPdf(file: File): Promise<ArrayBuffer> {
  if (!isTauri()) throw new NoConverterError();
  const { invoke } = await import('@tauri-apps/api/core');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await invoke<ArrayBuffer>('convert_to_pdf', bytes, { headers: { 'file-name': encodeURIComponent(file.name) } });
  } catch (e) {
    if (String(e).includes('NO_CONVERTER')) throw new NoConverterError();
    throw new Error(String(e));
  }
}

/** A page on a screen: the whole page, as large as fits, black around it. Fades with the words when cleared. */
export function PagePicture({ page, cleared = false, fadeSeconds = 0.6 }: { page: SlidePage; cleared?: boolean; fadeSeconds?: number }) {
  const url = useStageMediaUrl(page.storedId);
  return (
    <motion.div
      className="absolute inset-0 z-10 pointer-events-none"
      initial={false}
      animate={{ opacity: cleared ? 0 : 1 }}
      transition={{ duration: fadeSeconds, ease: 'easeOut' }}
      data-slide-page={page.name}
    >
      {url && <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain" />}
    </motion.div>
  );
}

/** A page in a slide thumbnail (grid, setlist) */
export function PageThumb({ page }: { page: SlidePage }) {
  const url = useStageMediaUrl(page.storedId);
  return url
    ? <img src={url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" data-page-thumb />
    : <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500">{page.name}</div>;
}
