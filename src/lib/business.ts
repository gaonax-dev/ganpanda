// 사업자 확인 API (2026-10-21): 설정 "계정" 탭 → 서버 /api/me/business → 국세청 진위확인
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';
import type { Business } from './core/business';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SERVER_URL) throw new AuthError(0, '서버가 설정되지 않았습니다');
  const headers: Record<string, string> = {};
  if (init.body) headers['content-type'] = 'application/json';
  const session = loadSession();
  if (session) headers.authorization = `Bearer ${session}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.json();
}

/** 서버 오류 코드 → 사용자 문구 */
export const BUSINESS_ERROR: Record<string, string> = {
  bad_input: '사업자등록번호(10자리)·대표자 성명·개업일을 확인해 주세요.',
  mismatch: '국세청 등록 정보와 일치하지 않습니다. 사업자등록증의 대표자 성명·개업일자를 그대로 넣어 주세요.',
  not_registered: '국세청에 등록되지 않은 사업자등록번호입니다.',
  taken: '이미 다른 계정에 등록된 사업자입니다. 그 계정으로 로그인하거나 문의해 주세요.',
  nts_unavailable: '국세청 조회가 잠시 안 됩니다. 조금 뒤 다시 해 주세요.',
  not_configured: '사업자 확인이 아직 켜져 있지 않습니다.',
};
export function describeBusinessError(e: unknown): string {
  if (e instanceof AuthError) { try { const j = JSON.parse(e.message) as { error?: string }; if (j.error && BUSINESS_ERROR[j.error]) return BUSINESS_ERROR[j.error]; } catch { /* 본문이 JSON 이 아님 */ } }
  return e instanceof Error ? e.message : String(e);
}

export const verifyBusiness = (b: { no: string; ownerName: string; startDate: string; name?: string; address?: string }) =>
  call<{ business: Business }>('/api/me/business', { method: 'PUT', body: JSON.stringify(b) }).then((r) => r.business);
export const removeBusiness = () => call<{ business: null }>('/api/me/business', { method: 'DELETE' }).then(() => null);
/** 사업장 주소만 바꾸기 (다시 확인 없이, 2026-10-24) */
export const updateBusinessAddress = (address: string) =>
  call<{ business: Business }>('/api/me/business', { method: 'PATCH', body: JSON.stringify({ address }) }).then((r) => r.business);
