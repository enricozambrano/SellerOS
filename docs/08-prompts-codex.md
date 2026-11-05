# 08 — Prompts para Codex (usar um por vez)

## Prompt-mestre para colocar em AGENTS.md ou enviar no primeiro turno

```text
Você é o engenheiro principal do projeto SellerOS. Leia o README e todos os arquivos docs/*.md, e use database/001_initial.sql como proposta inicial (revise antes de aplicar). Não implemente o produto inteiro de uma vez. Faça mudanças incrementais, testáveis e pequenas.

Stack alvo: pnpm monorepo; React/Vite/TypeScript no frontend; Node/Fastify/TypeScript no backend; PostgreSQL/Prisma; Redis/BullMQ para importações; validação Zod; testes Vitest e Playwright.

Princípios obrigatórios:
- Isolamento de organizações em todas as operações.
- Tokens de marketplace nunca no frontend, logs ou git; cifrados em repouso.
- Integração Mercado Livre inicialmente read-only.
- Importação de pedidos deve ser idempotente; webhooks não transportam pedidos completos.
- Estoque interno não deve ser abatido automaticamente por importação histórica.
- Custos ausentes são NULL e margem incompleta é apresentada como estimativa.
- Sem prometer lucro líquido contábil e sem preencher gaps com números fictícios.
- Dados pessoais mínimos e tratamento LGPD.

Antes de implementar, descreva os arquivos que pretende modificar, as decisões e os critérios de aceite. Ao final de cada etapa, execute lint, typecheck e testes; apresente o resultado e qualquer pendência. Não misture fases. Prefira mocks/fixtures para avançar sem credenciais externas.
```

## Prompt etapa 1 — Fundação

```text
Implemente somente Sprint 0, seguindo docs/07-roadmap.md. Inicialize monorepo pnpm com apps/web, apps/api, apps/worker e packages/shared. Configure TS, ESLint, formatter, scripts e Docker Compose para PostgreSQL/Redis. Crie Prisma schema equivalente à especificação SQL, revendo tipos/índices, com migração e seed fictício. Crie README de execução e testes de smoke. Não integre nenhuma API externa ainda. Confira as regras de dados e apresente decisões de modelagem que mudarem.
```

## Prompt etapa 2 — Design e UI

```text
Implemente somente Sprint 1 conforme docs/03-design.md. Crie layout, tokens e navegação funcional em React, com páginas Dashboard, Vendas, Produtos, Estoque, Perdas, Financeiro e Integrações, usando dados de demonstração marcados. Desenvolva estados loading/empty/error e acessibilidade. Não conecte Mercado Livre ainda. Adicione testes de navegação e telas.
```

## Prompt etapa 3 — Regras do domínio

```text
Implemente Sprints 2 e 3 em PRs pequenas e separadas. Crie API de produtos, histórico de custo, depósitos, ledger e perdas com atomicidade; depois pedidos, mapping de anúncio/SKU e KPIs. Use PostgreSQL Decimal. Faça testes das invariantes: sem SKU duplicado, saldo soma movimentos, não deletar histórico, perdas uma só saída, pedidos com idempotência, valor de margem marcado como incompleto quando faltarem dados.
```

## Prompt etapa 4 — API Mercado Livre

```text
Implemente Sprint 4 usando APENAS a documentação oficial atual do Mercado Livre (ver docs/06-integracoes.md). Antes de codar, valide endpoints, scopes, permissões e payloads reais. Implemente OAuth state/PKCE quando aplicável, armazenamento cifrado de tokens com rotação segura, listagem paginada e normalização. Não faça writes nos anúncios/estoque do ML. Use fixtures e testes para ausência de credenciais e erros HTTP. Não imprima segredos.
```

## Prompt etapa 5 — Robustez

```text
Implemente Sprint 5: webhook enqueue rápido, eventos idempotentes, sincronização incremental com janela de sobreposição e checkpoints, filas BullMQ com retry/backoff+jitter, dedupe, atualização de pedidos/cancelamentos, health do conector e logs. Teste duplicados, atraso/falha de rede, perda de token, 429, eventos fora de ordem e reprocessamento de página.
```
