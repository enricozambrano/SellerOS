# SellerOS

Fundação técnica de uma plataforma SaaS de gestão operacional e financeira para vendedores de marketplaces. **Etapa 01:** página inicial, API de saúde, worker preparado para Redis e infraestrutura local. Nenhuma funcionalidade de negócio foi implementada.

## Requisitos

- Node.js 22.13+ na série 22 (validado com 22.23.3), ou série 24.
- pnpm **11.25.0**, fixado no `packageManager`.
- Docker Engine/Desktop em execução e Docker Compose com suporte a `up --wait`.
- Portas locais livres: 5173 (web), 3000 (API), 5432 (PostgreSQL), 6379 (Redis).

Se precisar instalar o gerenciador: `npm install --global pnpm@11.25.0`.

## Configuração e execução local

Execute na raiz do monorepo, a pasta `selleros-blueprint/` que contém este README:

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm dev
```

Copie o exemplo apenas na primeira configuração, preservando um `.env` existente. Os valores de acesso do exemplo são fictícios e exclusivos de desenvolvimento. Não use esses valores em produção. O `.env` está no `.gitignore`.

- Abra [SellerOS](http://localhost:5173).
- Clique em **Verificar conexão com a API** para testar a comunicação HTTP real.
- Consulte [saúde da API](http://localhost:3000/health) ou execute `curl http://localhost:3000/health`.
- Resposta esperada: `{"status":"ok","service":"selleros-api"}`.
- O worker registra `Worker inicializado` após conectar e executar PING no Redis. Ele permanece conectado, sem consumir filas ou sincronizar dados.

`pnpm dev` inicia os três processos com atualização durante o desenvolvimento. PostgreSQL e Redis são iniciados separadamente pelo Compose. `Ctrl+C` encerra os processos; API e worker tratam SIGINT/SIGTERM. Para executar individualmente:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

A API não acessa o banco nesta etapa e `/health` verifica somente o processo HTTP. PostgreSQL e Redis possuem healthchecks próprios:

```bash
pnpm infra:status
pnpm infra:down
```

O comando `infra:down` preserva os volumes. **Não use `down -v` para uma parada comum:** essa opção apaga dados locais. O SQL de `database/` não é montado ou executado pelo Compose.

## Configuração por ambiente

| Variável                                            | Uso                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `API_HOST`, `API_PORT`                              | Endereço/porta Fastify; padrão loopback e 3000                           |
| `CORS_ORIGINS`                                      | Origens HTTP/HTTPS exatas, separadas por vírgula, sem barra final ou `*` |
| `LOG_LEVEL`                                         | Nível dos logs JSON da API/worker                                        |
| `VITE_API_URL`                                      | URL pública da API, incorporada ao frontend no build                     |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Inicialização do banco local                                             |
| `POSTGRES_PORT`                                     | Porta publicada em loopback pelo Compose                                 |
| `DATABASE_URL`                                      | Reservada para a persistência futura; não consumida nesta etapa          |
| `REDIS_PORT`                                        | Porta publicada em loopback pelo Compose                                 |
| `REDIS_URL`                                         | Conexão do worker; aceita `redis://` ou `rediss://`                      |

API/worker carregam `.env` da raiz nos scripts `dev` e `start`. O Vite lê a mesma pasta e só expõe variáveis com prefixo `VITE_`. **Nunca coloque segredos em VITE_**. Alterações no ambiente exigem reiniciar os processos; a configuração frontend de produção exige novo build.

Se alterar portas, ajuste também as URLs correspondentes. Ao acessar a web por `127.0.0.1` em vez de `localhost`, inclua `http://127.0.0.1:5173` em `CORS_ORIGINS`. CORS restringe o acesso do navegador, não substitui autenticação. Não exponha esta fundação publicamente.

Os serviços Compose têm volumes persistentes. Alterar usuário/senha no `.env` não reconfigura automaticamente um banco já inicializado. Use o valor original ou faça uma alteração administrativa explícita; não apague o volume para contornar isso sem avaliar seus dados.

## Qualidade e build

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
# Todos os comandos acima em sequência:
pnpm check
# Aplicar formatação:
pnpm format
```

Vitest usa Fastify inject para validar inicialização, contrato de saúde, CORS, erros, correlação e ausência de vazamento nos logs. Também valida configuração do worker. Os testes unitários não dependem de Docker; a validação real de infraestrutura é separada.

Após `pnpm build`, execute em terminais separados:

```bash
pnpm --filter @selleros/api start
pnpm --filter @selleros/worker start
pnpm --filter @selleros/web preview --port 5173
```

Builds ficam em `dist/` de cada workspace. `preview` serve para verificação local do build, não para hospedagem de produção.

## Estrutura

```text
selleros-blueprint/
├── apps/
│   ├── web/             # React, Tailwind, cliente HTTP e página inicial
│   ├── api/             # Fastify, configuração, erros, logs e módulo health
│   └── worker/          # Configuração, conexão Redis e encerramento
├── packages/
│   └── shared/          # Contratos públicos HealthResponse/ApiErrorResponse
├── infra/
│   └── docker-compose.yml
├── database/
│   └── 001_initial.sql  # Proposta NÃO validada/executada
├── docs/                # Blueprint, decisões e relatório de validação
├── AGENTS.md
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
└── vitest.config.ts
```

## Documentação e continuidade

Leia `docs/01` a `docs/09` para contexto de produto, requisitos, design, arquitetura, modelo proposto, integrações, roadmap e riscos. [Decisões da fundação](docs/10-fundacao.md) registra divergências de escopo e pontos do SQL que precisam de revisão. [Validação executada](docs/11-validacao-etapa-01.md) distingue testes reais de limitações. [AGENTS.md](AGENTS.md) reúne as diretrizes permanentes.

O Sprint 0 e o prompt antigo em `docs/07` e `docs/08` incluem itens que **foram explicitamente adiados** pelo pedido da Etapa 01: autenticação, Prisma/schema, migrations, seed e domínio. `database/001_initial.sql` é somente referência e não deve ser aplicado antes de revisão e autorização.

Princípios preservados: isolamento por organização, Mercado Livre inicialmente somente leitura, importações idempotentes, estoque interno separado do marketplace, sem baixa por importações históricas, custos desconhecidos como NULL, snapshots históricos e margem estimada com faltas visíveis. Não iniciar Etapa 02 ou modelagem sem autorização.
