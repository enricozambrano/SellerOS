# Trilha futura de migrations

Nenhuma migration foi criada nesta etapa. Este diretório é a única trilha futura
Prisma Migrate; `database/001_initial.sql` permanece referência não executável.

Após autorização da 02B.1, gerar uma migration revisável em ambiente isolado,
revisar SQL e incluir constraints/RLS antes de aplicar. Nunca usar `db push` ou
reset no banco de desenvolvimento. `pnpm db:migrate:deploy:test` aplica somente
migrations já revisadas ao destino de testes validado; não gera migrations.
O banco shadow para autoria de migrations ainda será definido na 02B.1.
