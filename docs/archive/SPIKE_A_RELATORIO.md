# Relatório do Spike A — Tauri Foundation

> Spike inicial do SICRO 2.0. Implementado em 2026-05-24, no diretório
> `C:\SICRO 2.0\sicro-desktop\`.
>
> **Status: ✅ APROVADO em runtime (2026-05-24).**

---

## Pergunta

> **Tauri 2 + React 18 + TypeScript + Rust + SQLite é uma base adequada para o shell e o workspace do SICRO?**

**Resposta:** sim. Todos os 10 critérios de sucesso foram validados manualmente em ambiente Windows 11 — ver seção [Validação em runtime](#validação-em-runtime).

## Escopo executado

Implementado conforme o escopo solicitado:

- ✅ Projeto Tauri configurado (`tauri.conf.json`, `Cargo.toml`, `build.rs`, capability default).
- ✅ Vite + React 18 + TypeScript 5.6 com aliases de path.
- ✅ Estrutura de pastas espelhando [02 Sicro 2 Arquitetura.pdf](docs/) §4.
- ✅ Tokens visuais iniciais em CSS variables conforme [03 Sicro 2 Design System.pdf](docs/) §31 (dark institucional + paleta do documento Laudo).
- ✅ App Shell (grid: Activity Rail + Top Bar + Module Surface + Status Bar).
- ✅ Activity Rail com os 9 módulos previstos (Início, Dossiê, Laudo, Croqui, Vídeo, Imagens, Mídias, Estatísticas, Configurações) — os 8 não-Home são placeholders.
- ✅ Top Bar exibindo breadcrumb da ocorrência ativa + módulo atual + versão do app.
- ✅ Status Bar com indicador de workspace ativo e mensagem de erro discreta.
- ✅ Tela Home com cards de ocorrências recentes + botões "Nova ocorrência" / "Abrir workspace".
- ✅ Dialog de criação com campos básicos (BO, protocolo, tipo de perícia, município, peritos, diretório pai).
- ✅ Backend Rust: criação de workspace `.sicro` com 24 subpastas (`dossie/`, `laudos/`, `croquis/exports/`, `videos/storyboards/`, etc.).
- ✅ Geração de `manifest.json` (schema do doc 02 §10) com escrita atômica (`tmp + rename`).
- ✅ Banco `sicro.sqlite` com pragmas WAL + foreign_keys + busy_timeout.
- ✅ Migrations versionadas (`schema_migrations` table) — migração `001_initial.sql` cria `occurrences`, `audit_logs` e índices.
- ✅ CRUD de ocorrência (apenas `insert` e `find_by_id` neste spike).
- ✅ Lista global de ocorrências recentes em `%APPDATA%/SICRO/recent.json` (atômico, limite de 25 entradas).
- ✅ Audit log: `occurrence.created` + `workspace.opened` registrados no `audit_logs`.

## Escopo NÃO executado (intencional)

- ❌ Editor de Laudo → Spike B.
- ❌ Croqui → Spike E.
- ❌ Vídeo → Spike F.
- ❌ Exportação PDF/DOCX → Spike C.
- ❌ Importação `.sicroapp` → Spike D.
- ❌ Ícones do aplicativo (apenas placeholder + instruções em [`src-tauri/icons/README.md`](sicro-desktop/src-tauri/icons/README.md)).
- ❌ Hash SHA256 (módulo `hashing/sha256.rs` vazio, propositalmente).
- ❌ Jobs em background.

---

## Principais decisões técnicas

| Decisão | Escolha | Motivo |
|---|---|---|
| Nome do repositório | `sicro-desktop` | Sugerido no doc 02 §4. |
| Local físico | `C:\SICRO 2.0\sicro-desktop\` | Mantém os PDFs originais em `C:\SICRO 2.0\docs\` fora do código. |
| Package manager | **pnpm** | Sugerido nos docs; arquivo `pnpm-lock.yaml` versionado. |
| Tauri | **2.x** (`tauri = "2"`) | Versão estável atual (2026); plugin de diálogo via `tauri-plugin-dialog`. |
| Crate SQLite | **`rusqlite`** com feature `bundled` | Sem dependência de libsqlite3 do sistema; deploy self-contained. Síncrono basta para SICRO. |
| Estado React | **Zustand** | Leve, sem boilerplate; previsto na arquitetura (`stores/`). |
| Roteamento | **react-router-dom 6** com `HashRouter` | Compatível com `file://` no Tauri. |
| CSS | **CSS variables + CSS Modules** | Tokens centralizados em `tokens.css`; sem Tailwind no spike para reduzir variáveis. |
| Ícones | **lucide-react** | Sugerido no doc 03 §14. |
| Estratégia de tipos | Manual TS ↔ Rust | Documento 02 §5.3 (sincronização manual no início). `src/types/occurrence.ts` espelha `src/models/occurrence.rs`. |
| IDs | **UUID v4** via crate `uuid` | Padrão; `workspace_id == occurrence_id` no Spike A (1 ocorrência por workspace). |
| Extensões de arquivo | `.sicro` (workspace), `.sicrodoc` (laudo, futuro), `.sicrocroqui` (croqui, futuro) | Doc 02. |
| Atomicidade de escrita | `tmp + fsync + rename` em `filesystem/atomic_write.rs` | Manifest corrompido brick o workspace; aplicado a `manifest.json` e `recent.json`. |
| Pragmas SQLite | `WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=1000` | Boas escolhas padrão para desktop single-process. |
| Migrations | Strings `include_str!` + tabela `schema_migrations` | Bundle no binário; idempotente; fácil adicionar novas. |
| Erros | `SicroError` enum com `thiserror`, serializado como `{ kind, message }` | Front-end consome shape estável (`toSicroError` em `src/core/errors.ts`). |
| Idioma | Domínio PT (`ocorrencia`, `tipo_pericia`, `peritos`), código EN, commits EN, docs PT | Documentado no README. |
| Alias TS | `@app`, `@core`, `@components`, `@modules`, `@stores`, `@ds`, `@domain` | `@domain` (não `@types`) — `@types/*` colide com namespace npm. |

