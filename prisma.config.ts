import { defineConfig } from 'prisma/config';
import { roleConfig } from './scripts/test-roles.mjs';

// Fail closed: never fall back to DATABASE_URL or the development .env.
const { connectionString } = roleConfig('migration');
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: connectionString },
});
