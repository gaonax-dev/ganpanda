// 견적 요청 보내기 도움 (2026-10-22 사용자: "\"견적요청보내기\" 왜 작동안하는지 모르겠다" — 단추가 말없이 꺼져 있었다 → 빠진 것을 말로;
// "견적요청 페이지는 견적 요청된 상태를 더 잘 포장해서" → 진행 단계)
import { regionOfAddress } from './region';

export type Identity = 'store' | 'general' | null;
export function missingForRequest(f: { identity: Identity; store: string; phone: string; address: string; photos: number }): string[] {
  const out: string[] = [];
  if (!f.identity) out.push('사업자 인증 또는 일반 주문 선택');
  if (!f.store.trim()) out.push('가게 이름');
  if (!/^\d{9,11}$/.test(f.phone.replace(/\D/g, ''))) out.push('전화번호 (숫자 9~11자리)');
  if (!f.address.trim()) out.push('가게 주소');
  else if (!regionOfAddress(f.address)) out.push('가게 주소에 시/군/구 (예: 경기도 광주시 …)');
  if (f.photos < 1) out.push('사진 (보드에 가게 사진을 올려 주세요)');
  return out;
}

export type StepState = 'done' | 'now' | 'todo' | 'cancelled';
export function requestSteps(status: 'open' | 'approved' | 'cancelled', responses: number): { id: string; label: string; state: StepState }[] {
  const s = (id: string, label: string, state: StepState) => ({ id, label, state });
  if (status === 'cancelled') return [s('sent', '요청 접수', 'done'), s('offers', '제안 도착', 'cancelled'), s('chosen', '간판집 선택', 'cancelled')];
  if (status === 'approved') return [s('sent', '요청 접수', 'done'), s('offers', '제안 도착', 'done'), s('chosen', '간판집 선택', 'done')];
  return [s('sent', '요청 접수', 'done'), s('offers', '제안 도착', responses ? 'done' : 'now'), s('chosen', '간판집 선택', responses ? 'now' : 'todo')];
}
