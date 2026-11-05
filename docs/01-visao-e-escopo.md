# 01 — Visão de produto e escopo

## Proposição de valor

**SellerOS** (nome provisório) ajuda vendedores de marketplaces a entender operações e resultados sem manter várias planilhas: catálogo/SKU próprio, pedidos, estoque interno, custos, perdas e margem estimada por canal.

## ICP inicial

Vendedores individuais e pequenos negócios no Brasil que usam Mercado Livre e planilhas; preferencialmente 10–500 pedidos/mês e dificuldade de controlar margem e estoque. É hipótese a validar em entrevistas, não mercado já validado.

## Jobs to be done

1. Saber o que vendeu por período e por canal.
2. Saber quais produtos têm custo cadastrado e como se comporta a margem estimada.
3. Saber saldo físico informado, entradas, saídas e perdas de cada SKU.
4. Não lançar a mesma venda duas vezes quando a integração receber eventos repetidos.
5. Perceber quando uma integração precisa reconectar ou sincronizar.

## Personas

- **Dono do negócio:** acompanha faturamento, perdas e margem; cadastra custos.
- **Operador:** confere estoque e movimentações; consulta pedidos.

No MVP, só uma função proprietária ativa no UI; o banco suporta memberships e papéis para evolução.

## MVP — necessário

- Login com provedor de autenticação sólido; onboarding de organização.
- Conectar 1 conta Mercado Livre via OAuth com permissões mínimas de leitura.
- Sincronizar anúncios (quando permitidos), pedidos e itens, inclusive atualizações/cancelamentos.
- Produto interno com SKU único por organização, custo unitário e vínculo com anúncio/variação externa.
- Pedidos com filtros de período, status, marketplace e vinculação com SKUs.
- Estoque próprio: depósitos, abertura de saldo, compras/entradas, saídas/ajustes, perdas; histórico auditável.
- Dashboard: vendas brutas elegíveis, pedidos, ticket médio, cobertura de custo, margem estimada, perdas, alertas de estoque.
- Cadastro de custos operacionais/taxas por pedido (manual e/ou dado confiável do marketplace).
- Centro de integrações: status, última sincronização, erro, reconectar e sincronizar manualmente.
- Dados fictícios/seed para que a UI possa ser construída sem credenciais externas.

## Não fazer no MVP

- Emissão de NF-e, contabilidade, impostos complexos, PDV, compras completas, CRM, financeiro bancário.
- Publicar ou editar anúncios nos marketplaces.
- Atualizar estoque externo automaticamente.
- Unificação Shopee e TikTok Shop real antes de validar integração Mercado Livre.
- Previsões com IA sem históricos confiáveis.
- Declarações de lucro líquido contábil ou conciliação bancária.

## Indicadores de sucesso de produto (piloto)

- Cadastro e primeira visualização de pedidos concluídos sem intervenção técnica.
- Zero pedidos duplicados após importar novamente.
- Vendedor consegue vincular seus principais SKUs e preencher custos.
- Vendedor identifica pelo menos 1 ação útil a partir do dashboard em teste guiado.
- Erros da integração são explicados e recuperáveis.

## Roadmap de produto

V0: catálogo, movimentações manuais e dashboard com seed.
V1: Mercado Livre (read-only) com pedidos reais, anúncios, custos e indicadores.
V1.5: automação opcional de estoque com marco de corte e tratamento de cancelamento, devolução e Fulfillment.
V2: Shopee; V3: TikTok Shop; V4: conciliação financeira e integração fiscal mediante validação.
