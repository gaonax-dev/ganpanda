// 운영자 계정 (2026-10-21): OPERATOR_EMAILS 의 이메일. 모든 견적 요청 수신(requests.ts)·운영 배너(/api/me operator)
export const operatorEmails = (env: Env) => (env.OPERATOR_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isOperator = (env: Env, email: string) => operatorEmails(env).includes(email.toLowerCase());
