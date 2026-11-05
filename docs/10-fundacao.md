# 10 — Decisões da Etapa 01

## Escopo aprovado

A solicitação da Etapa 01 substitui o escopo de fundação sugerido em docs/07 e docs/08: **não** implementar autenticação, modelagem definitiva, migrations, seed, CRUD ou integrações. O blueprint original e o SQL permanecem intactos como propostas. Nenhuma regra de negócio foi alterada.

A raiz do projeto é a pasta existente `selleros-blueprint/`. Renomeá-la não é necessário para o workspace `selleros` funcionar. O diretório pai fornecido pelo ambiente não contém um repositório Git funcional; não foi criado commit nem alegada verificação do histórico.

## Decisões técnicas

- Node 22 (mínimo 22.13; também Node 24), pnpm 11.25.0 fixado em packageManager; React 19, Vite 8, Tailwind 4, Fastify 5, TypeScript 5.9 e Vitest 4. Majors compatíveis, sem versões prerelease; resoluções exatas no lockfile. TypeScript permanece na série 5.9 para evitar migração adicional nesta fundação.
- ESM e build tsc para API/worker/shared; Vite para web. Shared contém apenas tipos de saúde e erro, consumidos com import type, sem exigir build prévio no dev.
- Zod valida configuração no início. `.env` único na raiz, carregado explicitamente por Node/tsx; Vite usa envDir e somente publica VITE_*.
- CORS usa lista exata de origens separadas por vírgula, sem wildcard ou credenciais. CORS não é autenticação: a API é local e ainda não tem endpoints de domínio.
- `/health` é liveness do processo Fastify e retorna `{status: "ok", service: "selleros-api"}`. Não comprova readiness de PostgreSQL/Redis. Ainda não há driver de banco na API.
- Erros HTTP têm `error.code`, `error.message` genérica e `error.requestId`. Logs são JSON; mensagens controladas, campos permitidos e serialização restritiva evitam que query strings, headers, corpos e erros brutos exponham dados.
- Worker conecta e faz PING ao Redis; tentativas de reconexão limitadas, encerramento por SIGINT/SIGTERM. Sem filas/consumidores ou sincronização. BullMQ será adicionado quando existir um trabalho definido.
- PostgreSQL 17 e Redis 7.4, imagens Alpine com patch móvel dentro da série estável. Volumes nomeados e Redis AOF. Não montar SQL de referência. Imagens por digest e atualizações controladas serão decisão de deployment futuro.
- Serviços locais publicados somente em loopback. Credenciais do exemplo são fictícias e exclusivas do ambiente local. Redis sem autenticação nesta rede local; qualquer exposição remota exigirá revisão.
- Fetch nativo com timeout no frontend; dependências de cache/formulários/componentes complexos ficam para as etapas que as demandarem. Fonte do sistema evita dependência externa.

Compatibilidade consultada nas fontes oficiais: [Vite](https://vite.dev/guide/), [Fastify LTS](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md). Versões disponíveis consultadas no registro npm; o lockfile registra as selecionadas.

## Revisão do SQL — pendências, sem execução ou alteração

1. **Isolamento de tenant:** FKs simples permitem combinar organization_id com produtos, depósitos, contas e pedidos de outra organização. Definir FKs compostas, autorização em serviços e eventual RLS antes das migrations; não tratar isso apenas como otimização posterior.
2. **Perda/movimento:** UNIQUE em inventory_movement_id impede duas perdas no mesmo movimento, mas não assegura tipo loss, tenant, quantidade inversa ou igualdade de custo. A criação atômica e os mecanismos de integridade precisam ser projetados e testados.
3. **Ledger e auditoria:** SQL ainda permite UPDATE/DELETE de movimentos e logs, e created_by é opcional. Definir privilégios, origem/ator de sistema, referências de estorno e imutabilidade.
4. **Pedidos e canal:** source e integration_account.provider podem divergir. O status normalizado mistura estados financeiros, logísticos e refund; definir elegibilidade e como preservar dimensões independentes antes dos indicadores.
5. **Datas e dinheiro:** vendas manuais não têm data de venda explícita equivalente a external_created_at. Definir base temporal; validar gross/refund, descontos, frete, moedas e precisão de custos. Não assumir que o default zero representa um valor financeiro confirmado.
6. **Custos:** current_unit_cost e histórico podem divergir; definir atualização transacional, vigência, custo desconhecido e política auditada para snapshots/reprocessamento. Avaliar precisão maior que duas casas para custo unitário conforme requisitos reais.
7. **Identidades externas:** COALESCE de variante NULL para string vazia pressupõe equivalência; confirmar normalização. Definir external_line_key estável. Unicidade de conta seller entre organizações e política de transferência ainda precisam de decisão.
8. **Atualização e privacidade:** updated_at não se atualiza sozinho; definir responsabilidade. Payloads/auditoria e e-mails exigem retenção/minimização. Segredos cifrados precisam de formato, chave e rotação; não introduzir secrets manager pago nesta etapa.
9. **Fonte única de migrations:** escolher fluxo Prisma após revisão. SQL e migrations geradas não devem ser executados em paralelo. Revisar índices com consultas reais, não criar schema agora.
10. **Integrações documentadas:** afirmações de docs/06 sobre limites, tokens, permissões e regras de 2026 devem ser revalidadas em fontes oficiais na etapa de integração; não foram tratadas como contratos implementados.

## Limites

Não há prontidão de produção, login, conexão de marketplace, modelo validado, dados de negócio, seed ou dashboard. O trabalho para ao concluir a Etapa 01. Resultados executados estão em `docs/11-validacao-etapa-01.md`.
