# 11 — Validação e entrega da Etapa 01

Validação executada em **04/11/2026**, fuso America/Sao_Paulo, com Node 22.23.3, pnpm 11.25.0 e Docker Compose 5.6.1.

## Resultados

| Verificação executada                                                                                    | Resultado                                                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm install`                                                                                           | Aprovada após correções descritas abaixo; lockfile gerado                                    |
| `pnpm install --frozen-lockfile`                                                                         | Aprovada, sem alterações nas resoluções                                                      |
| `pnpm lint`                                                                                              | Aprovada, zero warnings                                                                      |
| `pnpm format:check`                                                                                      | Aprovada                                                                                     |
| `pnpm typecheck`                                                                                         | Aprovada nos quatro workspaces                                                               |
| `pnpm test`                                                                                              | **12 testes aprovados**, 3 arquivos, zero falhas na execução final                           |
| `pnpm build`                                                                                             | Aprovada para shared, API, worker e web                                                      |
| `docker compose --env-file .env -f infra/docker-compose.yml up -d --wait`                                | Aprovada; PostgreSQL e Redis healthy                                                         |
| `docker compose ... exec -T postgres psql -U selleros_local -d selleros -c 'SELECT 1 AS connection_ok;'` | Aprovada; retorno 1, nenhuma tabela criada                                                   |
| `docker compose ... exec -T redis redis-cli ping`                                                        | Aprovada; PONG                                                                               |
| `pnpm dev`                                                                                               | Web, API e worker inicializados; worker conectou e fez PING real                             |
| Navegador em `http://localhost:5173`                                                                     | Página renderizada e botão confirmou “API disponível. Conexão estabelecida.”                 |
| HTTP real `/health` da API compilada, porta temporária 3001                                              | Aprovada; status 200 e contrato esperado                                                     |
| API e worker compilados: início e SIGTERM                                                                | Aprovada; saída 0, worker registrou encerramento                                             |
| Worker compilado com REDIS_URL de protocolo inválido                                                     | Aprovada; saída 1, sem URL nos logs                                                          |
| `pnpm infra:down`                                                                                        | **Falhou por permissão do daemon Docker**; containers permanecem ativos, volumes preservados |
| Varredura de padrões reconhecíveis de tokens e chaves privadas                                           | Nenhuma ocorrência nos fontes/documentos                                                     |
| `.gitignore` em repositório Git temporário isolado                                                       | Excluiu `.env`, `.env.production`, env aninhado, chaves e secrets; permitiu `.env.example`   |

Os smokes dos processos compilados usaram `node --env-file=../../.env dist/main.js` dentro de cada aplicação, ambiente da API sobrescrito para porta 3001, requisição HTTP e encerramento SIGTERM. Testes unitários cobrem health, inicialização sem banco, IDs de correlação, CORS permitido/negado/preflight, 404, erro 500, validação 400, configuração inválida e logs sem valores secretos de teste.

Evidência visual: [página inicial e comunicação com API](evidencias/etapa-01-web.png).

## Erros encontrados e correções

