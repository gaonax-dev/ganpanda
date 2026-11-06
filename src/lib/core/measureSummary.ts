// 프로젝트 카드의 실측 상태 (2026-10-21 사용자: "프로젝트 카드에 사인물 사이즈가 입력되면 실측중으로 변경하고 미측정/전체사인물수를 표시해줘
// 미측정 없으면 실측완료 사인물수 이후 제작중과 완료는 추후에")
// 앱이 프로젝트를 열어 둔 동안 사인물 수·미측정 수를 프로젝트 기록(signTotal·signUnmeasured)에 저장하고, 홈 카드가 그걸로 표시한다.
// 저장 상태(status)는 그대로 두고 **표시만** 바뀐다: 대기 상태에서 치수가 하나라도 들어오면 "실측중", 다 들어오면 "실측완료"

export type MeasureKind = 'none' | 'waiting' | 'measuring' | 'measured';
export interface MeasureInput { status: string; signTotal?: number; signUnmeasured?: number }

/** 카드 글자: 상태 이름은 그대로, 실측은 **숫자만**(2026-10-21 "실측 안내 없이 숫자만") — 미측정/전체, 다 재면 전체 수만 */
export function measureLabel(p: MeasureInput, statusLabel: string): { kind: MeasureKind; label: string; count: string; title: string } {
  const total = p.signTotal ?? 0, un = Math.min(total, p.signUnmeasured ?? 0), measured = total - un;
  if (total <= 0) return { kind: 'none', label: statusLabel, count: '', title: '' };
  const count = un > 0 ? `${un}/${total}` : `${total}`;
  const title = un > 0 ? `미측정 ${un} / 사인물 ${total}` : `실측완료 · 사인물 ${total}`;
  const kind: MeasureKind = un === 0 ? 'measured' : measured === 0 ? 'waiting' : 'measuring';
  return { kind, label: statusLabel, count, title };
}

/**
 * 홈 프로젝트 카드의 디자인 진행 (2026-11-06 사용자: "디지인 내보내면 번호생성하고 배지로 사인물카드에 작게넣어줘 이걸로 상태를 디자인 진행으로 표시할 수 있다"
 * → "상태 표시는 홈의 프로젝트 카드를 말한거야"): 일러스트로 보낸(대지 번호가 생긴) 사인물 수 signDesign · 그중 디자인을 받은 수 signDesigned —
 * 앱이 프로젝트를 열어 둔 동안 저장한다. 보낸 것이 없으면 null
 */
export interface DesignInput { signDesign?: number; signDesigned?: number }
export function designLabel(p: DesignInput): { kind: 'designing' | 'designed'; label: string; count: string; title: string } | null {
  const sent = p.signDesign ?? 0;
  if (sent <= 0) return null;
  const got = Math.min(sent, p.signDesigned ?? 0);
  const title = `디자인 받음 ${got} / 보냄 ${sent}`;
  return got >= sent ? { kind: 'designed', label: '디자인 완료', count: `${sent}`, title } : { kind: 'designing', label: '디자인 진행', count: `${got}/${sent}`, title };
}
/** 사인물에서 셈: 대지 번호가 있으면 보냄, 그중 디자인이 있으면 받음 */
export function designCounts(signs: { artNo?: number; design?: unknown }[]): { signDesign: number; signDesigned: number } {
  const sent = signs.filter((o) => (o.artNo ?? 0) > 0);
  return { signDesign: sent.length, signDesigned: sent.filter((o) => !!o.design).length };
}
