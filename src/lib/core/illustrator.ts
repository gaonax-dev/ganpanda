// 일러스트레이터 왕복 (2026-11-05 사용자: "대지를 다시 구성한다는건 이후에 일러스트에서 내보내고 이것을 간판다에서 연결하는 악순을 피하려는 거지" →
// "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야" → "현재는 최신버전").
// 간판다 → 일러스트: 카드 배치(mm)를 데이터로 담은 스크립트(.jsx, src/lib/illustrator/ganpanda.jsx)가 일러스트 안에서 사인물마다 대지를 만든다.
// 일러스트 → 간판다: 스크립트가 대지 순서대로 사인물 id 를 문서 XMP(ganpanda:artboards)에 적어 .ai(PDF 호환)로 저장 → 올리면 자동 연결. → docs/features/illustrator.md

export const ILLUSTRATOR_FORMAT = 'ganpanda-illustrator';
export const XMP_NS = 'http://ns.ganpanda.co.kr/1.0/';
/** 1:1 로 만들 수 있는 전체 크기 (mm) — 일러스트 대지·캔버스 한도 약 5,779mm 에 여유 */
export const ILLUSTRATOR_MAX_MM = 5500;

export interface IllustratorCardIn {
  id: string; name: string;
  /** 배치 (mm, 카드·리스트 좌표) */
  x: number; y: number; w: number; h: number;
  /** 카드 얼굴(사진을 펼친 그림) data URL */
  face?: string;
  /** 입힌 디자인: 잘라낸 영역 그림(data URL) — 벡터 원본(SVG)이 있으면 svg + 페이지 안 잘라낸 영역(비율 0~1) */
  design?: { png?: string; svg?: string; crop?: { x: number; y: number; w: number; h: number } };
  /** 구성 요소 하위 레이어 (2026-11-05): 입체(vector — 채널·스카시, SVG 로 돌아옴) · 인쇄(print — 시트, PNG). 바탕(인쇄)은 늘 만든다 */
  parts?: { id: string; label: string; mode: 'vector' | 'print' }[];
}
export interface IllustratorPackage {
  format: typeof ILLUSTRATOR_FORMAT; version: 1;
  project: string;
  /** 일러스트에 그릴 축척 (1 = 실물, 0.1 = 1:10) */
  scale: number;
  /** 전체 크기 (mm, 실물) */
  width: number; height: number;
  cards: IllustratorCardIn[];
}

/** 전체 크기에 맞는 축척 — 1:1, 넘으면 1:10, 그래도 넘으면 1:100 */
export function illustratorScale(w: number, h: number): number {
  const m = Math.max(w, h);
  return m <= ILLUSTRATOR_MAX_MM ? 1 : m <= ILLUSTRATOR_MAX_MM * 10 ? 0.1 : 0.01;
}

/** 카드들 → 패키지: 왼쪽 위 카드를 원점으로 */
export function illustratorPackage(input: { project: string; cards: IllustratorCardIn[] }): IllustratorPackage {
  const cs = input.cards;
  const x0 = cs.length ? Math.min(...cs.map((c) => c.x)) : 0, y0 = cs.length ? Math.min(...cs.map((c) => c.y)) : 0;
  const width = cs.length ? Math.max(...cs.map((c) => c.x + c.w)) - x0 : 0, height = cs.length ? Math.max(...cs.map((c) => c.y + c.h)) - y0 : 0;
  return { format: ILLUSTRATOR_FORMAT, version: 1, project: input.project, scale: illustratorScale(width, height), width, height, cards: cs.map((c) => ({ ...c, x: c.x - x0, y: c.y - y0 })) };
}

/** 대지 이름 = "이름 #id" — 되돌아올 때 이 id 로 사인물을 찾는다 */
export const artboardName = (name: string, id: string) => `${name} #${id}`;
export function idFromArtboardName(s: string): string | null {
  const m = /#([A-Za-z0-9_-]+)\s*$/.exec(s);
  return m ? m[1] : null;
}

/** 저장한 .ai(PDF 호환)의 XMP 에서 대지 순서대로 사인물 id (ganpanda:artboards = "id|id||id", 빈 칸 = 간판다 대지 아님). 없으면 null */
export function xmpArtboardIds(xmp: string | null | undefined): (string | null)[] | null {
  if (!xmp) return null;
  const m = /<ganpanda:artboards>([^<]*)<\/ganpanda:artboards>/.exec(xmp) ?? /ganpanda:artboards="([^"]*)"/.exec(xmp);
  if (!m) return null;
  return m[1].split('|').map((s) => (s.trim() ? s.trim() : null));
}

/**
 * 올린 파일의 페이지(= 대지) ↔ 사인물. pages = 페이지 크기(mm), signs = 사인물 치수(mm).
 * XMP 짝(ids)이 있고 페이지 수가 같으면 그대로(없는 사인물은 뺀다). 아니면 크기로 — 1:1·1:10·1:100 중 맞는 축척(2% 또는 3mm 안), 같은 크기는 순서대로
 */
export function matchArtboards(pages: { w: number; h: number }[], signs: { id: string; w: number; h: number }[], ids: (string | null)[] | null): { page: number; id: string }[] {
  const known = new Set(signs.map((s) => s.id));
  if (ids && ids.length === pages.length) return ids.flatMap((id, page) => (id && known.has(id) ? [{ page, id }] : []));
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(3, 0.02 * Math.max(a, b));
  let best: { page: number; id: string }[] = [];
  for (const k of [1, 0.1, 0.01]) {
    const used = new Set<string>();
    const out: { page: number; id: string }[] = [];
    pages.forEach((p, page) => {
      const s = signs.find((x) => !used.has(x.id) && near(p.w, x.w * k) && near(p.h, x.h * k));
      if (s) { used.add(s.id); out.push({ page, id: s.id }); }
    });
    if (out.length > best.length) best = out;
  }
  return best;
}

/** 스크립트 앞에 데이터 한 줄 (JSON 리터럴은 ExtendScript 에서 그대로 객체 — 줄 구분 문자만 이스케이프) */
export function jsxWithData(template: string, data: unknown): string {
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const json = JSON.stringify(data).split(LS).join('\\u2028').split(PS).join('\\u2029');
  return `var GANPANDA_DATA = ${json};\n${template}`;
}
