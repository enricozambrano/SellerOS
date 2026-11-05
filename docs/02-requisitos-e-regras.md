# 02 — Requisitos funcionais e regras de negócio

## Histórias prioritárias e aceite

**US-01 Cadastro.** Como proprietário, crio organização e entro no app.
- Aceite: só membro autorizado acessa registros da própria organização; usuário sem organização é conduzido ao onboarding.

**US-02 Conectar Mercado Livre.** Como proprietário, autorizo minha conta seller.
- Aceite: OAuth `state` válido; tokens jamais expostos ao frontend; credenciais armazenadas criptografadas; seller ID vinculado à organização; UI exibe status.

**US-03 Importação de pedidos.** Como proprietário, vejo pedidos importados com itens, quantidades e status.
- Aceite: `UNIQUE(integration_account_id, external_order_id)`; reimportação atualiza o mesmo pedido; webhook não cria duplicatas; paginação e retry existem.

**US-04 Catálogo.** Crio produto/SKU interno e vinculo anúncio/variação do ML.
- Aceite: SKU único na organização; anúncio externo pode existir sem vínculo; interface destaca não vinculados.

**US-05 Custos.** Cadastro custo de aquisição por SKU com data de vigência e taxas conhecidas por pedido.
- Aceite: margens com dados ausentes são marcadas 'incompletas'; pedidos registram snapshot de custo e origem da estimativa.

**US-06 Estoque.** Registro saldo inicial e movimentações num depósito.
- Aceite: cada movimentação tem quantidade assinada, ator, origem, referência e timestamp; nunca corrigir histórico via UPDATE/DELETE, usar estorno/ajuste.

**US-07 Perdas.** Registro avaria, extravio ou divergência, com quantidade e custo do momento.
- Aceite: cada perda gera exatamente 1 movimentação negativa de estoque; valor total = qtd * custo_snapshot (se conhecido); as perdas são mostradas separadamente do COGS das vendas.

**US-08 Dashboard.** Filtro período e vejo faturamento bruto, pedidos, ticket médio, margem estimada, custo não informado, perdas.
- Aceite: mesmo intervalo temporal e fuso para cards, gráficos e exportações; pedidos cancelados não compõem faturamento líquido operacional; documentar regras de devolução/refund.

**US-09 Integrações.** Vejo última execução, mensagens de erro e status.
- Aceite: erro 401 permite reconectar, erro 429 entra em retentativa com backoff, jobs podem ser repetidos sem corrupção.

## Regras de negócio

1. **Fonte de verdade das vendas:** marketplace para pedidos externos; usuário não altera o total importado manualmente. Uma venda manual é outro tipo de pedido.
2. **Fonte de verdade do estoque físico:** ledger interno, informado/ajustado pelo seller. Estoque disponível no anúncio externo é um snapshot comparativo, não o saldo físico.
3. **Sem baixa automática de estoque no MVP inicial.** Importação de vendas históricas não deve reduzir estoque já contabilizado pelo seller. Implementar baixa automática somente depois de `cutover_at`, com política por fulfillment, venda/cancelamento/retorno e idempotência.
4. **SKU interno != ID de anúncio.** Um SKU interno pode ter múltiplos anúncios nos canais; cada anúncio/variação possui identidade externa própria.
5. **Margem estimada** = receita de pedidos elegíveis - custo dos itens vendidos - despesas/taxas conhecidas. Mostrar faltas: custo faltante, taxa não confirmada, reembolso parcial, frete/tributos desconhecidos. Não vender essa métrica como lucro líquido contábil.
6. **Snapshotted cost:** custo histórico da venda não muda automaticamente quando o custo cadastrado do produto é alterado; recalcular apenas por operação explícita e auditada.
7. **Pedido cancelado:** manter no banco com status, não apagar. Excluir de indicadores relevantes mediante filtro/regras.
8. **Moeda:** BRL por padrão, armazenar moeda em pedidos; nunca somar moedas distintas sem conversão documentada.
9. **Datas:** armazenar timestamps em UTC (`timestamptz`) e exibir em `America/Sao_Paulo` por padrão; definir claramente se período filtra por criação, pagamento ou conclusão da venda.
10. **Auditoria:** eventos importados e alterações de custos/perdas devem ter trilha auditável.
11. **Segurança:** isolar `organization_id` no backend em todas as consultas; não aceitar ID de organização do cliente sem conferência de membership.

## Cálculos sugeridos

- Pedidos elegíveis: status financeiro confirmado/efetivamente pago, desconsiderar cancelamentos e aplicar ajustes de reembolso quando conhecidos.
- `ticket_medio = vendas_elegiveis / quantidade_pedidos_elegiveis`, evitando divisão por zero.
- `cogs = SOMA(quantidade * custo_unitario_snapshot)` para itens mapeados.
- `margem_estimada = (receita_elegivel - cogs - taxas_e_frete_conhecidos - outros_custos_conhecidos) / receita_elegivel`.
- `cobertura_custo = itens_elegiveis_com_custo / total_itens_elegiveis`.
- `valor_perdas = SOMA(quantidade_perdida * custo_unitario_no_evento)`.
- Dashboard apresenta `parcial` quando cobertura de custos < 100% ou despesas relevantes desconhecidas.

Essas fórmulas são regras internas planejadas; validar significado de `total_amount`, taxas, descontos, frete, reembolsos e repasses no payload real do marketplace antes de afirmar rentabilidade final.
