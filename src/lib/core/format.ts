// 사람이 읽는 단위 표시
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1.5 KB", 50MB → "50 MB" (정수면 소수점 생략) */
export function formatBytes(n: number): string {
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
  const s = i === 0 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();
  return `${s} ${UNITS[i]}`;
}
