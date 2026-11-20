import { defineConfig } from 'prisma/config';
import { readTestConfig } from './scripts/test-db-config.mjs';

// Fail closed: never fall back to DATABASE_URL or the development .env.
const { connectionString } = readTestConfig();
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: connectionString },
});
