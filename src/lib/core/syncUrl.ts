// 동기화 서버 주소. 설정(VITE_SYNC_URL)이 없으면 개발 중에는 로컬 서버(8787), 운영 빌드에서는 서버 없이 로컬 모드.
export function syncServerUrl(configured: string | undefined, isDev: boolean): string | null {
  if (configured) return configured;
  return isDev ? 'http://localhost:8787' : null;
}

/** y-websocket 은 `${base}/${room}` 으로 접속한다 → 서버의 /api/rooms/:room */
export function roomsWsBase(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '').replace(/^http/, 'ws') + '/api/rooms';
}
