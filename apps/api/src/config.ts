import { z } from 'zod';
const origin = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  });
const schema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) => value.split(',').map((entry) => entry.trim()))
    .pipe(z.array(origin).min(1)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type ApiConfig = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Field names only: validation messages may contain user-provided secrets.
    throw new Error(
      `Configuração inválida: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}`,
    );
  }
  return result.data;
}
