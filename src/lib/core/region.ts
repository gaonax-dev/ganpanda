// 지역 (2026-10-21 사용자: "지역입력은 주소와 중복된다"): 요청의 지역은 주소에서 뽑는다 — 시/도 + 시/군/구(+구). 간판사의 "요청 받기" 지역과는 포함 관계로 맞춘다.
// 서버(server/src/region.ts)와 같은 규칙 — 서버는 앱 코드를 안 가져온다

/** 시/도 긴 이름 → 흔히 쓰는 짧은 이름 */
const SIDO: [RegExp, string][] = [
  [/^서울(특별시)?/, '서울'], [/^부산(광역시)?/, '부산'], [/^대구(광역시)?/, '대구'], [/^인천(광역시)?/, '인천'], [/^광주(광역시)?/, '광주'], [/^대전(광역시)?/, '대전'], [/^울산(광역시)?/, '울산'],
  [/^세종(특별자치시)?/, '세종'], [/^경기(도)?/, '경기'], [/^강원(특별자치도|도)?/, '강원'], [/^충청북도|^충북/, '충북'], [/^충청남도|^충남/, '충남'], [/^전라북도|^전북(특별자치도)?/, '전북'],
  [/^전라남도|^전남/, '전남'], [/^경상북도|^경북/, '경북'], [/^경상남도|^경남/, '경남'], [/^제주(특별자치도|도)?/, '제주'],
];

/** 주소 → 지역: "경기도 성남시 중원구 성남대로 …" → "경기 성남시 중원구", "서울특별시 송파구 올림픽로 …" → "서울 송파구". 못 읽으면 '' */
export function regionOfAddress(address: string): string {
  const toks = address.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return '';
  let sido = '';
  for (const [re, short] of SIDO) if (re.test(toks[0])) { sido = short; break; }
  const rest = sido ? toks.slice(1) : toks;
  const parts: string[] = [];
  for (const t of rest) {
    if (parts.length >= 2) break;
    if (/(시|군|구)$/.test(t) && !/(로|길)$/.test(t)) { parts.push(t); if (!/시$/.test(t)) break; } // 시 뒤에는 구가 올 수 있다, 군·구에서 끝
    else break;
  }
  const out = [sido, ...parts].filter(Boolean).join(' ');
  return out;
}

/** 비교용: 공백 제거 + 시/도 짧은 이름 */
export function normRegion(s: string): string {
  const t = s.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return '';
  for (const [re, short] of SIDO) if (re.test(t[0])) { t[0] = t[0].replace(re, short); break; }
  return t.join('');
}

/** 간판사 지역(g)이 요청 지역(r)을 받나: 한쪽이 다른 쪽을 포함하면 (예: "성남시" ⊂ "경기 성남시 중원구", "경기 광주시" ⊃ "광주시") */
export function regionMatches(shopRegion: string, requestRegion: string): boolean {
  const a = normRegion(shopRegion), b = normRegion(requestRegion);
  if (!a || !b) return false;
  return a === b || b.includes(a) || a.includes(b);
}
