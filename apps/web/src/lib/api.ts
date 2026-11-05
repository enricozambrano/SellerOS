import type { ApiErrorResponse, HealthResponse } from '@selleros/shared';
const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super('Não foi possível concluir a solicitação.');
    this.name = 'ApiError';
  }
}
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiError(response.status, body?.error?.requestId);
  }
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('status' in body) ||
    body.status !== 'ok' ||
    !('service' in body) ||
    body.service !== 'selleros-api'
  ) {
    throw new Error('Resposta de saúde inválida.');
  }
  return body as HealthResponse;
}
