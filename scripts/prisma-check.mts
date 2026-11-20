import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { readTestConfig } from './test-db-config.mjs';

const config = readTestConfig();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: config.connectionString,
    connectionTimeoutMillis: 5000,
  }),
  log: [],
});
try {
  const rows = await prisma.$queryRaw<
    Array<{ db: string; usr: string }>
  >`SELECT current_database() AS db, current_user AS usr`;
  if (rows[0]?.db !== config.database || rows[0]?.usr !== config.user)
    throw new Error('Identidade inesperada');
  console.log('Prisma ORM conectado ao PostgreSQL de testes; consulta de identidade aprovada.');
} catch {
  console.error('Falha na conexão Prisma de testes. Credenciais omitidas.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
