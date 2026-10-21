// 요청판 API 클라이언트 (2026-10-17): 고객(로그인 없음)의 요청 올리기·보기, 간판사의 받은 요청·답하기·설정 → docs/features/requests.md
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';
import type { RequestSign } from './core/requestSigns';

export interface RequestPhoto { n: number; type: string }
export interface RequestInfo { id: string; store: string; region: string; text: string; status: 'open' | 'approved'; createdAt: number; photos: RequestPhoto[]; /** 소비자가 그린 사인물 (2026-10-21) */ signs?: RequestSign[]; /** 주소·사업자번호(선택)·국세청 상태 (2026-10-21) */ address?: string; bizNo?: string | null; bizStatus?: string | null; /** 사업자등록증 사본 메타 (2026-10-21) — 파일은 제안을 보낸 간판사만 */ bizDoc?: { type: string; size: number } | null; /** 번호·대표자명·개업일 진위확인을 통과함 (2026-10-21) */ bizVerified?: boolean; ownerName?: string | null }
/** 간판사 목록의 한 줄: 제안을 보낸(요금이 발생한) 요청에만 연락처가 온다 */
export interface ShopRequest extends RequestInfo { responded: boolean; projectId?: string; phone?: string; email?: string }
export interface CustomerRequestView { request: RequestInfo & { approvedShop?: string; approvedAt?: number }; responses: { shop: string; /** 서버 기준 경로 — SERVER_URL 을 붙여 연다 */ proposalPath: string; createdAt: number }[] }
export interface RequestSettings { receive: boolean; regions: string[] }

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  if (!SERVER_URL) throw new AuthError(0, '서버가 설정되지 않았습니다');
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (init.body && typeof init.body === 'string') headers['content-type'] = 'application/json';
  const session = auth ? loadSession() : null;
  if (session) headers.authorization = `Bearer ${session}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.status === 204 ? (undefined as T) : r.json();
}

// ---------- 고객 (로그인 없음) ----------
/** 요청 올리기 — 로그인 필수 (2026-10-21, 카카오 기본) */
export const createRequest = (body: { store: string; region: string; text: string; phone: string; email?: string; ref?: string; signs?: RequestSign[]; address?: string; bizNo?: string; ownerName?: string; startDate?: string; /** 사본을 이어서 올린다 (검증 요소 대신) */ bizDocPending?: boolean }) =>
  call<{ id: string; key: string; url: string }>('/api/requests', { method: 'POST', body: JSON.stringify(body) });
/** 내 요청 목록 (요청한 계정) */
export interface MyRequest extends RequestInfo { responses: number }
export const listMyRequests = () => call<{ requests: MyRequest[] }>('/api/requests/mine').then((r) => r.requests);
/** 사업자등록증 사본 읽기 (2026-10-21 "분석 실패하면 수동입력"): 번호·상호·주소 등, 못 읽으면 null */
export interface BizDocFields { bizNo?: string; name?: string; owner?: string; address?: string; startDate?: string }
export async function scanBizDoc(file: File): Promise<BizDocFields | null> {
  try { return (await call<{ fields: BizDocFields }>('/api/requests/doc-scan', { method: 'POST', body: file, headers: { 'content-type': file.type } })).fields; }
  catch (e) { if (e instanceof AuthError && e.status === 404) return null; throw e; }
}
/** 사업자등록증 사본 올리기 (고객, 2026-10-21) */
export const uploadRequestBizDoc = (id: string, key: string, file: File) =>
  call<{ ok: true }>(`/api/requests/${id}/biz-doc?key=${encodeURIComponent(key)}`, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
/** 간판사(제안 보낸 뒤)가 여는 사본 주소 */
export const bizDocUrl = (id: string) => `${SERVER_URL}/api/requests/${id}/biz-doc?session=${encodeURIComponent(loadSession() ?? '')}`;
export const uploadRequestPhoto = (id: string, key: string, file: File) =>
  call<{ n: number }>(`/api/requests/${id}/photos?key=${encodeURIComponent(key)}`, { method: 'PUT', body: file, headers: { 'content-type': file.type } }, false);
/** 고객 요청 페이지: 키가 있으면 키로, 없으면 로그인 세션으로(요청한 계정) */
export const getRequest = (id: string, key: string) => call<CustomerRequestView>(`/api/requests/${id}${key ? `?key=${encodeURIComponent(key)}` : ''}`);
/** 고객이 보는 사진 주소: 키 또는 세션 */
export const customerPhotoUrl = (id: string, key: string, n: number) => `${SERVER_URL}/api/requests/${id}/photos/${n}?${key ? `key=${encodeURIComponent(key)}` : `session=${encodeURIComponent(loadSession() ?? '')}`}`;

// ---------- 간판사 ----------
export const listRequests = () => call<{ requests: ShopRequest[] }>('/api/requests').then((r) => r.requests);
export const respondRequest = (id: string) => call<{ project: { id: string; name: string; requestId: string } }>(`/api/requests/${id}/respond`, { method: 'POST', body: '{}' }).then((r) => r.project);
export const setRequestSettings = (s: RequestSettings) => call<{ requestSettings: RequestSettings }>('/api/me/request-settings', { method: 'PUT', body: JSON.stringify(s) }).then((r) => r.requestSettings);
/** 간판사 세션으로 보는 사진 주소 (img 태그는 헤더를 못 넣으므로 ?session=) */
export const shopPhotoUrl = (id: string, n: number) => `${SERVER_URL}/api/requests/${id}/photos/${n}?session=${encodeURIComponent(loadSession() ?? '')}`;
/** 요청의 사진 수 (간판사: 받은 요청 목록에서) */
/** 간판사가 프로젝트로 가져올 때: 사진 수 + 소비자가 그린 사인물 (2026-10-21) */
export const getRequestPhotoCount = (id: string) => listRequests().then((rs) => { const r = rs.find((x) => x.id === id); return { count: r?.photos.length ?? 0, signs: r?.signs ?? [] }; });
/** 간판사 세션으로 사진 바이트 받기 (프로젝트에 가져올 때) */
export async function fetchRequestPhoto(id: string, n: number): Promise<Blob> {
  const r = await fetch(`${SERVER_URL}/api/requests/${id}/photos/${n}`, { headers: { authorization: `Bearer ${loadSession() ?? ''}` } });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.blob();
}
