# 13 — Etapa 02B.0: preparação da persistência

Validações operacionais realizadas em 05/11/2026; revisão final e entrega em 20/11/2026 (America/Sao_Paulo). Base confirmada: PR #1 integrado por squash em `9276392e336a830f2774e5e8a4d0be99e7a61a86`; documento aprovado de 22 tabelas presente em main. Branch desta entrega: `feature/etapa-02b0-persistencia`.

## Escopo e resultado

Infraestrutura de testes e Prisma preparada, com conexão real ao PostgreSQL 17 e parada limpa específica do projeto validada. **O defeito de parada normal do Docker Snap permanece no host**; causa identificada e alternativa segura documentada. Não foi declarada correção global do daemon.

Nenhuma tabela de negócio, migration, RLS, autenticação ou endpoint foi implementado. O SQL inicial permanece byte a byte intacto e não foi executado. O schema Prisma tem somente datasource e generator. As consultas executadas foram de identidade/metadados; `migrate status` consultou a ausência de histórico, sem aplicar migrations. Não foi executado deploy, reset ou db push.

## Diagnóstico Docker: causa comprovada e limites

- Contexto `default`; socket Unix em `/var/run/docker.sock`, equivalente a `/run/docker.sock`. Modo `0660`, proprietário root, grupo docker; usuário executor pertence ao grupo. Não é ausência de permissão de leitura/escrita no socket.
- Dois processos rootful coexistem: Docker nativo 29.9.2 (`/usr/bin/dockerd`, serviço docker.service) e Snap 29.8.0 (`/var/snap/docker/common/var-lib-docker`, serviço snap.docker.dockerd). Não foi identificado modo rootless no daemon acessado.
- O endpoint consultado durante os smokes respondeu como Snap 29.8.0. Ambos os caminhos de socket apontaram ao mesmo daemon; escolher outro nome para o contexto não separaria esses sockets. Não foi alterado o contexto global.
- Logs de 04/11 às 22:59 correlacionam `unable to signal init: permission denied` no serviço Snap com auditoria do kernel: AppArmor `DENIED`, operação `signal`, perfil receptor `docker-default`, peer `snap.docker.dockerd`, sinais INT/TERM/KILL. Isso comprova a negação entre perfis como causa imediata da falha documentada. Coexistência das instalações é risco operacional observado; não se afirma sem investigação adicional qual instalação carregou o perfil originalmente.
- A parada normal do container de testes nesta etapa reproduziu `cannot stop container: permission denied`. O PostgreSQL continuava acessível; não foi forçado kill ou desabilitado controle de segurança.

Comandos de diagnóstico usados: `id`, `docker context show/ls`, `stat` do socket, `docker info`, `docker ps`, `ps` dos daemons, `systemctl cat/is-active`, `ss -lxnp`, `snap list docker`, journal do serviço e kernel (incluindo boot histórico). Nenhum segredo foi necessário nos logs registrados neste documento.

### Alternativa segura aplicada ao projeto

`pnpm db:test:stop-postgres` solicita encerramento PostgreSQL **smart** como usuário postgres dentro do container de testes. Esse modo espera conexões encerrarem e não apaga dados. O script usa `pg_ctl -W` e confirma independentemente `State.Status=exited` e `ExitCode=0`, pois o processo docker exec pode terminar junto com PID 1. Só depois executar `pnpm db:test:down`, que remove container/rede parados e preserva o volume nomeado.

