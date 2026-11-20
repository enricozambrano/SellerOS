# 14 — Etapa 02B.1: identidade e prova de isolamento

Entrega em 20/11/2026, America/Sao_Paulo. Base atualizada de origin/main em `e7d7d88` (PR #2 integrado). Branch `feature/etapa-02b1-isolamento`. Leituras: AGENTS.md, README, modelagem aprovada (especialmente 6.4 e 13) e relatório 02B.0; decisões anteriores permanecem referência. Escopo implementado: **app_users, organizations e organization_members**, primeira migration, bootstrap transacional e prova em PostgreSQL real. Sem catálogo, vendas, estoque, autenticação real ou conectores.

## Ambiente e condição antes da primeira migration

O ciclo exigido foi repetido **antes do deploy inicial**: up healthy -> consulta de identidade -> pg_ctl smart -> confirmação container exited/0 -> Compose down -> up -> nova consulta. Nenhum volume foi removido e não se usou db push/reset. A correção global de Docker/AppArmor continua pendente; foi utilizado o caminho seguro da 02B.0 aceito pelo pedido desta etapa. Nenhum daemon/perfil do host ou container alheio foi alterado.

PostgreSQL observado: **17.11**, imagem postgres:17-alpine. Prisma CLI/client/adapter-pg **7.10.1**, pg **8.16.3**, Node **22.23.3**, pnpm **11.25.0**, TypeScript **5.9.3**; dependências e lockfile preservados. O banco continua selleros_integration_test em loopback 55432 com volume selleros-test_postgres_test_data. O banco/credenciais de desenvolvimento não foram usados para DDL ou testes.

### Identidade fixada e deploy protegido

`db:test:enroll` faz enrollment explícito, somente se `.env.test.identity` não existir. Inspeciona labels Compose, estado do container e volume; compara o system_identifier obtido pela conexão TCP com o obtido por psql **dentro do container de testes**. Confere banco, usuário administrativo exclusivo e PostgreSQL 17. Persiste system_identifier, OID/nome do banco, usuário, versão major e volume, modo 0600, arquivo ignorado pelo Git. ID do container não é fixado porque muda em cada recriação; identidade do cluster e volume persistem.

`db:test:identity` compara os dados atuais com esse registro, sem aceitá-los novamente automaticamente. `db:test:preflight`, `db:migrate:deploy:test`, `db:migrate:status:test` e a suíte de integração exigem esse match. O preflight abre também conexão com a **credencial de migração** e confirma system_identifier, banco, usuário migrador e versão antes de chamar Prisma. URL, nome ou porta sozinhos não constituem prova. Registro ausente, cluster/OID diferente ou volume inesperado bloqueiam o comando.

O teste adulterou temporariamente apenas o ID no arquivo local e comprovou rejeição pelo mesmo preflight usado no deploy; restaurou o registro em finally. O guard unitário verifica diferença em cada campo. Não apagar/renovar o pin automaticamente para superar falha: mudança legítima de instância exige revisão explícita da origem e dos volumes. Isso é proteção operacional, não defesa contra quem pode deliberadamente editar scripts e credenciais administrativas.

Não foi usado banco shadow. O SQL base foi gerado com `prisma migrate diff --from-empty --to-schema ... --script`, sem conexão shadow; recebeu complementos SQL revisados no mesmo arquivo e foi aplicado por Prisma Migrate. Não executar a CLI de deploy diretamente para contornar o wrapper/preflight.

## Credenciais, proprietários e grants

`db:test:roles` conecta como o administrador exclusivo do cluster da imagem, depois do pin, e provisiona roles locais. Credenciais independentes são geradas aleatoriamente e gravadas em `.env.test.roles` (0600, ignorado), sem sobrescrever arquivo existente ou rotacionar senha automaticamente. Reexecutar provisionamento é idempotente; remoção/recriação de cluster exige revisão das credenciais existentes. Runtime não recebe credencial administrativa ou de migração.

| Role                           | Login / superuser / BYPASSRLS | Grants efetivos e finalidade                                                                                                                                                                         |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| selleros_test_migration        | sim / não / não               | Dono das três tabelas, enums, schema selleros e histórico _prisma_migrations; CREATE no banco/schema de testes; membership apenas das duas roles técnicas NOLOGIN. Nunca usada como runtime          |
| selleros_test_api              | sim / não / não               | SELECT nas três tabelas sob RLS; UPDATE somente email/name de perfil, name/timezone de organização e role/status de membership; INSERT em membership sob policy de owner; nenhum DELETE/TRUNCATE/DDL |
| selleros_test_bootstrap        | sim / não / não               | CONNECT, USAGE e EXECUTE bootstrap_organization/subject_id; nenhum acesso direto às tabelas                                                                                                          |
| selleros_test_worker           | sim / não / não               | CONNECT/USAGE; nenhum acesso às três tabelas de identidade; somente permissões de fixture durante a suíte                                                                                            |
| selleros_test_maintenance      | sim / não / não               | CONNECT/USAGE, sem DML ou rotinas de manutenção antecipadas                                                                                                                                          |
| selleros_test_policy           | não / não / não               | Dono das funções de policy/constraint; SELECT nas três tabelas e UPDATE(updated_at) em organization para serialização. Policy técnica permite essas leituras sem recursão                            |
| selleros_test_bootstrap_writer | não / não / não               | Dono da função de bootstrap; SELECT/INSERT em organization/membership apenas por esse caminho                                                                                                        |

Todas as roles de login criadas são NOCREATEDB/NOCREATEROLE/NOREPLICATION; API/bootstrap/worker/maintenance não são proprietárias de tabelas nem podem assumir migration/policy/bootstrap_writer. O migrador pode administrar objetos e assumir as duas roles técnicas; essa credencial é privilegiada e reservada ao pipeline local de migrations. A preferência de owner NOLOGIN da modelagem não foi necessária nesta fatia: o login migrador é o proprietário, separado de todos os logins de execução, testado com FORCE RLS. Nenhuma role recebe BYPASSRLS.

O administrador da imagem existe só para provisionamento e setup/limpeza de fixtures descartáveis; **não foi usado para provar acesso de execução**. CONNECT/TEMP/CREATE públicos do banco foram revogados via REVOKE ALL ON DATABASE FROM PUBLIC; CREATE no schema public também foi revogado. A migration não configura produção; seus nomes de roles são explícitos e requerem revisão de provisionamento ao definir outro ambiente.

## Modelo, constraints e migration

`prisma/migrations/202611200001_identity/migration.sql` contém o DDL gerado e os complementos PostgreSQL dentro de BEGIN/COMMIT. Uma única migration, aplicada do zero no banco antes vazio; uma segunda execução de deploy confirmou que não havia pendência. `migrate status` retornou sucesso, histórico atualizado. Nenhum arquivo de migration já aplicado foi modificado depois do deploy. A formatação posterior foi somente do schema Prisma.

- app_users: UUID, issuer/subject opcionais com unique composto, status active/disabled/anonymized, email/name opcionais, timestamps. Active/disabled exigem issuer/subject não vazios; anonymized exige identificadores, email e name NULL. Perfil global, sem senha ou mirror de auth real implementado.
- organizations: UUID, nome não vazio até 200 caracteres, BRL, timezone IANA validado contra pg_timezone_names, status active/suspended/pending_deletion, timestamps. Apenas BRL é habilitado nesta fatia conforme MVP; outras moedas continuam revisão posterior.
- organization_members: PK(organization_id,user_id), FKs RESTRICT, enums de papel/status, índice (user_id,status,organization_id), joined_at/updated_at. Chaves não podem ser trocadas. Membro é desativado, não removido pelo runtime.
- updated_at por trigger, sem depender de @updatedAt do ORM. Identidades imutáveis por trigger e privilégios de coluna.
- Empresa active precisa de ao menos um owner ativo ao commit: constraint triggers diferidas em organization/membership. Escrita em membership atualiza/bloqueia antes o pai, serializando alterações concorrentes; sob isolamento com snapshot antigo, o conflito no pai exige abort/retry, evitando write skew.

A FK de membership a organization é simples porque organization é o próprio tenant. A PK composta de membership é a base referenciada pela **FK composta real da fixture**, provando que (org A, user de B) não encontra pai e falha 23503. Não se acrescentou entidade de domínio para antecipar esse teste.

## Policies e funções

RLS ENABLE + FORCE nas três tabelas. Inventário aplicado:

| Tabela               | Policies                                                                          | Restrição de runtime                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| app_users            | self_profile; policy_reader técnica                                               | API vê/atualiza apenas perfil ativo que corresponde ao sujeito do contexto; grant não permite mudar auth/status/id                  |
| organizations        | tenant_read, tenant_update; policy_reader/bootstrap_write técnicas                | Leitura de tenant ativo com membership ativo; UPDATE somente owner do contexto e somente colunas concedidas                         |
| organization_members | member_read, member_insert, member_update; policy_reader/bootstrap_write técnicas | Membro ativo vê seu vínculo, owner vê os vínculos da empresa; só owner insere/altera role/status; nunca escreve em tenant diferente |

`selleros.subject_id()` resolve issuer/subject para usuário ativo e aceita ator user somente quando session_user é API/bootstrap. `selleros.can_access(target, owner_required)` consulta empresa e membership ativo por função definer de role NOLOGIN; compara target com organization_id do contexto sem cast inseguro. Contexto ausente, vazio ou malformado resulta em false, sem fallback global e sem recursão de policy. USING limita linhas visíveis; WITH CHECK impede escrita/troca para outra empresa.

Funções definer têm search_path=pg_catalog e referências qualificadas. EXECUTE foi revogado de PUBLIC; apenas funções necessárias foram concedidas. Runtime não recebe CREATE nos schemas. A role técnica de policy pode ler todas as identidades, mas só suas funções estreitas são acessíveis; não é login nem pode ser assumida por runtime. Triggers de constraint não viram uma API de consulta arbitrária. Referências de desenho: [PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [segurança de funções](https://www.postgresql.org/docs/17/sql-createfunction.html).

### Contrato de contexto e fronteira de confiança

A conexão de execução não é entregue ao navegador. Um backend futuro validará a identidade real antes de preencher issuer/subject. Nesta fatia, somente a suíte representa esse backend com identidades fictícias. Em transação, set_config(...,true) configura selleros.issuer, selleros.subject, selleros.organization_id e selleros.actor. Todas as consultas usam o cliente da mesma transação. O estado termina no commit/rollback; cliente global sem contexto não acessa organizações.

A prova Prisma usa transação interativa, cliente tx e pool de uma conexão, compara pg_backend_pid antes/depois, provoca rollback e statement_timeout e comprova ausência de contexto nas consultas seguintes. Concorrência usa duas conexões reais e barreira. Não se implementou pool externo PgBouncer; o resultado vale para driver pg/adapter-pg exercitados. Referência: [transações Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

GUC não autentica quem possui credenciais do banco: API/bootstrap são fronteiras confiáveis capazes de informar sujeito. Não se promete impedir que um backend comprometido escolha outro issuer/subject. O teste prova acesso negado para sujeito sem vínculo, ator falsificado na role API e mudanças de tenant; não autenticação externa. Dados já lidos numa transação não podem ser retroativamente retirados após desativação concorrente; nova consulta/operação verifica estado conhecido pelo PostgreSQL. JWT, sessões e revogação de auth ficam fora desta entrega.

### Bootstrap mínimo

Apenas o login bootstrap tem EXECUTE `selleros.bootstrap_organization(text)`. A função resolve o próprio sujeito pelo contexto, exige usuário ativo existente, gera UUID novo, insere empresa active e primeiro owner active no mesmo commit. Não aceita org ou user_id como argumentos, não insere em empresa existente e não cria app_user silenciosamente. Os perfis são fixtures administrativas nesta etapa; cadastro/mirror de autenticação virá depois.

Falha em qualquer inserção, constraint, transação ou rollback desfaz ambos os registros. O teste provoca rollback após o retorno da função e compara a contagem administrativa: nenhuma empresa órfã persiste. Tentativas por API, sujeito inexistente, INSERT direto pelo bootstrap e assinatura com tenant existente foram recusadas. Auditoria persistente de domínio permanece na fatia 02B.2 conforme plano; nenhum onboarding de produto foi habilitado aqui.

### Fixtures de FK, view e worker

A suíte cria schema **isolation_proof**, somente para a execução, e remove-o em finally. Ele contém records com FK(org,user) para memberships e RLS ENABLE/FORCE, uma view com security_invoker=true e jobs fictícios para o contexto worker. Não há essas tabelas na migration/Prisma Schema.

O worker conecta com login próprio e só lê/atualiza records associados a job persistido, token e org do contexto; função de fixture exige session_user worker, actor system e empresa ativa. Token errado, org diferente e API fingindo ator system falham fechados. Runtime worker não recebe acesso a memberships, bootstrap ou perfis. A fixture representa o contrato de revalidar trabalho persistido, sem implementar contas externas, leases ou o domínio de sincronização. Cada acesso futuro de worker precisará de grants/policies próprios e novos testes.

## Reprodução segura

Na raiz selleros-blueprint, com ambiente de teste da 02B.0:

```bash
pnpm install --frozen-lockfile
pnpm db:test:setup # só se .env.test ainda não existe
pnpm db:test:up
pnpm db:test:check
pnpm db:test:stop-postgres
pnpm db:test:down
pnpm db:test:up
pnpm db:test:enroll # só no enrollment inicial; nunca sobrescreve pin existente
pnpm db:test:identity
pnpm db:test:roles
pnpm db:test:preflight
pnpm db:migrate:deploy:test
pnpm db:migrate:status:test
pnpm db:validate
pnpm db:typecheck
pnpm test:isolation
pnpm check
pnpm db:test:stop-postgres
pnpm db:test:down
```

Se arquivos locais já existem, pular setup/enroll e verificar identity. Sem apagar arquivos/volumes para contornar mismatch. `.env.test.roles` não é variável de aplicação e não deve ser enviado a frontend/logs. Deploy só pelo wrapper. Não há banco shadow, reset ou comando de DDL no desenvolvimento. A suíte recusa fixture schema preexistente; investigar execução interrompida em vez de apagar objetos desconhecidos automaticamente. Execuções da suíte devem ser serializadas porque compartilham schema de fixture e pin local.

`test:isolation` executa preflight, prepara fixtures, testa credenciais runtime e limpa somente UUIDs/issuer dessa execução. A limpeza administrativa tem escopo explícito, desativa empresa antes de remover seus membros, remove organizações/usuários fictícios e schema de prova. Não usa TRUNCATE nem apaga volume. Uma nova execução depois da limpeza é suportada e foi validada. Suíte de integração é explícita porque exige Docker/banco; pnpm test mantém os checks sem banco e guards de configuração/identidade.

## Resultados reais

| Verificação              | Resultado                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Base/branch              | origin/main e7d7d88 confirmado e branch criada sem merge automático                                                         |
| Ciclo antes da migration | Up/consulta/shutdown smart/down/up aprovados, volume preservado                                                             |
| Identidade               | TCP e psql interno concordam; pin gravado e verificado; teste real adulterado rejeitado                                     |
| Provisionamento          | Sete roles técnicas; cinco logins com senhas distintas e duas NOLOGIN; runtime sem superuser/BYPASSRLS/dono                 |
| Migration                | Primeira aplicação aprovada em banco de testes vazio; deploy repetido sem pendências; status up to date                     |
| SQL/Prisma               | 14 cenários de integração aprovados em PostgreSQL real                                                                      |
| Leitura/escrita cruzadas | SELECT/join/count/include isolados; INSERT e troca de org rejeitados; UPDATE/DELETE de outra org afetam zero linhas         |
| Estado inválido          | Sem contexto, vazio, UUID malformado, sujeito desconhecido, membro inativo, empresa suspensa e ator falso recusados         |
| Pool/concorrência        | Mesma conexão após commit/rollback/timeout sem vazamento; duas conexões Prisma simultâneas escopadas                        |
| Último owner             | Desativar único owner falha 23514; duas desativações concorrentes preservam um ativo                                        |
| Bootstrap                | Organização e owner atômicos; rollback não deixa órfã; atalhos sem privilégio negados                                       |
| Worker/view/FK           | Token/tenant errados negados; invoker respeita RLS; FK composta cruzada falha 23503                                         |
| Privilégios              | SET ROLE privilegiado, TRUNCATE, DDL, DISABLE RLS e DML não concedido recusados                                             |
| Qualidade                | lint, format:check, typecheck, 12 testes existentes + 11 guards e build aprovados; db:typecheck e Prisma validate aprovados |

As provas de isolamento foram feitas pelos logins runtime, não SET ROLE a partir de superuser. O inventário confirmou FORCE/ENABLE nas três tabelas e proprietário selleros_test_migration. O histórico _prisma_migrations é metadado do Prisma, não quarta entidade de produto. Identidades, dados do teste e schema de fixture foram removidos; permanecem só estrutura autorizada e histórico da migration. O SQL de referência e a modelagem aprovada permanecem intactos.

## Limites e continuidade

Correção global Docker continua pendente; caminho seguro smart deve ser repetido em validações futuras. Esta fatia prova isolamento do núcleo, sem habilitar módulos seguintes. Roles de produção, secret management, auditoria persistente, autenticação real, descoberta de trabalhos reais e proxy externo não foram implementados. O prefixo selleros_test_ explicita o ambiente deste provisionamento.

Parar ao entregar o PR aberto. Não iniciar catálogo, custos, vendas, ledger ou integrações; cada fatia continuará a matriz de isolamento antes de expor capacidades novas.
