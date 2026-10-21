// 사업자등록증 사본 읽기 (2026-10-21 "사업자 사본 받아야 겠다" → "분석 실패하면 수동입력"): Workers AI 비전 모델로 번호·상호·대표자·주소·개업일을 뽑는다.
// 못 읽으면 null → 앱이 "직접 입력" 으로. 로컬·E2E 는 .dev.vars DOC_SCAN=fake, 테스트는 setDocScanner 로 바꿔 끼운다
import { validBizNo } from './business';

export interface BizDocFields { bizNo?: string; name?: string; owner?: string; address?: string; startDate?: string }
export const SCAN_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const PROMPT = '이 그림은 한국 사업자등록증입니다. 다음 항목을 읽어 JSON 하나만 출력하세요(설명 없이): {"bizNo":"사업자등록번호(숫자 10자리)","name":"상호(법인명)","owner":"대표자(성명)","address":"사업장 소재지","startDate":"개업연월일(YYYY-MM-DD)"} 없는 항목은 빈 문자열로.';

type Scanner = (env: Env, bytes: ArrayBuffer, type: string) => Promise<BizDocFields | null>;
let scanner: Scanner | null = null;
export function setDocScanner(f: Scanner | null) { scanner = f; }

/** 모델 답(글)에서 JSON 하나를 뽑아 정리. 번호는 검증 자릿수가 맞을 때만 */
export function parseScan(text: string): BizDocFields | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  const str = (k: string, max: number) => (typeof j[k] === 'string' ? (j[k] as string).trim().slice(0, max) : '');
  const out: BizDocFields = {};
  const no = str('bizNo', 20).replace(/\D/g, '');
  if (validBizNo(no)) out.bizNo = no;
  const name = str('name', 60); if (name) out.name = name;
  const owner = str('owner', 40); if (owner) out.owner = owner;
  const address = str('address', 200); if (address) out.address = address;
  const d = str('startDate', 20).replace(/\D/g, '');
  if (/^\d{8}$/.test(d)) out.startDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return Object.keys(out).length ? out : null;
}

export async function scanBizDoc(env: Env, bytes: ArrayBuffer, type: string): Promise<BizDocFields | null> {
  if (scanner) return scanner(env, bytes, type);
  if (env.DOC_SCAN === 'fake') return { bizNo: '2208162517', name: '간판다 카페', owner: '홍길동', address: '서울 송파구 올림픽로 300', startDate: '2020-01-05' };
  if (!env.AI || !type.startsWith('image/')) return null; // PDF 는 안 읽는다 — 직접 입력
  try {
    const r = await env.AI.run(SCAN_MODEL, { image: [...new Uint8Array(bytes)], prompt: PROMPT, max_tokens: 400 }) as { response?: string };
    return parseScan(r.response ?? '');
  } catch { return null; }
}
