# Trilha única de migrations

`202611200001_identity` contém apenas app_users, organizations e organization_members.
O SQL base foi gerado por Prisma Migrate diff entre vazio e schema; o mesmo arquivo
recebeu constraints, triggers, RLS, funções e grants revisados, em uma transação.
Não houve db push ou aplicação de database/001_initial.sql.

Provisionar roles técnicas no cluster fixado antes de deploy. Não conceder
credenciais de migração a API/worker. O comando `pnpm db:migrate:deploy:test`
confere identidade do cluster, container, volume, banco, usuário e versão antes
de chamar Prisma Migrate; roles/login e chaves são configuração de ambiente,
não dados de negócio. A migration supõe os nomes documentados no relatório 02B.1.

Esta etapa não usa banco shadow: geração via diff `--from-empty` e deploy de SQL
revisado. Nunca executar migrate dev/reset no banco de desenvolvimento.
Migrations aplicadas são imutáveis; correções futuras exigem nova migration.
Toda customização SQL deve permanecer no histórico, inclusive policies/triggers.
