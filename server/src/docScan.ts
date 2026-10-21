// 사업자등록증 사본 읽기 (2026-10-21 "사업자 사본 받아야 겠다" → "분석 실패하면 수동입력"): Workers AI 비전 모델로 번호·상호·대표자·주소·개업일을 뽑는다.
// 못 읽으면 null → 앱이 "직접 입력" 으로. 로컬·E2E 는 .dev.vars DOC_SCAN=fake, 테스트는 setDocScanner 로 바꿔 끼운다
import { validBizNo } from './business';

export interface BizDocFields { bizNo?: string; name?: string; owner?: string; address?: string; startDate?: string }
export const SCAN_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const PROMPT = [
  '이 그림은 한국 국세청 사업자등록증입니다. 항목 이름 옆의 값을 그대로 읽어 JSON 하나만 출력하세요(설명 없이).',
  '항목: "등록번호"(사업자등록번호, 000-00-00000) → bizNo / "상호" → name / "성명" 또는 "대표자" → owner / "생년월일" → birthDate / "개업연월일"(개업 연 월 일) → startDate / "사업장 소재지" → address (도·시·군·구·읍·면·로·길이 들어간 주소 한 줄).',
  '생년월일과 개업연월일은 다른 항목입니다 — 각각 그 항목 옆의 날짜를 YYYY-MM-DD 로. 없는 항목은 빈 문자열.',
  '형식: {"bizNo":"","name":"","owner":"","birthDate":"","address":"","startDate":""}',
].join(' ');

type Scanner = (env: Env, bytes: ArrayBuffer, type: string) => Promise<BizDocFields | null>;
let scanner: Scanner | null = null;
export function setDocScanner(f: Scanner | null) { scanner = f; }

/** 모델 답(글)에서 JSON 하나를 뽑아 정리. 번호는 검증 자릿수가 맞을 때만 */
export function parseScan(text: unknown): BizDocFields | null {
  let j: Record<string, unknown>;
  if (text && typeof text === 'object') j = text as Record<string, unknown>; // 모델이 JSON 객체로 주기도 한다
  else {
    const m = String(text ?? '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  }
  const str = (k: string, max: number) => (typeof j[k] === 'string' ? (j[k] as string).trim().slice(0, max) : '');
  const out: BizDocFields = {};
  const no = str('bizNo', 20).replace(/\D/g, '');
  if (validBizNo(no)) out.bizNo = no;
  const name = str('name', 60); if (name) out.name = name;
  const owner = str('owner', 40); if (owner && /^[가-힣a-zA-Z·\s]{2,20}$/.test(owner)) out.owner = owner; // 성명답지 않으면(숫자·날짜) 버린다
  const address = str('address', 200);
  const dateLike = /^\s*\d{4}\s*[년.\-/]\s*\d{1,2}\s*[월.\-/]\s*\d{1,2}/;
  if (address && !dateLike.test(address) && /(시|도|군|구|읍|면|동|리|로|길)/.test(address) && !/^[가-힣]{2,4}$/.test(address)) out.address = address; // 주소다워야 한다 (생년월일·이름이 들어오는 경우가 있었다)
  const d = str('startDate', 20).replace(/\D/g, ''), birth = str('birthDate', 20).replace(/\D/g, '');
  // 개업연월일: 생년월일과 같으면(섞어 읽음) 버린다. 생년월일은 저장하지 않는다 (개인정보)
  if (/^\d{8}$/.test(d) && d !== birth && Number(d.slice(0, 4)) >= 1950) out.startDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return Object.keys(out).length ? out : null;
}

export async function scanBizDoc(env: Env, bytes: ArrayBuffer, type: string): Promise<BizDocFields | null> {
  if (scanner) return scanner(env, bytes, type);
  if (env.DOC_SCAN === 'fake') return { bizNo: '2208162517', name: '간판다 카페', owner: '홍길동', address: '서울 송파구 올림픽로 300', startDate: '2020-01-05' };
  if (!env.AI || !type.startsWith('image/')) return null; // PDF 는 안 읽는다 — 직접 입력
  const run = async () => (await env.AI!.run(SCAN_MODEL, { image: [...new Uint8Array(bytes)], prompt: PROMPT, max_tokens: 400, temperature: 0.1 })) as { response?: unknown };
  try {
    let r: { response?: unknown };
    try { r = await run(); } catch (e) {
      // 계정당 1회 모델 라이선스 동의 (Workers AI 5016, 2026-10-21 사용자 승인 "이걸로 테스트해봐"): 'agree' 를 보내고 다시
      if (!String(e).includes('5016')) throw e;
      try { await env.AI.run(SCAN_MODEL, { prompt: 'agree' }); } catch { /* 동의 응답도 5016 으로 온다("Thank you for agreeing") — 무시하고 다시 */ }
      r = await run();
    }
    console.log('doc-scan raw:', JSON.stringify(r).slice(0, 800));
    return parseScan(r.response);
  } catch (e) { console.log('doc-scan error:', String(e).slice(0, 300)); return null; }
}
