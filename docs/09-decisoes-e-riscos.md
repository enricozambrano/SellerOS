# 09 — ADR inicial, hipóteses e riscos

## Decisões propostas (revisáveis)

| ID | Decisão | Motivo |
|---|---|---|
| ADR-01 | SaaS multi-tenant-ready mesmo no piloto de 1 conta | Evita remodelar a base depois |
| ADR-02 | Mercado Livre primeiro, apenas leitura | Reduz risco operacional e de permissões |
| ADR-03 | Estoque via ledger interno distinto de snapshot ML | Fonte e significado diferentes |
| ADR-04 | Sem baixa automática em vendas históricas | Evita descontar duas vezes |
| ADR-05 | Margem sempre estimada até conciliação completa | Evita indicadores enganosos |
| ADR-06 | PostgreSQL relacional + jsonb seletivo | Consistência sem descartar payloads úteis |
| ADR-07 | Worker e fila separados | Sync pode demorar e ter retries |
| ADR-08 | JWT via provedor gerenciado | Evita construir sistema de senhas inseguro |
| ADR-09 | UX focada em tabela, filtros e explicabilidade | Perfil do usuário operacional |

## Assuntos a validar antes de evoluir

- Se o público quer cadastro manual de venda ou só importação.
- Se a prioridade é **lucro** (taxas/COGS) ou **estoque** (saldo real, reservas, fulfillment).
- Como sellers lidam com custos de compras variáveis, kits, devoluções e estoque Full.
- Quem usará o app: dono sozinho, funcionário, contador, agência?
- Quais permissões e critérios de aprovação das APIs Shopee/TikTok Shop estarão disponíveis.
- Se os termos das APIs permitem armazenar exatamente os campos necessários e por quanto tempo.
- Como tratar taxas do marketplace e dados financeiros reais; possibilidade de usar APIs separadas.
- Política de controle de custo por lote (FIFO, média ponderada) em versões futuras.
- Modelo comercial: assinatura por loja, por pedido/mês, freemium etc.

## Riscos e resposta

1. **API não autoriza recurso:** marcar capability como indisponível, não bloquear domínio, importar CSV opcional em etapa futura.
2. **Dados financeiros incompletos:** exibir cobertura de dados e estimativas, nunca margem 'final' sem custos.
3. **Webhook falho:** sync recorrente e checkpoint + recuperação de notificações.
4. **Venda duplicada:** unique composto, upsert, idempotência.
5. **Estoque incorreto:** ledger manual até implantação segura de baixa automática.
6. **Token rotacionado em corrida:** lock por conta + persistência atômica.
7. **Abuso ou vazamento de dados:** isolamento tenant, criptografia, minimização, auditoria e retenção.
