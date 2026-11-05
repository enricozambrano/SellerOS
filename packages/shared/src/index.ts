// Type-only contracts: no server configuration or secrets in this package.
export interface HealthResponse {
  status: 'ok';
  service: 'selleros-api';
}
export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
