import { z } from 'zod';
const schema = z.object({
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (value) => URL.canParse(value) && ['redis:', 'rediss:'].includes(new URL(value).protocol),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error('Configuração inválida: confira REDIS_URL e LOG_LEVEL.');
  return result.data;
}
