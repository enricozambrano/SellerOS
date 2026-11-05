# 04 — Arquitetura de software

## Stack recomendada

- Frontend: React + TypeScript + Vite, Tailwind CSS com tokens próprios e componentes acessíveis (Radix/shadcn customizados).
- Server state: TanStack Query; formulários: React Hook Form + Zod.
- Backend: Node.js + TypeScript + Fastify; contratos Zod/OpenAPI.
- ORM: Prisma (gerar migrations a partir do esquema revisado; o SQL em `database/` serve como referência de domínio).
- Banco: PostgreSQL.
- Jobs: Redis + BullMQ para importações e reprocessamentos; em desenvolvimento Docker Compose.
- Autenticação: provedor maduro (ex.: Supabase Auth), JWT verificado no backend; entidade interna `app_users` espelha ID do provedor. Não implementar senha manual sem necessidade.
- Testes: Vitest (unit/integration), Playwright (E2E). API mockada/fixtures para integrações.
- Logs: JSON estruturado, IDs de correlação, segredos e PII mascarados.

## Topologia

```text
React SPA -> Fastify API -> PostgreSQL
                   |             ^
                   v             |
              BullMQ/Redis -> Worker (jobs)
                                  |
                            Adapters (ML, ...)
                                  |
                             Marketplace APIs

Marketplace webhook -> Fastify -> gravar evento/deduplicar -> fila -> GET recurso -> upsert
```

## Monorepo

```text
apps/
  web/
  api/
  worker/
packages/
  shared/             # schemas Zod, tipos DTO e regras comuns
  ui/                 # componentes UI e design tokens (opcional)
  marketplace-core/   # contrato adapter e modelo normalizado
infra/
  docker-compose.yml
docs/
database/
```

## Backend em módulos

`auth`, `organizations`, `products`, `marketplace-accounts`, `orders`, `inventory`, `losses`, `analytics`, `sync`.

### Separação de responsabilidades

- **Controller/route:** autenticação, validação, contrato HTTP.
- **Service/use case:** regra de negócio; transações de banco.
- **Repository:** consultas e upsert, sempre escopados por `organization_id`.
- **Adapter:** interpreta API externa e transforma em modelo interno.
- **Job:** busca páginas, coordena backfill e sincronização incremental.
- **Presenter/DTO:** evita expor tokens e JSON privado dos marketplaces ao frontend.

## Interface de marketplace (conceitual)

```ts
export interface MarketplaceAdapter {
  provider: 'mercado_livre' | 'shopee' | 'tiktok_shop';
  getAuthorizationUrl(input: { state: string; redirectUri: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthCredentials>;
  refresh(credentials: OAuthCredentials): Promise<OAuthCredentials>;
  getSeller(accessToken: string): Promise<ExternalSeller>;
  listListings(input: CursorPageRequest): Promise<CursorPage<NormalizedListing>>;
  listOrders(input: OrdersPageRequest): Promise<CursorPage<NormalizedOrder>>;
  getOrder(externalId: string, accessToken: string): Promise<NormalizedOrder>;
}
```

O contrato é **planejado**, não garante que todos os canais ofereçam as mesmas operações/paginação. Implementações podem declarar capacidades disponíveis por canal.

## Eventos e consistência

- Webhook recebe rápido, registra o evento, retorna sucesso e enfileira processamento.
- Workers fazem GET para obter estado atual da entidade: webhook geralmente sinaliza uma mudança, não o payload completo.
- Deduplicação por `event_key`, upsert de pedidos por `(integration_account_id, external_order_id)`.
- Resolver eventos fora de ordem comparando `updated_at` do marketplace e mantendo ingestões monotônicas onde possível.
- Backfill inicial paginado com limites e checkpoint; sync incremental por cursor/última atualização, com janela de sobreposição.
- Em 429/5xx aplicar backoff exponencial com jitter; falhas persistentes vão para alerta/retentativa manual.
- Renovação de refresh_token protegida com lock por conta, atualização atômica.

## Segurança mínima

HTTPS, cookies HttpOnly e SameSite quando aplicável; JWT validado; OWASP, rate limits e auditoria. OAuth `state` e PKCE quando configurado. Tokens cifrados em repouso, chave fora do banco. Filtros e autorização por organização em TODAS as operações. Sanitizar webhooks e não assumir confiabilidade de IDs externos. Seguir LGPD: minimização e políticas de retenção.
