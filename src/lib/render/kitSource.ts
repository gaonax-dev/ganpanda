// 채널 키트 목록·출처 (2026-10-31) — three 없이: 서버 공개판·초안(운영자 미리보기)·앱에 든 기본. 그리기는 kitView.ts (나중에 불러온다)
import { SERVER_URL } from '../sync';
import { loadSession } from '../auth';

export interface KitMaps { letters: string; wall: string; letterIntensity: number; wallIntensity: number }
export interface KitVariant { id: string; label: string; file: string; roles: string[]; lightmaps: { day: KitMaps; night: KitMaps }; size: [number, number, number]; bytes: number }
export interface KitManifest { version: number; letter: string; variants: KitVariant[] }
/** 받은 키트: 어디서(공개판·초안·앱에 든 기본) + 파일 주소 앞부분 */
export interface LoadedKit extends KitManifest { source: 'server' | 'draft' | 'static'; base: string }

const BASE = `${import.meta.env.BASE_URL ?? '/'}channel-models/`.replace(/\/\/+/g, '/');
// 서버 키트 (2026-10-31 "운영자만, 초안 공개 2단계로 진행해줘"): 블렌더 애드온이 올린 공개판을 먼저, 운영자가 [초안 미리보기]를 켜면 초안, 없으면 앱에 든 기본
const DRAFT_KEY = 'ganpanda.kitDraft';
export const kitDraftOn = () => { try { return localStorage.getItem(DRAFT_KEY) === '1'; } catch { return false; } };
export function setKitDraft(on: boolean) { try { if (on) localStorage.setItem(DRAFT_KEY, '1'); else localStorage.removeItem(DRAFT_KEY); } catch { /* 기기 저장 불가 */ } resetKitManifest(); }
export function resetKitManifest() { manifestP = null; }
async function fetchServer(draft: boolean): Promise<LoadedKit | null> {
  if (!SERVER_URL) return null;
  const s = loadSession();
  // 늘 새로 확인 — 세션에 한 번만 받으니 가볍고, 공개하면 바로 (브라우저 캐시 60초를 기다리지 않게)
  const r = await fetch(`${SERVER_URL}/api/kit/manifest${draft ? '?draft=1' : ''}`, { cache: 'no-cache', headers: draft && s ? { authorization: `Bearer ${s}` } : {} }).catch(() => null);
  if (!r?.ok) return null;
  return { ...(await r.json()), source: draft ? 'draft' : 'server', base: `${SERVER_URL}/api/kit/files/` };
}
/** 파일 주소 — 서버 파일은 내용 해시 이름이라 판 표시가 필요 없다 */
export const fileUrl = (mf: LoadedKit, f: string) => (mf.source === 'static' ? `${BASE}${f}?v=${mf.version}` : `${mf.base}${f}`);

let manifestP: Promise<LoadedKit | null> | null = null;
export function loadKitManifest(): Promise<LoadedKit | null> {
  manifestP ??= (async () => {
    const m = (kitDraftOn() ? await fetchServer(true) : null) ?? (await fetchServer(false));
    if (m) return m;
    const r = await fetch(`${BASE}manifest.json`).catch(() => null);
    return r?.ok ? { ...(await r.json()), source: 'static', base: BASE } : null;
  })();
  return manifestP;
}