- A pasta fornecida contém o blueprint em um subdiretório e não tem Git funcional. Implementação mantida em `selleros-blueprint/`; não foi criado commit nem alterado o diretório `.git` do ambiente.
- Sandbox bloqueou inicialmente consultas de dependências e acesso ao socket Docker. As operações foram refeitas com a permissão de execução externa disponibilizada pelo ambiente.
- pnpm 10 declarado inicialmente divergia do pnpm 11.25.0 instalado. Alinhados `packageManager`, engines e documentação; configuração pnpm 11 em `pnpm-workspace.yaml`.
- Script esbuild bloqueado pelo pnpm 11: incluído `allowBuilds: { esbuild: true }`, sem liberar genericamente scripts de terceiros. A opção antiga `onlyBuiltDependencies` foi removida conforme a [documentação do pnpm](https://pnpm.io/cli/approve-builds).
- ESLint 9 foi sinalizado como sem suporte pelo registro. Atualizado para ESLint 10, verificando compatibilidade dos plugins. O mínimo Node foi ajustado para 22.13 conforme engines do ESLint.
- Typecheck detectou que o handler Fastify recebe erro `unknown`. Adicionada verificação de objeto/status numérico antes de utilizá-lo.
- Um teste de origem inválida falhou porque `new URL` lançava erro dentro do refinamento Zod. Adicionado `URL.canParse` antes da interpretação, também na configuração Redis.
- Aviso de depreciação de `disableRequestLogging` no Fastify: removida a opção; usados logs nativos com serializers restritivos e correlação. Execução final sem esse aviso.
- A parada intencional do `pnpm dev` por Ctrl+C retorna 130/SIGINT e o pnpm imprime “Failed” para os watchers interrompidos. Não é falha de inicialização; os processos compilados encerraram com saída 0 no teste separado.

## Limites da validação e estado final

- Não foi validado histórico Git nem realizado commit, pois a pasta recebida não é um repositório Git funcional. A varredura de padrões não equivale a auditoria completa de segredos; os únicos valores de acesso criados são os exemplos locais explícitos.
- Não foram testados produção, deploy, outras versões de Node/sistemas operacionais, autenticação, migrations, modelagem ou integrações externas. Estão fora da Etapa 01.
- Navegação verificada no navegador local; não foi criada suíte E2E Playwright nem realizada auditoria completa de acessibilidade/responsividade.
- Volumes persistentes estão configurados e foram criados pelo Compose. Não foi realizado ensaio de recuperação de dados/backup ou persistência após falha abrupta.
- Os processos de desenvolvimento foram encerrados após o smoke. A tentativa `pnpm infra:down` falhou: o daemon Docker retornou `cannot stop container: permission denied`, mesmo com execução externa autorizada. Os containers PostgreSQL e Redis permanecem ativos; os volumes não foram removidos. A parada depende de corrigir a permissão do daemon/host e repetir `pnpm infra:down`. `.env` local foi criado a partir do exemplo e permanece ignorado.
- Para reiniciar: `pnpm infra:up` e `pnpm dev`.
- Decisões pendentes e revisão do SQL em `docs/10-fundacao.md`. A Etapa 02 não foi iniciada.

## Inventário de arquivos

Modificado: `README.md` (instruções operacionais e status da fundação).

Preservados sem alteração: `docs/01` a `docs/09` e `database/001_initial.sql`.

Criados (arquivos de instalação/build e `.env` local não são entregáveis versionáveis):

```text
.editorconfig
.env.example
.gitignore
.node-version
.npmrc
.prettierignore
.prettierrc.json
AGENTS.md
apps/api/package.json
apps/api/src/app.test.ts
apps/api/src/app.ts
apps/api/src/config.ts
apps/api/src/logger.test.ts
apps/api/src/logger.ts
apps/api/src/main.ts
apps/api/src/modules/health/routes.ts
apps/api/src/plugins/errors.ts
apps/api/tsconfig.build.json
apps/api/tsconfig.json
apps/web/index.html
apps/web/package.json
apps/web/src/App.tsx
apps/web/src/lib/api.ts
apps/web/src/main.tsx
apps/web/src/styles.css
apps/web/tsconfig.json
apps/web/vite.config.ts
apps/worker/package.json
apps/worker/src/config.test.ts
apps/worker/src/config.ts
apps/worker/src/main.ts
apps/worker/src/worker.ts
apps/worker/tsconfig.build.json
apps/worker/tsconfig.json
docs/10-fundacao.md
docs/11-validacao-etapa-01.md
docs/evidencias/etapa-01-web.png
eslint.config.js
infra/docker-compose.yml
package.json
packages/shared/package.json
packages/shared/src/index.ts
packages/shared/tsconfig.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
```