---

## Estrutura de pastas final

```
C:\SICRO 2.0\
├── docs/                              # PDFs originais (intocados)
│   ├── 01 Sicro 2 Plano Mestre.pdf
│   ├── 02 Sicro 2 Arquitetura.pdf
│   ├── 03 Sicro 2 Design System.pdf
│   ├── 04 Sicro 2 Document Engine.pdf
│   └── 05 Sicro 2 Spikes E Roadmap.pdf
├── SICRO_2_LEITURA_INICIAL.md         # relatório de leitura (anterior)
└── sicro-desktop/                     # repositório do Spike A
    ├── README.md
    ├── SPIKE_A_RELATORIO.md           # este arquivo
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── index.html
    ├── .gitignore
    ├── .npmrc
    ├── docs/README.md
    ├── public/
    ├── src/                           # 39 arquivos
    │   ├── main.tsx
    │   ├── index.css
    │   ├── vite-env.d.ts
    │   ├── app/
    │   │   ├── App.tsx
    │   │   ├── AppShell.tsx + .module.css
    │   │   ├── ActivityRail.tsx + .module.css
    │   │   ├── TopBar.tsx + .module.css
    │   │   ├── StatusBar.tsx + .module.css
    │   │   └── WorkspaceProvider.tsx
    │   ├── core/
    │   │   ├── commands.ts            # invoke wrappers
    │   │   ├── errors.ts              # SicroError shape
    │   │   └── formatters.ts          # pt-BR Intl helpers
    │   ├── design-system/
    │   │   ├── tokens.css             # variáveis CSS (doc 03 §31)
    │   │   ├── reset.css
    │   │   └── typography.css
    │   ├── components/                # Button, Card, Dialog, EmptyState, StatusPill
    │   ├── modules/
    │   │   ├── home/                  # HomeView + NewOccurrenceDialog + RecentOccurrenceCard
    │   │   └── placeholders/          # PlaceholderModule
    │   ├── stores/workspaceStore.ts   # Zustand
    │   └── types/occurrence.ts        # tipos espelhando Rust
    └── src-tauri/                     # 23 arquivos (excluindo target/)
        ├── Cargo.toml
        ├── build.rs
        ├── tauri.conf.json
        ├── capabilities/default.json
        ├── icons/README.md
        ├── migrations/
        │   └── 001_initial.sql        # schema_migrations + occurrences + audit_logs
        └── src/
            ├── main.rs                # entry: chama lib::run()
            ├── lib.rs                 # Tauri builder + invoke_handler
            ├── error.rs               # SicroError + Serialize
            ├── state/mod.rs           # AppState (recents, config dir)
            ├── commands/
            │   ├── mod.rs
            │   └── workspace_commands.rs   # 5 commands expostos
            ├── workspace/
            │   ├── mod.rs
            │   ├── create.rs          # cria 24 subpastas + manifest + DB + occurrence
            │   ├── open.rs            # valida estrutura + lê ocorrência
            │   ├── manifest.rs        # schema do manifest.json
            │   ├── paths.rs           # derive_workspace_name, unique_workspace_path
            │   └── validation.rs      # ensure_workspace_structure
            ├── database/
            │   ├── mod.rs
            │   ├── connection.rs      # pragmas WAL/FK/timeout
            │   ├── migrations.rs      # versionado via schema_migrations
            │   └── repositories/
            │       ├── mod.rs
            │       └── occurrence_repo.rs   # insert, find_by_id, record_audit
            ├── filesystem/
            │   ├── mod.rs
            │   ├── safe_paths.rs      # sanitize_folder_name (+ testes unitários)
            │   └── atomic_write.rs    # tmp + fsync + rename
            ├── hashing/
            │   ├── mod.rs
            │   └── sha256.rs          # vazio (placeholder)
            └── models/
                ├── mod.rs
                └── occurrence.rs      # Occurrence, NewOccurrenceInput, RecentOccurrence
```

