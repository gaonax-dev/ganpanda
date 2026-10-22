// 단면 쌓기 (재료 조합 S1, 2026-10-22 설계 docs/features/material-stack.md): 사인물을 층으로 펼친다 — 2.5D 단면 그림과 아래 접이 속성이 같이 쓴다.
// 층 = 올린 곳 (사용자: "갈바 위에 체널과 아크릴스카시가 있다면 두개가 같은 층에 있다"): 프레임(몸통) = 1층, 프레임 면 위 = 2층, 그 구성 요소 위(시트 등) = 3층 …
// 가로 자리는 정면도 그대로(글자·그림 객체의 범위, 없으면 가로 전체). 깊이(z)는 뒤(프레임 뒷면 0)에서 앞으로 mm.
import type { SignObject, SignPart } from './model';
import { componentOf } from './components';
import { productById } from './catalog';
import { stackFromLegacy, stackMaterialLabel } from './stack';

export interface CsLayer { label: string; thickness: number; material: string }
export interface CsItem { part: SignPart; label: string; tier: number; x0: number; x1: number; y0: number; y1: number; z0: number; depth: number; layers: CsLayer[] }
export interface CsTier { n: number; summary: string; items: CsItem[] }
export interface CrossSection { width: number; height: number; frame: { label: string; depth: number } | null; tiers: CsTier[]; /** 층이 아닌 부속 (상단 조명·몰딩·지주·LED) */ extras: SignPart[] }

/** 부속(층 200 이상)은 단면의 층이 아니다 */
const isExtra = (p: SignPart) => componentOf(p.kind).layer >= 200;

function itemsRange(p: SignPart, w: number, h: number): { x0: number; x1: number; y0: number; y1: number } {
  if (!p.items.length) return { x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of p.items) {
    const iw = it.w ?? it.h * Math.max(1, [...(it.text ?? '').replace(/\s/g, '')].length || 1) * 0.9; // 글자 폭은 대략 (글자 수 × 높이)
    x0 = Math.min(x0, it.x - iw / 2); x1 = Math.max(x1, it.x + iw / 2);
    y0 = Math.min(y0, it.y - it.h / 2); y1 = Math.max(y1, it.y + it.h / 2);
  }
  const cl = (v: number, m: number) => Math.max(-m / 2, Math.min(m / 2, v));
  return { x0: cl(x0, w), x1: cl(x1, w), y0: cl(y0, h), y1: cl(y1, h) };
}

function layersOfPart(p: SignPart, o: SignObject): CsLayer[] {
  const c = componentOf(p.kind);
  if (p.kind === 'scashi') {
    const st = p.stack ?? stackFromLegacy(p.type, p.options);
    return st.map((l) => ({ label: stackMaterialLabel(l.material), thickness: l.thickness, material: l.material }));
  }
  return [{ label: c.typeLabel(p), thickness: c.depthMm(p, o), material: p.kind }];
}

/** parts: 펼친 구성 요소(partsOf, 없으면 o.parts). hasBody: 몸통(프레임)이 있는 분류인가 — 없으면(시트 분류 등) 1층부터 */
export function crossSection(o: SignObject, opt: { parts?: SignPart[]; hasBody?: boolean } = {}): CrossSection {
  const parts = opt.parts ?? o.parts ?? [];
  const width = o.widthMm || 1000, height = o.heightMm || 500;
  const hasBody = opt.hasBody ?? true;
  const frameDepth = hasBody ? (o.depthMm ?? 0) : 0;
  const frame = hasBody ? { label: productById(o.productId)?.name ?? '프레임', depth: frameDepth } : null;
  const base = hasBody ? 2 : 1;
  const layered = parts.filter((p) => !isExtra(p));
  const ids = new Set(layered.map((p) => p.id));
  const items = new Map<string, CsItem>();
  const place = (p: SignPart, seen: Set<string>): CsItem => {
    const got = items.get(p.id);
    if (got) return got;
    const hostId = p.on && p.on !== 'frame' && ids.has(p.on) && !seen.has(p.on) ? p.on : null;
    const host = hostId ? place(layered.find((x) => x.id === hostId)!, new Set([...seen, p.id])) : null;
    const layers = layersOfPart(p, o);
    const depth = layers.reduce((t, l) => t + (Number.isFinite(l.thickness) ? l.thickness : 0), 0);
    const r = itemsRange(p, width, height);
    const it: CsItem = { part: p, label: componentOf(p.kind).label, tier: host ? host.tier + 1 : base, ...(host && !p.items.length ? { x0: host.x0, x1: host.x1, y0: host.y0, y1: host.y1 } : r), z0: host ? host.z0 + host.depth : frameDepth, depth, layers };
    items.set(p.id, it);
    return it;
  };
  for (const p of layered) place(p, new Set());
  const byTier = new Map<number, CsItem[]>();
  for (const p of layered) { const it = items.get(p.id)!; (byTier.get(it.tier) ?? byTier.set(it.tier, []).get(it.tier)!).push(it); }
  const tiers = [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([n, its]) => {
    const hosts = [...new Set(its.map((i) => (i.part.on && i.part.on !== 'frame' && ids.has(i.part.on) ? onText(layered.find((x) => x.id === i.part.on)!) : '프레임 면 위')))];
    return { n, summary: `${n}층 · ${hosts.join(' · ')} — ${its.map((i) => i.label).join(', ')}`, items: its };
  });
  return { width, height, frame, tiers, extras: parts.filter(isExtra) };
}
const onText = (host: SignPart) => `${componentOf(host.kind).host?.(host) ?? componentOf(host.kind).label}`;
