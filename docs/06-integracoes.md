# 06 — Integrações e fluxo Mercado Livre

## Prioridade e viabilidade

1. **Mercado Livre** — primeiro conector real; documentação oficial de OAuth, `/orders/search`, `/orders/{id}`, recursos de anúncios e tópicos `orders_v2` / `items`.
2. **Shopee** — existe Open Platform com APIs de orders, listings e autorização; confirmar acesso/credenciamento e permissões efetivas antes do desenvolvimento.
3. **TikTok Shop** — existe TikTok Shop Partner Center e APIs para catálogos, pedidos etc. Confirmar processo de aprovação, país e scopes para o tipo de aplicação; **não confundir com TikTok for Developers/Research API**.

## Mercado Livre: fluxo de onboarding

1. Provedor de autenticação do app identifica usuário/organização.
2. Backend gera `state` vinculado à sessão e redireciona à autorização ML (PKCE, se habilitado).
3. ML retorna code a `redirect_uri` exato; backend valida `state`.
4. Backend troca code em `/oauth/token`, consulta vendedor autenticado (`/users/me`), cifra e grava tokens.
5. Criar `integration_accounts`; enfileirar job `initial_sync`.
6. Paginar anúncios e pedidos disponíveis; normalizar e persistir com upserts.
7. Configurar topics webhook `orders_v2` e `items` no DevCenter; notificações registradas/enfileiradas.
8. Exibir última sincronização e se há erros; oferecer reconexão.

## Cuidados confirmados pela documentação oficial (out/2026)

- Access token de 6 h; o refresh token muda em cada renovação e é de uso único. Implementar lock, transação/atualização atômica de credenciais e tratamento de corrida.
- Callback HTTPS com `redirect_uri` exato, OAuth `state`, scopes/permissões mínimas e PKCE quando aplicável.
- Notificações são indícios de mudança: primeiro registrar o evento, depois GET do recurso. Responder rapidamente; alvo oficial de até 500 ms.
- Mesmo webhook pode chegar duas vezes, fora de ordem ou com atraso; criar deduplicação, sync periódica e recuperação de faltantes.
- Para erro 429, backoff com jitter; controlar concorrência e retentativas.
- Histórico disponível para consulta pelo endpoint de pedidos é limitado (documentação refere-se a até 12 meses); não prometer importação irrestrita.
- Regras de teste: compradores e vendedores de teste separados; não efetuar transações reais de teste cruzando contas reais e de teste.
- Aplicativos de Mercado Livre e Mercado Pago devem ser separados (regra recente de 2026).

## Dados canônicos do conector

- Seller: `{ externalSellerId, displayName, siteId }`.
- Listing: `{ externalItemId, externalVariantId?, externalSku?, title, price?, availableQuantity?, rawStatus?, updatedAt? }`.
- Order: `{ externalOrderId, rawStatus, normalizedStatus, grossAmount, currency, createdAt, updatedAt, lines: [{ externalLineKey, externalItemId?, externalVariantId?, sku?, title, quantity, unitPrice }] }`.
- Fee/expenditure: `{ category, amount, source, confidence/status }`.

Campos opcionais devem ser tratados como opcionais. Confirmar detalhes do payload real e restrições do seller antes de implementar transformações financeiras.

## Estratégia para dados manuais

Conector fake no ambiente dev implementa mesmas interfaces, usando fixtures; sem credenciais, é possível construir UI, migrations, validação e testes. Nunca usar tokens em commits, prints ou exemplos compartilhados.

## Critérios de pronto do conector

- OAuth completo e reconexão.
- Backfill paginado com checkpoints e sem duplicatas.
- Incremental por updated_at com janela de sobreposição e status atualizado.
- Webhooks `orders_v2`/`items` validados, jobs tolerantes a repetição, sem update de estoque externo.
- Reimportação idempotente e cancelamentos refletidos.
- Erros/limites instrumentados, sem segredos em logs.

## Fontes primárias

- https://developers.mercadolivre.com.br/autenticacao-e-autorizacao
- https://developers.mercadolivre.com.br/pt_br/imovel-consulta-de-usuarios/gerenciamento-de-vendas
- https://developers.mercadolivre.com.br/produto-receba-notificacoes
- https://developers.mercadolivre.com.br/desenvolvimento-in-house
- https://developers.mercadolivre.com.br/pt_br/usuarios-e-aplicativos/rate-limit-erro-429
- https://open.shopee.com/developer-guide/4
- https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview
