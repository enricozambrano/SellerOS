# Diretrizes permanentes do SellerOS

## Leitura e escopo

- Antes de alterar código, leia README.md, docs/*.md e as decisões em docs/10-fundacao.md.
- `database/001_initial.sql` é uma proposta não validada. Nunca execute, monte no entrypoint do PostgreSQL ou converta automaticamente em migration.
- Entregue etapas pequenas. Apresente plano, arquivos afetados, decisões e validações; não inicie a próxima etapa sem autorização.
- A Etapa 01 contém apenas fundação. Autenticação, Prisma/schema, migrations, seeds, domínio, dashboards e integrações dependem de autorização futura. O pedido atual prevalece sobre o Sprint 0 e o prompt antigo de docs/07 e docs/08.
- Não simplifique regras de negócio silenciosamente. Registre justificativas e pendências em docs/.

## Arquitetura e qualidade

- pnpm Workspaces: apps/web (React/Vite/Tailwind), apps/api (Fastify), apps/worker (processo Redis), packages/shared (contratos públicos), infra (Compose).
- TypeScript estrito, ESM, imports relativos com `.js` nos serviços Node. Shared não pode exportar configuração privada ou credenciais.
- Rotas validam contratos; serviços futuros concentram regras/transações; repositórios futuros isolam consultas por organização; adapters futuros encapsulam marketplaces.
- Não adicione abstrações ou dependências de etapas futuras sem necessidade. BullMQ e Prisma continuam planejados.
- Preserve pnpm-lock.yaml e compatibilidade do Node/pnpm declarada no package.json.
- Ao concluir mudanças, execute `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` e `pnpm build`. Informe resultados reais e limitações. Mudanças operacionais exigem smoke local pertinente.
- Não exponha erros internos no HTTP. Use IDs de correlação gerados pelo servidor. Logs JSON com campos permitidos; nunca logar env, URLs com credenciais, bodies, tokens, cabeçalhos ou erros brutos.
- `.env` e segredos não são versionados. `VITE_*` é público. Não introduza nuvem ou serviços pagos na execução local.

## Invariantes para próximas etapas

- Toda operação de domínio exige isolamento por organization_id e autorização de membership no backend. ID recebido do cliente não comprova acesso.
- Mercado Livre primeiro e somente leitura. Tokens só no backend e cifrados em repouso; dados pessoais mínimos, retenção explícita e LGPD.
- Importação idempotente por conta e identidade externa. Webhooks notificam mudanças; não substituem a consulta ao recurso. Tratar duplicação, eventos fora de ordem e retries.
- SKU interno, anúncio/variação externa e item vendido são entidades distintas.
- Estoque físico deriva do ledger interno, nunca do snapshot externo. Não baixar estoque por importação histórica. Automação exige marco de corte e políticas de fulfillment/cancelamento/retorno.
- Ledger append-only: correções por estorno/ajuste. Perda e movimento negativo devem ser atômicos e corresponder exatamente em tenant, quantidade e custo.
- Custos desconhecidos são NULL, não zero. Preservar snapshots históricos; reprocessamento somente explícito e auditado.
- Dinheiro em NUMERIC/Decimal; não calcular finanças com float. Não somar moedas diferentes sem política documentada.
- Margem é estimada, com cobertura e faltas visíveis; nunca prometer lucro líquido contábil. Cancelamentos e reembolsos exigem critérios explícitos.
- Datas persistidas em UTC/timestamptz, exibidas em America/Sao_Paulo por padrão. Definir o evento temporal de cada indicador.
- Dados fictícios devem ser rotulados Demonstração; nunca simular conexão real.