---

## Comandos para instalar e rodar

### Pré-requisitos (instalação única na máquina)

```powershell
# Node 22+ — já presente.
# pnpm — instalado neste spike via:
npm install -g pnpm

# Rust toolchain — AINDA NÃO INSTALADO nesta máquina.
# Instale via https://rustup.rs/ ou:
#   winget install Rustlang.Rustup
# Em seguida, reinicie o terminal para PATH refletir o cargo.

# Visual Studio Build Tools (componente "Desktop development with C++").
# Necessário para o linker MSVC que o Rust usa no Windows.

# WebView2 — já vem no Windows 11.
```

### Comandos do projeto

```powershell
cd "C:\SICRO 2.0\sicro-desktop"

# Instalar dependências JS (já executado no spike):
pnpm install

# Type-check (já executado, passou):
pnpm typecheck

# Build de produção do front (já executado, passou):
pnpm build

# Rodar em modo dev (REQUER Rust instalado):
pnpm tauri:dev

# Build de produção empacotado (REQUER Rust instalado):
pnpm tauri:build
```

---

## Testes manuais executados

### Front-end e type-check (sessão de implementação)

| # | Teste | Resultado |
|---|---|---|
| 1 | `pnpm install` | ✅ 78 pacotes instalados, 0 vulnerabilidades reportadas. |
| 2 | `pnpm typecheck` (`tsc --noEmit`) | ✅ Sem erros após corrigir alias `@types` → `@domain` e adicionar `vite-env.d.ts`. |
| 3 | `pnpm build` (Vite + tsc) | ✅ 1626 módulos transformados, 196 KB JS + 15 KB CSS gzip 67 KB total. |
| 4 | `cargo check` em `src-tauri/` | ✅ Finished `dev` profile em 50,68 s, sem erros nem warnings, após correções em `lib.rs` (path completo no `generate_handler!`) e `error.rs` (qualificação de `std::result::Result` no impl `Serialize`). |

### Validação em runtime

Realizada em sessão separada, em Windows 11, com Rust toolchain instalado pelo usuário (`rustup` + Visual Studio Build Tools com workload C++).

