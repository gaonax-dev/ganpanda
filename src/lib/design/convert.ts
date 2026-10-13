// 디자인 파일 → 페이지 이미지 (3차). .ai/.pdf 는 pdf.js(PDF 호환 저장 필요), .svg/.png/.jpg 는 한 페이지.
import { sourceKind, type SourceKind } from '../core/design';

/** 변환된 페이지 (PNG) */
export interface RenderedPage { blob: Blob; w: number; h: number }

/** 긴 변 최대 px (너무 큰 아트보드는 줄여서 저장) */
export const PAGE_MAX_SIDE = 2048;

export class ConvertError extends Error {
  constructor(public code: 'not-pdf-compatible' | 'unsupported' | 'render-failed', message: string) { super(message); }
}

export async function convertFile(file: File): Promise<{ kind: SourceKind; pages: RenderedPage[] }> {
  const kind = sourceKind(file.name, file.type);
  if (!kind) throw new ConvertError('unsupported', '지원하지 않는 파일입니다 (ai·pdf·svg·png·jpg).');
  if (kind === 'pdf') return { kind, pages: await renderPdf(file) };
  return { kind, pages: [await renderImage(file)] };
}

async function renderPdf(file: File): Promise<RenderedPage[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // 일러스트레이터 "PDF 호환" 저장이면 파일 앞부분에 %PDF 가 있다
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF')) throw new ConvertError('not-pdf-compatible', '이 .ai 파일은 PDF 호환으로 저장되지 않았습니다. 일러스트레이터에서 "PDF 호환 파일 만들기"를 켜고 다시 저장해 주세요.');
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: bytes });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new ConvertError('render-failed', `파일을 읽지 못했습니다: ${e instanceof Error ? e.message : e}`);
  }
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, PAGE_MAX_SIDE / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // 투명 배경 → 흰색
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    pages.push({ blob: await toBlob(canvas), w: canvas.width, h: canvas.height });
  }
  await task.destroy();
  return pages;
}

async function renderImage(file: File): Promise<RenderedPage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new ConvertError('render-failed', '이미지를 읽지 못했습니다.')); i.src = url; });
    const w = img.naturalWidth || 1000, h = img.naturalHeight || 1000;
    const scale = Math.min(1, PAGE_MAX_SIDE / Math.max(w, h));
    if (scale === 1 && file.type === 'image/png') return { blob: file, w, h };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { blob: await toBlob(canvas), w: canvas.width, h: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new ConvertError('render-failed', '이미지 저장 실패'))), 'image/png'));
