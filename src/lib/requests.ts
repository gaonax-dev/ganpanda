// 요청판 API 클라이언트 (2026-10-17): 고객(로그인 없음)의 요청 올리기·보기, 간판사의 받은 요청·답하기·설정 → docs/features/requests.md
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';

export interface RequestPhoto { n: number; type: string }
export interface RequestInfo { id: string; store: string; region: string; text: string; status: 'open' | 'approved'; createdAt: number; photos: RequestPhoto[] }
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
export const createRequest = (body: { store: string; region: string; text: string; phone: string; email?: string; ref?: string }) =>
  call<{ id: string; key: string; url: string }>('/api/requests', { method: 'POST', body: JSON.stringify(body) }, false);
export const uploadRequestPhoto = (id: string, key: string, file: File) =>
  call<{ n: number }>(`/api/requests/${id}/photos?key=${encodeURIComponent(key)}`, { method: 'PUT', body: file, headers: { 'content-type': file.type } }, false);
export const getRequest = (id: string, key: string) => call<CustomerRequestView>(`/api/requests/${id}?key=${encodeURIComponent(key)}`, {}, false);
/** 고객 키로 보는 사진 주소 */
export const customerPhotoUrl = (id: string, key: string, n: number) => `${SERVER_URL}/api/requests/${id}/photos/${n}?key=${encodeURIComponent(key)}`;

// ---------- 간판사 ----------
export const listRequests = () => call<{ requests: ShopRequest[] }>('/api/requests').then((r) => r.requests);
export const respondRequest = (id: string) => call<{ project: { id: string; name: string; requestId: string } }>(`/api/requests/${id}/respond`, { method: 'POST', body: '{}' }).then((r) => r.project);
export const setRequestSettings = (s: RequestSettings) => call<{ requestSettings: RequestSettings }>('/api/me/request-settings', { method: 'PUT', body: JSON.stringify(s) }).then((r) => r.requestSettings);
/** 간판사 세션으로 보는 사진 주소 (img 태그는 헤더를 못 넣으므로 ?session=) */
export const shopPhotoUrl = (id: string, n: number) => `${SERVER_URL}/api/requests/${id}/photos/${n}?session=${encodeURIComponent(loadSession() ?? '')}`;
/** 요청의 사진 수 (간판사: 받은 요청 목록에서) */
export const getRequestPhotoCount = (id: string) => listRequests().then((rs) => rs.find((r) => r.id === id)?.photos.length ?? 0);
/** 간판사 세션으로 사진 바이트 받기 (프로젝트에 가져올 때) */
export async function fetchRequestPhoto(id: string, n: number): Promise<Blob> {
  const r = await fetch(`${SERVER_URL}/api/requests/${id}/photos/${n}`, { headers: { authorization: `Bearer ${loadSession() ?? ''}` } });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.blob();
}