| # | Critério de sucesso (do enunciado original) | Resultado |
|---|---|---|
| 1 | Abrir o aplicativo (`pnpm tauri:dev`) | ✅ Janela "SICRO 2.0" abriu. |
| 2 | Visualizar o shell inicial | ✅ Activity Rail (9 módulos), Top Bar, Home, Status Bar — todos renderizando. |
| 3 | Criar uma ocorrência | ✅ Ocorrência **BO 12345 — Sinistro de Trânsito — Macapá** criada via dialog de "Nova ocorrência". |
| 4 | Salvar a ocorrência em um workspace `.sicro` | ✅ Pasta `.sicro` criada em disco com a estrutura completa de 24 subpastas. |
| 5 | Gerar `manifest.json` | ✅ Manifest escrito atomicamente, schema conforme doc 02 §10. |
| 6 | Gerar `sicro.sqlite` | ✅ Banco criado, migration `001_initial` aplicada, linha de occurrence persistida. |
| 7 | Fechar o app | ✅ Janela fechou limpa, sem erros no console. |
| 8 | Reabrir o app | ✅ App reiniciou e leu `recent.json` em `%APPDATA%/SICRO/`. |
| 9 | Ver a ocorrência na lista de recentes | ✅ Card "BO 12345 — Sinistro de Trânsito — Macapá" presente na Home com status pill, município, tipo e timestamp relativo. |
| 10 | Reabrir a ocorrência salva | ✅ Click no card → `open_occurrence` rodou, ocorrência ativa apareceu no Top Bar (`SICRO ▸ BO 12345 — Sinistro de Trânsito — Macapá ▸ Início`), Status Bar passou de "nenhum workspace" para "workspace ativo" + path da pasta `.sicro`. |

**Conclusão dos testes:** o ciclo completo *criar → salvar → fechar → reabrir → listar → reabrir* funcionou sem intervenção manual no filesystem, sem perda de dados, sem erro visível.

---

## Limitações encontradas

1. **Ícones do app** são placeholders gerados pelo `pnpm tauri icon` a partir de um PNG fonte criado por script PowerShell (cores `#07111f` + `#d7a84f`). Suficiente para `tauri:dev` e para destravar o `tauri-build` no Windows. Antes de `pnpm tauri:build` para produção: substituir `src-tauri/icons/source.png` pela arte oficial e regenerar (instruções em [`src-tauri/icons/README.md`](sicro-desktop/src-tauri/icons/README.md)).

2. **Sincronização TS ↔ Rust é manual**. `src/types/occurrence.ts` espelha `src/models/occurrence.rs` à mão. Mudanças em um lado precisam ser replicadas no outro — risco real de divergência silenciosa quando o número de structs crescer. *Mitigação proposta para depois do Spike B:* adotar `ts-rs` ou `specta` para geração automática.

3. **Capabilities mínimas no Tauri 2** — incluí apenas as três permissions de dialog necessárias (`dialog:allow-open`, `dialog:allow-save`, `dialog:allow-message`). Cada novo plugin (fs, http, etc.) exigirá adicionar permissions explícitas em `capabilities/default.json`.

4. **Não há git inicializado** ainda. O `.gitignore` está pronto; a inicialização foi deixada para o usuário decidir (host remoto, primeira convenção de branch, etc.). Após o commit inicial, sugere-se a mensagem `spike(a): initial tauri foundation`.

5. **Sem persistência de "última ocorrência aberta"** ao reiniciar o app. Decisão deliberada: o spike valida que a ocorrência aparece nos *recentes*, o que cumpre o critério 9. Reabrir automaticamente é UX para o MVP 1.

---

## Riscos técnicos percebidos

### 🚨 Risco crítico observado em runtime: workspaces dentro do OneDrive

**Severidade: ALTA.** Identificado durante a validação em runtime.