Foi observado `database system is shut down`, saída 0 e reinicialização com o mesmo identificador de cluster. O primeiro ensaio com pg_ctl aguardando internamente retornou falha do exec apesar do shutdown limpo; o script final evita confundir esse retorno com sucesso ou falha do servidor e verifica seu estado. Se clientes mantiverem conexões abertas e a parada não for confirmada em 30 segundos, o comando falha; encerrar os clientes normalmente e verificar novamente, sem kill forçado. Referência: [pg_ctl PostgreSQL 17](https://www.postgresql.org/docs/17/app-pg-ctl.html).

Não foram usados chmod 666, mudanças no AppArmor/seccomp, reinício/desativação/desinstalação dos daemons, remoção de volumes ou ações sobre containers de outros projetos. O único container de outro projeto que estava ativo continuou ativo. Containers históricos do SellerOS de desenvolvimento já estavam parados e permaneceram assim.

**Pendência administrativa:** eliminar a ambiguidade entre instalações e reparar a integração de perfis com manutenção aprovada do host, preservando workloads/volumes. Não há autorização nesta entrega para interromper esses outros projetos. A alternativa permite o ciclo do PostgreSQL de testes aqui validado; não prova que a parada normal do Docker foi reparada. Antes de qualquer futura migration, repetir o ciclo seguro no ambiente alvo; se ele falhar, bloquear a validação. A revisão da 02B.1 deve decidir se aceita a alternativa documentada enquanto a correção global está pendente.

## Versões e localização

| Componente                      | Escolha/validação                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Node / pnpm                     | 22.23.3 / 11.25.0, stack existente                                                               |
| Prisma CLI, client e adapter-pg | 7.10.1 exato nos três pacotes, linha estável 7; não adotada a atualização RC 8 sugerida pela CLI |
| TypeScript                      | 5.9.3 resolvido pelo lockfile existente                                                          |
| Driver pg direto de smoke       | 8.16.3 exato                                                                                     |
| PostgreSQL                      | imagem postgres:17-alpine; servidor observado 17.11                                              |
| Docker / Compose usados         | Snap Engine 29.8.0 / Compose 5.6.1                                                               |

Engines publicados do Prisma escolhido aceitam Node ^22.12 e TypeScript >=5.4; compatibilidade também validada por geração, typecheck e consulta reais. As dependências novas ficam em devDependencies da raiz porque são ferramentas locais; API/worker não importam Prisma nesta etapa. Quando houver runtime de persistência, posicionar dependências de produção no pacote servidor apropriado, sem expô-las em shared/frontend.

`prisma.config.ts` define `prisma/schema.prisma`, `prisma/migrations` e conexão somente de teste. `generated/prisma` contém cliente gerado ignorado pelo Git/formatter/lint. Os únicos novos scripts de instalação permitidos no pnpm são prisma e @prisma/engines, além do esbuild já existente. Lockfile atualizado de forma aditiva, sem atualização deliberada das dependências anteriores.

Os resultados operacionais abaixo registram o ambiente observado em 05/11; não afirmam que versões ou o estado global do Docker permaneceram iguais em 20/11.

A tag da imagem mantém patch móvel dentro da série 17; fixação por digest e rotina de atualização ficam como endurecimento posterior. O schema vazio é válido e gera cliente que permite consulta de metadados, sem criar tabelas. Referências oficiais: [configuração Prisma v7](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [generator Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators).

## Ambientes e proteção de destino

| Aspecto              | Desenvolvimento existente           | Testes novos                                                   |
| -------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Arquivo              | .env (preservado)                   | .env.test (ignorado; gerado com modo 0600)                     |
| Compose/projeto      | infra/docker-compose.yml / selleros | infra/docker-compose.test.yml / selleros-test                  |
| Banco/usuário padrão | selleros / selleros_local           | selleros_integration_test / selleros_integration_test          |
| Porta host padrão    | 5432                                | 55432, exclusivamente 127.0.0.1                                |
| Volume               | selleros_postgres_data              | selleros-test_postgres_test_data, label integration-tests-only |
| Rede                 | selleros_default                    | selleros-test_default                                          |
| Credencial           | configuração local anterior         | senha aleatória própria de 32 bytes, não versionada            |

`pnpm db:test:setup` cria .env.test **somente se não existir**. Não copie a senha de desenvolvimento. Variáveis: TEST_POSTGRES_DB, TEST_POSTGRES_USER, TEST_POSTGRES_PASSWORD, TEST_POSTGRES_PORT. Alterar valores após inicialização não reconfigura o usuário/banco de um volume existente; preservar arquivo e volume correspondentes, nunca apagar volume para resolver divergência.

O guard valida nomes no formato selleros_*test, porta inteira não privilegiada diferente de 5432 e da porta dev, credenciais e nomes diferentes dos de desenvolvimento. Lê .env de desenvolvimento apenas para comparar; compara também DATABASE_URL herdada quando presente. Conexão é construída para 127.0.0.1 a partir de .env.test; não há fallback para DATABASE_URL e não aceita URL arbitrária de teste. Compose usa projeto/arquivo explícitos e valores validados, descartando COMPOSE_FILE/COMPOSE_PROJECT_NAME herdados. A configuração Prisma usa o mesmo guard inclusive quando a CLI é chamada diretamente.

Esses controles previnem erro operacional, não são sandbox contra alguém que deliberadamente altera scripts/configuração ou executa SQL manual. Não executar testes destrutivos, reset, db push ou migrations de teste no banco de desenvolvimento. Nenhum comando de remoção de volumes é exposto. Somente os comandos documentados são aceitos pelo wrapper; argumentos extras são rejeitados. Não usar o superusuário de testes como prova de RLS: roles não privilegiadas serão criadas e exercitadas na 02B.1. O usuário de bootstrap da imagem é administrativo apenas deste cluster isolado.

## Comandos

Na raiz selleros-blueprint:

```bash
pnpm install --frozen-lockfile
pnpm db:test:setup
pnpm db:test:up
pnpm db:test:status
pnpm db:test:check
pnpm db:validate
pnpm db:test:prisma
pnpm db:typecheck
pnpm test:db-config
# Neste host com falha AppArmor, encerrar o PostgreSQL antes do Compose:
pnpm db:test:stop-postgres
pnpm db:test:down
```

Não repetir setup se .env.test já existe: a recusa protege a senha do volume. db:test:check usa pg; db:test:prisma gera cliente e consulta pelo ORM; ambos verificam banco/usuário esperado. db:typecheck verifica configuração e smoke TS após geração. Os checks comuns permanecem disponíveis em `pnpm check`; a suíte test inclui os guards sem exigir Docker/.env.test. A geração/validação Prisma exige .env.test mesmo sem conexão, por projeto (falha fechada).

Para hosts sem o defeito, `db:test:down` pode encerrar diretamente; aqui sua falha foi registrada e o caminho validado é stop-postgres seguido de down. A parada smart não é destrutiva, mas requer ausência de clientes ativos. O volume continua disponível para o próximo up.

### Estratégia futura de migrations

- `pnpm db:migrate:status:test`: consulta estado somente no teste; nesta etapa retorna código 1 porque não existe histórico nem _prisma_migrations. Isso é esperado, não motivo para baseline do SQL inicial.
- `pnpm db:migrate:deploy:test`: preparado para aplicar **migrations já revisadas**, apenas ao teste validado. Não foi executado nesta entrega porque não há migration a aplicar.
- Autoria de migration, banco shadow, roles de migrador/runtime e políticas RLS serão definidos na 02B.1 após autorização. Não se oferece migrate dev/reset automático; nenhum schema de domínio foi antecipado.
- Toda customização SQL aprovada fará parte da migration Prisma versionada. O arquivo database/001_initial.sql não deve ser montado no entrypoint nem aplicado em paralelo.
- Não há configuração de deploy em produção ou migrations no banco de desenvolvimento nesta etapa.

## Evidências de validação

| Verificação                  | Resultado real                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Git / modelagem              | PR #1 merged, squash confirmado; main atualizado e branch criada a partir dele                                              |
| Docker diagnóstico           | Causa AppArmor/Snap comprovada no journal histórico; parada normal reproduziu permission denied                             |
| PostgreSQL teste             | Inicializado healthy, loopback 55432; SELECT de identidade confirmou banco/usuário e versão 17.11                           |
| Isolamento de credenciais    | Credencial de desenvolvimento recusada pelo teste com SQLSTATE 28P01                                                        |
| Isolamento de banco          | Nome do banco dev ausente no catálogo do cluster teste; zero tabelas em public                                              |
| Isolamento de armazenamento  | Inspeção dos dois containers mostrou volumes selleros_postgres_data e selleros-test_postgres_test_data distintos            |
| Persistência / parada segura | pg_ctl smart + confirmação exited/0 + Compose down; up posterior preservou identificador do cluster; nenhum volume removido |
| Prisma validate / generate   | Schema vazio validado, cliente 7.10.1 gerado sem modelos                                                                    |
| Prisma conexão               | Consulta ORM de identidade aprovada no PostgreSQL real; não baseada em mock                                                 |
| Migrate status               | Código 1 esperado: nenhuma migration e banco ainda não gerenciado pelo Migrate                                              |
| db:typecheck                 | Aprovado para configuração/smoke e cliente gerado                                                                           |
| Qualidade                    | lint, format:check, typecheck, 12 testes existentes e build aprovados; dez casos de guard também aprovados                  |

A primeira instalação foi interrompida pela proteção de scripts do pnpm; foram liberados explicitamente apenas prisma/@prisma/engines e a instalação concluída. A primeira execução de CLI dentro do sandbox não conseguiu iniciar o subprocesso; execução autorizada fora dele validou a CLI. O lint detectou exigência de preservar cause em erro capturado; corrigido sem exibir o erro bruto/segredos. Nenhuma dessas falhas foi tratada como sucesso.

Estado final: container/rede de testes removidos após shutdown limpo, volume de testes preservado; .env.test local preservado e ignorado; desenvolvimento e outros projetos não alterados. Nenhuma migration ou entidade de negócio criada.

## Pendências e próximo limite

Correção administrativa da coexistência Docker/perfis continua pendente, assim como roles/RLS, banco shadow, migrations e testes de isolamento por tenant. Esta etapa comprova separação **entre ambientes**, não isolamento multiempresa. O guard não substitui revisão de migrations nem privilégios mínimos. Retenção de backups e chaves de produção continuam fora do escopo.

Parar após 02B.0. A implementação das entidades/policies exige autorização da 02B.1 e sua prova técnica antes das demais fatias.

## Revisão final em 20/11/2026

Reexecutados com sucesso `pnpm check` (lint, formatação, typecheck, 12 testes Vitest,
dez casos node:test e build), `pnpm db:typecheck`, `pnpm db:validate`,
`pnpm install --frozen-lockfile` e `git diff --check`. A CLI Prisma exigiu execução
fora da restrição de subprocessos do sandbox; a repetição autorizada passou.
O SQL de referência e a modelagem aprovada foram comparados byte a byte com
origin/main e permanecem intactos. O smoke de Docker/banco descrito acima é o
registro real de 05/11; ele não foi reexecutado nesta revisão final.
