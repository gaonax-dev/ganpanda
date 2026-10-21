// 사진 설정 (2026-10-21 사용자: "현재 x 마크 대신 설정버튼으로 사진교체, 이미지 조절(크롭(크게도 가능하게),밝기), 삭제")
// 이미지 조절은 **원본 에셋에서 새 그림을 구워**(크롭 + 밝기, 화면 쪽 photoBake.ts) 새 에셋으로 바꾼다 — 사진 px 좌표를 쓰는 모든 곳
// (영역·존·축 선·말풍선·3D·렌더링)은 그대로 두고, 좌표만 크롭만큼 옮긴다. 조절 전 원본은 `Photo.source` 에 남겨 다시 조절해도 화질이 쌓여 줄지 않는다.
import type { Photo, Pin, SignObject, PhotoSource } from './model';
import type { Pt } from './homography';
import type { CameraSetup, Line } from './camera';

export type Crop = { x: number; y: number; w: number; h: number };
export type PtMap = (p: Pt) => Pt;

/** 크롭의 최소 변 (px) */
export const CROP_MIN = 16;
/** 밝기 범위 (1 = 그대로) */
export const BRIGHTNESS_RANGE = { min: 0.5, max: 1.5 } as const;

/** 정수 px, 최소 크기. 원본 밖(음수·원본보다 큰 값)도 허용 — 그만큼 여백 */
export function normalizeCrop(c: Crop): Crop {
  return { x: Math.round(c.x), y: Math.round(c.y), w: Math.max(CROP_MIN, Math.round(c.w)), h: Math.max(CROP_MIN, Math.round(c.h)) };
}

/** 조절의 기준이 되는 원본: 아직 조절 안 했으면 지금 에셋 그대로 */
export function sourceOf(p: Photo): PhotoSource {
  return p.source ?? { assetId: p.assetId, w: p.w, h: p.h, crop: { x: 0, y: 0, w: p.w, h: p.h }, brightness: 1 };
}

const sameCrop = (a: Crop, b: Crop) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export interface AdjustPlan {
  /** 구운 그림의 크기 = 크롭 크기 */
  w: number; h: number;
  /** 좌표 이동 (옛 크롭 원점 − 새 크롭 원점): 현재 사진 px → 새 사진 px */
  shift: [number, number];
  /** 보드 위치·폭: 사진 px 당 보드 px 를 유지해 사인물이 보드에서 같은 자리에 */
  x: number; y: number; width: number;
  /** 다시 조절할 때의 기준. 원본 그대로면 없음 */
  source: PhotoSource | undefined;
}

/** 이미지 조절 계획 (크롭은 **원본 px** 기준, 밝기 1 = 그대로) */
export function adjustPlan(p: Photo, crop: Crop, brightness: number): AdjustPlan {
  const src = sourceOf(p);
  const c = normalizeCrop(crop);
  const k = p.width / p.w; // 보드 px / 사진 px
  const shift: [number, number] = [src.crop.x - c.x, src.crop.y - c.y];
  const original = sameCrop(c, { x: 0, y: 0, w: src.w, h: src.h }) && brightness === 1;
  return {
    w: c.w, h: c.h, shift,
    x: p.x - shift[0] * k, y: p.y - shift[1] * k, width: c.w * k,
    source: original ? undefined : { assetId: src.assetId, w: src.w, h: src.h, crop: c, brightness },
  };
}

export interface ReplacePlan {
  scale: number;
  map: PtMap;
  patch: Pick<Photo, 'assetId' | 'w' | 'h'> & { source: undefined };
  /** 가로세로 비율이 1% 넘게 다르다 — 좌표는 가로 배율로만 옮기므로 세로가 어긋날 수 있다 */
  aspectDiffers: boolean;
}

/** 사진 교체 계획: 좌표는 가로 배율 하나로(같은 자리에서 다시 찍은 사진이 전제), 보드 폭은 그대로, 조절 기록은 지운다 */
export function replacePlan(p: Photo, assetId: string, w: number, h: number): ReplacePlan {
  const scale = w / p.w;
  return {
    scale,
    map: ([x, y]) => [x * scale, y * scale],
    patch: { assetId, w, h, source: undefined },
    aspectDiffers: Math.abs(w / h - p.w / p.h) / (p.w / p.h) > 0.01,
  };
}

// ---------- 사진 px 좌표를 쓰는 필드 옮기기 (원본은 바꾸지 않는다) ----------

const mapLine = (l: Line, f: PtMap): Line => ({ a: f(l.a), b: f(l.b) });
const mapPair = (ls: [Line, Line], f: PtMap): [Line, Line] => [mapLine(ls[0], f), mapLine(ls[1], f)];

function mapCamera(c: CameraSetup, f: PtMap): CameraSetup {
  const out: CameraSetup = { ...c, x: mapPair(c.x, f), y: mapPair(c.y, f), origin: f(c.origin) };
  if (c.z) out.z = mapPair(c.z, f);
  const r = c.ref;
  if (r) {
    if ('from' in r) out.ref = { ...r, from: f(r.from), to: f(r.to) };
    else if ('point' in r) out.ref = { ...r, point: f(r.point) };
    else if ('a' in r) out.ref = { ...r, a: f(r.a), b: f(r.b) };
  }
  return out;
}

/** 사진의 존·축 선·원점·기준 길이 핸들 */
export function mapPhotoPts(p: Photo, f: PtMap): Pick<Photo, 'zones' | 'zone' | 'camera'> {
  const out: Pick<Photo, 'zones' | 'zone' | 'camera'> = {};
  if (p.zones) out.zones = p.zones.map((z) => z.map(f));
  if (p.zone) out.zone = p.zone.map(f);
  if (p.camera) out.camera = mapCamera(p.camera, f);
  return out;
}

/** 사인물의 영역·윤곽 */
export function mapObjectPts(o: SignObject, f: PtMap): Pick<SignObject, 'quad' | 'polygon'> {
  const out: Pick<SignObject, 'quad' | 'polygon'> = { quad: o.quad.map(f) };
  if (o.polygon) out.polygon = o.polygon.map(f);
  return out;
}

/** 말풍선 꼭지 (몸통 오프셋은 상대값이라 그대로) */
export function mapPinPts(pin: Pin, f: PtMap): Pick<Pin, 'x' | 'y' | 'bx' | 'by'> {
  const [x, y] = f([pin.x, pin.y]);
  return { x, y, bx: pin.bx, by: pin.by };
}

/** 평행 이동 */
export const shiftBy = ([dx, dy]: [number, number]): PtMap => ([x, y]) => [x + dx, y + dy];