O `directories::UserDirs::document_dir()` retorna `~/Documents`, e em Windows 11 com OneDrive ativo essa pasta resolve para `C:\Users\<user>\OneDrive\Documents\`. Resultado: por padrão, todo novo workspace `.sicro` é criado **dentro de uma área sincronizada com a nuvem**, o que abre vários problemas:

| Problema | Impacto sobre o SICRO |
|---|---|
| **Lock de SQLite** — o cliente OneDrive abre arquivos para hash/upload e mantém handles por janelas curtas. SQLite em modo WAL escreve em três arquivos (`sicro.sqlite`, `-wal`, `-shm`) com locks específicos. | Pode resultar em `SQLITE_BUSY` esporádico, falhas de commit, corrupção do WAL se o cliente sincronizar `-wal` parcial. |
| **Conflitos "(Conflito de \<usuário\>)"** | Se o usuário abrir a ocorrência em duas máquinas, OneDrive renomeia o arquivo conflitante. O manifest e o SQLite **deixam de bater** sem qualquer aviso ao SICRO. |
| **Latência de escrita** | Escrita atômica (`tmp + rename`) sob OneDrive sofre delay perceptível ao gerar muitos thumbnails ou frames. |
| **Integridade de evidências** | Mídias adicionadas a `videos/`, `imagens/` etc. ficam à mercê do cliente de sincronização — risco direto de **alteração silenciosa de hash** (renomeio, metadados ADS removidos, codificação modificada por "OneDrive Files On-Demand"). Inaceitável para um workspace pericial. |
| **Recuperação seletiva** | Restaurar uma versão antiga de UM arquivo pelo histórico do OneDrive deixa o workspace inconsistente (manifest aponta para hash A, arquivo tem hash B). |
| **"Files On-Demand"** | O arquivo pode existir como placeholder e ser baixado on-demand. SQLite NÃO funciona em placeholders. |

**Recomendação:**

Antes de qualquer uso real (e portanto antes do MVP 1 fechar), introduzir:

1. **Configuração explícita de "diretório padrão de workspaces"** no módulo Configurações (atualmente placeholder). Default sugerido: `C:\Sicro\Workspaces\` ou `%USERPROFILE%\Sicro\` — **sempre fora de qualquer pasta sob OneDrive / Google Drive / Dropbox**.
2. **Detecção automática no primeiro start**: verificar se o `document_dir()` resolvido está sob `OneDrive` (testar substring no path) e, em caso positivo, exibir aviso ao usuário com botão "Mover para pasta local segura".
3. **Validação no momento da criação**: no `NewOccurrenceDialog`, se o `parent_directory` selecionado estiver sob `OneDrive`, mostrar um warning amarelo (não bloqueante, mas explícito) explicando o risco.
4. **Audit log**: registrar `workspace.created_in_cloud_dir` quando o caminho contiver `OneDrive`, `GoogleDrive`, `Dropbox` ou `iCloudDrive` — útil para suporte futuro.
5. **Documentação**: registrar a recomendação em uma ADR (`docs/adr/001-workspace-storage-location.md` quando o ADR layout for criado).

> Este risco **não invalida** o Spike A — o ciclo criar/salvar/reabrir funcionou em ambiente OneDrive durante o teste. Mas para uso pericial real, com mídias de evidência sob hash, **workspaces precisam viver fora de pastas sincronizadas**.

### Outros riscos técnicos (severidade Baixa/Média)

| Risco | Severidade | Mitigação proposta |
|---|---|---|
| Compilação Rust leva ~50 s no `cargo check` inicial; primeiro `cargo build` completo é mais lento | Baixo | Já documentado; cache do cargo entre builds. |
| `tauri.conf.json` schema 2.x — campos podem mudar em patches | Médio | Pino do `tauri = "2"` permite minor updates; revisar release notes a cada upgrade. |
| `tauri-plugin-dialog` exige permissions corretas — esquecimento gera erro silencioso | Médio | Já configurado em `capabilities/default.json`. |
| `verbatimModuleSyntax: true` força `import type` em tipos puros — pegadinha comum | Baixo | Aplicado em todos os arquivos; lint pega regressões. |
| HashRouter (`#/dossie`) vs BrowserRouter — Tauri prefere hash | Baixo | Usado HashRouter; documentado. |
| Long paths no Windows (>260 chars) podem quebrar workspaces aninhados | Médio | `sanitize_folder_name` limita o nome a 100 chars; pasta `.sicro` é única no parent. Habilitar "Long Path Aware" no Windows 11 ainda é boa prática. |
| Migration concorrente se duas instâncias rodarem o mesmo workspace simultaneamente | Baixo | `busy_timeout` SQLite mitiga; cenário real é raro num app desktop single-window. Tratamento de fundo num spike futuro. |
| `pub use` em `commands/mod.rs` quebra `tauri::generate_handler!` silenciosamente | Médio | Removido o `pub use`, deixado comentário em `commands/mod.rs` documentando a regra. Re-aparecimento futuro pegaria o mesmo erro de hoje. |
| Alias local `pub type Result<T>` sombreia o `Result` do prelude e quebra impls de trait | Médio | `error.rs` agora qualifica `std::result::Result` no `Serialize::serialize`. Erro similar em outros impls de trait deve qualificar também. |
| Audit log cresce sem limite | Baixo | Spike A só registra 2 ações por ocorrência. MVP 1 deve adicionar política de rotação. |
| Sincronização TS ↔ Rust manual | Médio | Adotar `ts-rs` ou `specta` após Spike B. |

