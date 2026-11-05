# 07 — Roadmap em entregas pequenas

## Sprint 0 — Fundação

- Monorepo e ferramentas de lint/format/test; Compose Postgres + Redis; scripts de dev.
- Modelagem inicial e migrations; seed fictício.
- Contrato OpenAPI/DTOs base, autenticação e isolamento de organizações.
- Critério: `pnpm install`, ambiente local, migration/seed, testes básicos.

## Sprint 1 — Design system e páginas com mocks

- Layout responsivo, navegação, filtros, tabelas, estados vazios/erros.
- Dashboard, vendas, produtos, estoque, perdas, integrações (mock).
- Critério: navegação funcional sem integração externa; Playwright cobre fluxo principal.

## Sprint 2 — Catálogo, custos e estoque manual

- CRUD produtos com SKU, custo histórico, depósito e movimentos.
- Registro de perdas com transação atômica e histórico auditável.
- Critério: saldo = somatória assinada, perda gera exatamente 1 saída, teste concorrência/idempotência.

## Sprint 3 — Vendas e indicadores usando seed

- Pedido manual/importado via adapter fake, busca/paginação, item de venda, vínculos de SKU.
- KPIs e métricas com testes unitários e estados `dados incompletos`.
- Critério: valores consistentes entre listagem, detalhe e dashboard.

## Sprint 4 — Mercado Livre OAuth e importação

- App DevCenter, OAuth, tokens cifrados, conta seller, importação paginada, normalização.
- Critério: uma conta real de teste autorizada e dados apresentados; reimportar não duplica.

## Sprint 5 — Incremental e confiabilidade

- Webhooks + fila, checkpoint, retries, backoff, reconexão, logs, auditoria.
- Critério: pedidos mudam status corretamente, mesmos eventos N vezes não geram linhas repetidas, falhas recuperáveis.

## Sprint 6 — Beta com sellers

- Teste de uso com 3–5 vendedores, identificar gaps de custos/estoque, melhorar onboarding, performance e privacidade.
- Critério: pelo menos 3 jornadas completas de importação, vínculo de SKU e análise de margem.

## Futuro

- Baixa automática controlada por marco de corte (somente quando correto para modalidade de fulfillment).
- Shopee, depois TikTok Shop, via interfaces de adapter.
- Conciliação financeira, imposto e módulo fiscal somente após requisitos especialistas.
