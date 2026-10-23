// 빠른 선택 묶음 적용·판정 — 종류 모듈의 presets (채널 라이브러리, 2026-10-23)
import type { SignObject, SignPart } from './model';
import { componentOf } from './components';
import type { PartPreset } from './components/types';

/** 묶음 적용: 세부 종류·옵션을 묶음으로 (글자·올린 곳·id 는 그대로). 재료 층을 저장해 둔 것은 새 종류의 기본 묶음으로 */
export function applyPreset(p: SignPart, pr: PartPreset, o?: SignObject): SignPart {
  const next: SignPart = { ...p, type: pr.type, options: { ...pr.options } };
  if (p.stack) next.stack = componentOf(p.kind).presetStack?.(pr.type, o) ?? p.stack;
  return next;
}

/** 이 구성 요소가 어느 묶음 그대로인가 (세부 종류·옵션이 같음). 세부를 고쳤으면 null */
export function presetOf(p: SignPart): PartPreset | null {
  const opts = Object.entries(p.options ?? {}).filter(([, v]) => v !== '' && v !== false && v !== undefined);
  return componentOf(p.kind).presets?.find((pr) => pr.type === p.type && opts.length === Object.keys(pr.options).length && opts.every(([k, v]) => pr.options[k] === v)) ?? null;
}