---

## Recomendação final

### Status: ✅ **APROVADO**

A stack proposta — **Tauri 2 + React 18 + TypeScript 5.6 + Rust 2021 + SQLite 3 (via rusqlite bundled)** — é **adequada para o shell, o workspace e a persistência do SICRO Desktop 2.0**.

Validações que sustentam a aprovação:

- ✅ Front-end validado: `pnpm install`, `pnpm typecheck`, `pnpm build`.
- ✅ Backend Rust/Tauri validado: `cargo check` sem erros nem warnings (50,68 s).
- ✅ Criação de workspace `.sicro` validada em runtime: 24 subpastas + `manifest.json` + `sicro.sqlite` com migration aplicada.
- ✅ Persistência após fechar/reabrir validada em runtime: `recent.json` em `%APPDATA%/SICRO/` sobreviveu ao restart do app.
- ✅ Ocorrência recente validada em runtime: card renderizou com status pill, município e tipo de perícia; click reabriu a ocorrência e o Top Bar mostrou o breadcrumb correto.

Todas as decisões de arquitetura dos documentos 01–05 foram respeitadas e materializadas em código.

### Recomendação operacional antes de uso real

**🚨 Configurar diretório padrão de workspaces FORA do OneDrive antes de qualquer uso pericial real.**

Durante o teste em runtime, o usuário criou o primeiro workspace dentro de `~/Documents`, que em Windows 11 está sob OneDrive. O ciclo funcionou, mas os riscos (lock de SQLite, conflitos de sincronização, integridade de evidências sob hash, "Files On-Demand") tornam **inaceitável** manter esse default para uso oficial. Detalhes na seção "Riscos técnicos percebidos".

### Próximos passos sugeridos

1. **Commit inicial** do repositório `sicro-desktop/` com mensagem `spike(a): initial tauri foundation`.
2. **Antes do Spike B**, adicionar à backlog do MVP 1:
   - Configuração `default_workspaces_dir` (módulo Configurações).
   - Detecção de OneDrive/Google Drive/Dropbox no path padrão e warning ao usuário.
   - Botão "Mover para pasta local segura" no primeiro start.
3. Rodar `cargo test` em `src-tauri/` para executar os testes unitários de `safe_paths.rs` (e adicionar mais conforme módulos crescem).
4. Iniciar **Spike B — Document Engine** (TipTap + página A4 + exportação HTML inicial) — fora do escopo deste documento.

---

> *Cada spike reduz risco. Cada MVP entrega fluxo real. Cada módulo nasce integrado à ocorrência.*
> — [05 Sicro 2 Spikes E Roadmap.pdf](docs/), seção 42.

---

## Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-24 | 1.0 | Spike A implementado; front-end validado em build/typecheck; backend Rust escrito mas não compilado (Rust ausente do ambiente do agente). Status: "aprovado com validação em runtime pendente". |
| 2026-05-24 | 1.1 | Patch: ícones do app gerados (`pnpm tauri icon` a partir de `source.png` placeholder). |
| 2026-05-24 | 1.2 | Patch: corrigidos dois erros de compilação Rust (`generate_handler!` com path completo; `Serialize::serialize` qualificando `std::result::Result`). `cargo check` ok. |
| 2026-05-24 | 1.3 | **Spike A APROVADO em runtime.** Ciclo criar→salvar→fechar→reabrir→listar→reabrir validado manualmente com ocorrência **BO 12345 — Sinistro de Trânsito — Macapá**. Adicionado risco crítico do OneDrive e recomendação operacional. |
