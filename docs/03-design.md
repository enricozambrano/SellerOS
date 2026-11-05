# 03 — Design de produto

## Princípios de UX

Interface B2B limpa e confiável, com densidade de informação útil. Não copiar identidade visual de marketplace nem usar estética 'dashboard genérico de IA'. Uma ação principal por tela. Informações faltantes explicitamente indicadas.

## Navegação lateral (desktop)

- Visão geral `/app/dashboard`
- Vendas `/app/orders`
- Produtos `/app/products`
- Estoque `/app/inventory`
- Perdas `/app/losses`
- Financeiro `/app/finance`
- Integrações `/app/integrations`
- Configurações `/app/settings`

## Telas

1. **Login e onboarding:** nome do negócio, moeda, fuso, modo demonstração ou conectar Mercado Livre.
2. **Visão geral:** título, filtro de data e canal, badge `Atualizado há...`, cards: vendas elegíveis, pedidos, ticket médio, margem estimada (com nível de confiança); série diária; ranking SKUs; perdas; produtos sem custo/sem vínculo; alerta de sincronização.
3. **Vendas:** tabela pesquisável (data, pedido, canal, status, itens, bruto, taxas conhecidas, resultado estimado); detalhe em painel lateral com breakdown de custo; tag 'custos incompletos'.
4. **Produtos:** grid/tabela alternável; SKU, produto, custo atual, estoque interno, anúncios vinculados; drawer de cadastro/vínculo; avisos 'anúncio sem SKU'.
5. **Estoque:** filtros depósito/SKU, saldo estimado atual; ação registrar entrada, saída, ajuste, saldo inicial; histórico imutável com autor e referência; indicar que anúncios externos são comparativos.
6. **Perdas:** cards de quantidade e valor conhecido, gráfico por motivo, listagem, modal 'Registrar perda' com produto, depósito, quantidade, motivo e custo snapshot.
7. **Financeiro:** receitas elegíveis vs custos estimados e taxas conhecidas; filtros, distribuição por canal, índice de completude; sem prometer conciliação real.
8. **Integrações:** cards por canal; botão `Conectar Mercado Livre`, estado de autorização, sync, data da última sincronização e histórico de execuções; demais canais como `planejado`, nunca simular conexão ativa.

## Wireframe textual: dashboard

```text
┌─────────────────────────────────────────────────────────┐
│ SellerOS  / Visão geral     [30 dias ▾] [Canal ▾]       │
│                      Dados atualizados 12:04           │
├─────────────┬────────────┬───────────┬─────────────────┤
│ Vendas      │ Pedidos    │ Ticket    │ Margem estimada │
│ R$ ...      │ ...        │ R$ ...    │ ...  ! parcial  │
├────────────────────────────┬────────────────────────────┤
│ Evolução de vendas         │ Vendas por canal           │
│ [gráfico temporal]         │ [barras]                   │
├────────────────────────────┼────────────────────────────┤
│ Produtos de maior receita  │ Atenção necessária         │
│ [tabela]                   │ [sem custo/sem vínculo]    │
└────────────────────────────┴────────────────────────────┘
```

## Sistema visual inicial (proposta)

- Canvas: `#F8F9FB`; superfícies: `#FFFFFF`; bordas `#E5E7EB`.
- Texto principal: `#17212B`; secundário `#667085`.
- Primária/interação: `#175CD3` (azul sóbrio); sucesso: `#067647`; aviso: `#B54708`; erro: `#B42318`.
- Fontes: `Inter` ou `Geist` (preferência pelo que for possível embutir via pacote legalmente licenciado; não redistribuir fontes aqui).
- Escala espacial: 4, 8, 12, 16, 24, 32 px. Radius 8–12px em cards; sombras muito discretas.
- Cards de números grandes com contexto pequeno; tabelas compactas com zebra apenas se melhorarem a leitura.
- Sidebar 240px; topo 64px; conteúdo max-width 1440px e margens fluidas.
- Desktop-first, responsividade planejada (no celular, cards empilhados e tabelas em modo compacto).

## Estados imprescindíveis

Carregando, vazio, erro recuperável, sem permissão, sincronizando, dados desatualizados, custo incompleto, sem vínculo SKU, desconectado. Nunca preencher gráfico com dado fictício sem marcar `Demonstração`.

## Componentes

`AppShell`, `Sidebar`, `PageHeader`, `PeriodFilter`, `ChannelFilter`, `KpiCard`, `StatusBadge`, `SyncStatus`, `DataTable`, `EmptyState`, `AlertBanner`, `Money`, `CostCoverageIndicator`, `ProductPicker`, `OrderDetailDrawer`, `MovementModal`, `LossModal`.

## Acessibilidade

Contraste AA, navegação teclado, rótulos em inputs, foco visível, feedback após ações, e não depender apenas de cores para status.
