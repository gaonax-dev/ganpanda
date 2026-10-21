// 메일 발송 DNS 점검 (2026-10-22 사용자: "서비스 시작하고 이런 상황이 벌어지면 심각하다"): SPF·DKIM 이 빠진 채 DMARC 가 reject 면 Gmail 이 수신 거부해
// 서버는 202 로 보냈다고 믿고 아무도 모르는 장애가 된다. /api/health 가 DoH 로 조회해 위험이면 503 → 외부 모니터가 알린다. 운영자 홈 배너도 같은 결과
const DOH = 'https://cloudflare-dns.com/dns-query';
export const MAIL_DOMAIN = 'ganpanda.co.kr';

let dnsFetch: typeof fetch = (input, init) => fetch(input, init);
export function setDnsFetch(f: typeof fetch | null) { dnsFetch = f ?? ((input, init) => fetch(input, init)); }

async function txt(name: string): Promise<string[]> {
  try {
    const r = await dnsFetch(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } });
    if (!r.ok) return [];
    const j = await r.json<{ Answer?: { data: string }[] }>();
    return (j.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
  } catch { return []; }
}

export interface MailDns { spf: boolean; dmarc: 'none' | 'quarantine' | 'reject' | 'missing'; /** 위험: 수신 서버가 거부할 조합 */ danger: boolean; detail: string }

/** 평가 (순수): SPF 가 없는데 DMARC 가 quarantine/reject 면 위험 */
export function assessMailDns(spfRecords: string[], dmarcRecords: string[]): MailDns {
  const spf = spfRecords.some((t) => /^v=spf1\b/i.test(t));
  const d = dmarcRecords.find((t) => /^v=DMARC1\b/i.test(t)) ?? '';
  const m = /p\s*=\s*(none|quarantine|reject)/i.exec(d);
  const dmarc: MailDns['dmarc'] = d ? ((m?.[1].toLowerCase() as 'none' | 'quarantine' | 'reject') ?? 'none') : 'missing';
  const danger = !spf && (dmarc === 'reject' || dmarc === 'quarantine');
  const detail = danger ? `SPF 없음 + DMARC ${dmarc} → 수신 거부됨. Email Sending 레코드를 다시 추가하거나 DMARC 를 none 으로` : !spf ? 'SPF 없음 (스팸함 위험)' : 'ok';
  return { spf, dmarc, danger, detail };
}

export async function checkMailDns(domain = MAIL_DOMAIN): Promise<MailDns> {
  const [spf, dmarc] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);
  return assessMailDns(spf, dmarc);
}
