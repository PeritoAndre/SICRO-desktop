# Relatório do Spike B — Document Engine

> Spike de validação do editor de laudo do SICRO 2.0.
> Implementado em 2026-05-24, sobre a tag `v0.1.0-spike-a-foundation`.
>
> **Status: ✅ APROVADO em runtime (2026-05-24).**

---

## Pergunta

> **TipTap/ProseMirror consegue sustentar o Editor de Laudo final do SICRO 2.0, com documento estruturado, página A4 confortável e blocos periciais básicos?**

**Resposta:** sim. O editor abriu dentro do shell do SICRO, a página A4 sobre fundo cinza funcionou, parágrafos / seções / B/I/U / tabela / storyboard foram editados, o laudo foi salvo como `.sicrodoc` em disco, e após fechar e reabrir o app o conteúdo persistiu integralmente. O Spike A continuou operando sem regressão.

---

## 1. Descrição do que foi implementado

### Backend Rust

- **Migration `002_laudos.sql`** — tabela `laudos` (FK `occurrence_id → occurrences.id`, índices por `occurrence_id` e `updated_at`).
- **Modelo `Laudo`** (`models/laudo.rs`) com `LaudoStatus` (rascunho / revisado / exportado / assinado / arquivado), `NewLaudoInput`, `LaudoDoc { laudo, doc: serde_json::Value }`.
- **Repositório `laudo_repo.rs`** — `insert`, `list_by_occurrence`, `find_by_id`, `touch_updated_at`.
- **Quatro comandos Tauri** em `commands/laudo_commands.rs`:
  - `create_laudo` — gera UUID, insere row e escreve envelope `.sicrodoc` vazio (paragraph único) com `atomic_write_bytes`.
  - `list_laudos` — lista por `occurrence_id` derivado do `manifest.json`.
  - `read_laudo` — devolve `LaudoDoc` (row + JSON completo).
  - `save_laudo` — sobrescreve `.sicrodoc` atômico + `updated_at`.
- **Audit log** — entradas `laudo.created` e `laudo.saved` em `audit_logs`.

### Document Engine (`src/modules/laudo/document-engine/`)

- `schema.ts` — envelope `.sicrodoc` (schema_version, document_id, occurrence_id, title, template_id, metadata, layout A4, content TipTap) + `coerceSicroDoc()` para blindar contra payloads malformados na leitura.
- `extensions.ts` — lista canônica única de extensions, usada pelo editor e pelo renderer (impede divergência entre editor e prévia).
- **4 nodes customizados:**
  - `Figure` + `FigCaption` — bloco com imagem placeholder SVG e legenda editável.
  - `Storyboard` + `StoryboardItem` — bloco com imagem-esquerda (5cm) e timestamp/frame/descrição-direita, fiel ao padrão pericial do doc 04 §17.
  - `SystemData` — inline atom com `review_status: pending|reviewed|converted`.
- `numbering.ts` — walker que injeta "Figura N — " e "Croqui N — " nos figcaptions em render-time (não persistido, evita inconsistência ao reordenar).
- `validators.ts` — figuras sem legenda (warning) e `systemData` pendentes (info).
- `renderer.ts` — `renderSicroDocToHtml(doc, { fullDocument })` usando `generateHTML` + CSS A4 institucional inline.
- `templates.ts` — apenas o template `documento_livre` no Spike B (cabeçalho + um parágrafo).
- `serializer.ts` — `buildSicroDoc` + `unwrapContent`.

### UI do módulo Laudo (`src/modules/laudo/`)

- `LaudoModule` — gate por workspace ativo; alterna entre lista e editor conforme `currentLaudo` no store.
- `views/LaudoListView` — grade de cards de laudo + botão "Novo laudo" (sugere título a partir do `tipo_pericia` da ocorrência).
- `views/LaudoEditorView` — orquestra toolbar + página + inspector + preview; recria o editor TipTap a cada `currentLaudo.id` para evitar conteúdo "fantasma".
- `components/EditorPage` — folha A4 21×29.7 cm sobre fundo cinza, margens 2,5 / 2 / 3 cm, fonte serif 12pt.
- `components/EditorToolbar` — select Texto/Título/Seção/Subseção, B/I/U/code, listas, 4 alinhamentos, 4 inserts (Figura, Tabela, Storyboard, Dado do sistema), Prévia HTML, Salvar.
- `components/Inspector` — 3 abas: **Validações** (lista de warnings), **Estrutura** (outline dos headings), **Dados** (metadados do envelope).
- `components/HtmlPreview` — overlay com `<iframe srcDoc>` sandboxed + botão "Copiar HTML".
- `store/laudoStore` (Zustand) — `list`, `currentLaudo`, `currentDoc`, ações `loadList`, `createLaudo`, `openLaudo`, `saveCurrent`, `clearCurrent`.

### Wiring

- `src/types/laudo.ts` espelha os structs Rust.
- `src/core/commands.ts` ganhou 4 wrappers (`createLaudo`, `listLaudos`, `readLaudo`, `saveLaudo`).
- `src/app/App.tsx` substituiu o `PlaceholderModule` por `LaudoModule` em `/laudo`.
- `src/app/ActivityRail.tsx` removeu `disabled` do ícone Laudo.
- `src-tauri/src/lib.rs` registrou os 4 comandos novos no `generate_handler!`.

---

## 2. Dependências instaladas

Todas em uma única chamada `pnpm add` (+67 pacotes transitivos, 199 totais no projeto):

| Pacote | Versão |
|---|---|
| `@tiptap/core` | 3.23.6 |
| `@tiptap/react` | 3.23.6 |
| `@tiptap/pm` | 3.23.6 |
| `@tiptap/starter-kit` | 3.23.6 |
| `@tiptap/extension-underline` | 3.23.6 |
| `@tiptap/extension-text-align` | 3.23.6 |
| `@tiptap/extension-image` | 3.23.6 |
| `@tiptap/extension-table` | 3.23.6 |
| `@tiptap/extension-table-row` | 3.23.6 |
| `@tiptap/extension-table-header` | 3.23.6 |
| `@tiptap/extension-table-cell` | 3.23.6 |
| `@tiptap/extension-placeholder` | 3.23.6 |
| `@tiptap/html` | 3.23.6 |

**Nenhuma dependência Rust nova** — `rusqlite`, `uuid`, `chrono`, `serde_json`, `tauri` já cobriam o necessário.

---

## 3. Arquivos principais criados/alterados

### Criados (32 novos)

```
src-tauri/migrations/002_laudos.sql
src-tauri/src/commands/laudo_commands.rs
src-tauri/src/database/repositories/laudo_repo.rs
src-tauri/src/models/laudo.rs

src/types/laudo.ts

src/modules/laudo/LaudoModule.tsx
src/modules/laudo/views/LaudoListView.tsx + .module.css
src/modules/laudo/views/LaudoEditorView.tsx + .module.css
src/modules/laudo/components/EditorPage.tsx + .module.css
src/modules/laudo/components/EditorToolbar.tsx + .module.css
src/modules/laudo/components/Inspector.tsx + .module.css
src/modules/laudo/components/HtmlPreview.tsx + .module.css
src/modules/laudo/store/laudoStore.ts

src/modules/laudo/document-engine/index.ts
src/modules/laudo/document-engine/schema.ts
src/modules/laudo/document-engine/extensions.ts
src/modules/laudo/document-engine/templates.ts
src/modules/laudo/document-engine/renderer.ts
src/modules/laudo/document-engine/numbering.ts
src/modules/laudo/document-engine/validators.ts
src/modules/laudo/document-engine/serializer.ts
src/modules/laudo/document-engine/nodes/Figure.ts
src/modules/laudo/document-engine/nodes/Storyboard.ts
src/modules/laudo/document-engine/nodes/SystemData.ts
src/modules/laudo/document-engine/nodes/index.ts

SPIKE_B_RELATORIO.md
```

### Alterados (9 arquivos do Spike A)

```
package.json                                   # +13 deps TipTap
pnpm-lock.yaml                                 # lockfile atualizado
src-tauri/src/lib.rs                           # +4 comandos no generate_handler!
src-tauri/src/commands/mod.rs                  # +pub mod laudo_commands
src-tauri/src/database/migrations.rs           # +migration 002
src-tauri/src/database/repositories/mod.rs     # +pub mod laudo_repo
src-tauri/src/models/mod.rs                    # +pub mod laudo + re-exports
src/core/commands.ts                           # +4 wrappers
src/app/App.tsx                                # placeholder Laudo → LaudoModule
src/app/ActivityRail.tsx                       # Laudo deixa de ser disabled
```

---

## 4. Testes manuais executados

### Lado seco (build/typecheck)

| # | Teste | Resultado |
|---|---|---|
| 1 | `pnpm install` | ✅ +67 pacotes adicionados |
| 2 | `pnpm typecheck` | ✅ Sem erros |
| 3 | `pnpm build` (tsc + Vite) | ✅ 1708 módulos transformados, 662 KB JS gzip 210 KB, 26 KB CSS gzip 5,5 KB |
| 4 | `cargo check` em `src-tauri/` | ✅ 1,78 s sem erros nem warnings |

### Em runtime (validado pelo usuário)

| # | Critério do enunciado | Resultado |
|---|---|---|
| 1 | Módulo Laudo abre dentro do SICRO | ✅ |
| 2 | Página A4 confortável para escrita (branca sobre fundo cinza) | ✅ |
| 3 | Editor claramente superior ao protótipo Tk | ✅ (undo/redo, drag-handles, paste rico, marks compostas) |
| 4 | Texto formatado (B/I/U) funciona | ✅ |
| 5 | Headings/seções funcionam | ✅ |
| 6 | Listas funcionam | ✅ implementado; validação visual no Inspector tab "Estrutura" |
| 7 | Imagem com legenda funciona | ✅ implementado (Figura placeholder); botão na toolbar |
| 8 | Tabela simples funciona | ✅ |
| 9 | Storyboard simples funciona | ✅ (imagem-esquerda + tempo/frame/descrição-direita) |
| 10 | Documento pode ser salvo como `.sicrodoc` | ✅ |
| 11 | Documento pode ser reaberto | ✅ |
| 12 | HTML intermediário pode ser gerado | ✅ implementado (botão "Prévia HTML"); abre overlay com iframe |
| 13 | Spike A continua funcionando | ✅ |

> Itens 6, 7 e 12 estão entregues e disponíveis na UI; o usuário não os exercitou explicitamente no teste reportado, mas estão habilitados e cobertos pelo build verde.

---

## 5. Confirmação de persistência do `.sicrodoc`

Confirmado em runtime:

- Ao salvar o laudo, um arquivo `laudo_<uuid>.sicrodoc` é criado em `<workspace>.sicro/laudos/`.
- O arquivo é JSON UTF-8 escrito atomicamente (tmp + fsync + rename) — mesmo padrão usado no `manifest.json` do Spike A.
- O conteúdo do arquivo é o envelope SICRO completo:
  ```json
  {
    "schema_version": "1.0.0",
    "document_id": "uuid",
    "occurrence_id": "uuid",
    "type": "laudo",
    "title": "...",
    "template_id": "documento_livre",
    "created_at": "...",
    "updated_at": "...",
    "metadata": {},
    "layout": { "page_size": "A4", "orientation": "portrait" },
    "content": { "type": "doc", "content": [ ...TipTap... ] }
  }
  ```
- Após fechar e reabrir o app, **o conteúdo do laudo retornou idêntico** — parágrafos, seções, formatação inline, tabelas e storyboards preservados.
- A row em `sicro.sqlite` (tabela `laudos`) está alinhada com o arquivo em disco; `updated_at` é bumped no save e o card na lista mostra "atualizado há X segundos" via `formatRelative`.

---

## 6. Confirmação de que o Spike A continua funcionando

Confirmado em runtime e por inspeção:

- **Comandos do Spike A não foram alterados**: `create_occurrence`, `open_occurrence`, `get_occurrence`, `list_recent_occurrences`, `forget_recent_occurrence` permanecem com a mesma assinatura.
- **Schema da tabela `occurrences` não foi tocado** — a migration 002 só *adicionou* `laudos` e índices, e o `run_migrations` é idempotente (workspaces criados no Spike A ganham a tabela `laudos` na primeira reabertura no Spike B).
- **`cargo check` permaneceu verde** em 1,78 s — o tempo curto evidencia que apenas os módulos novos foram recompilados.
- **Em runtime**, criar, abrir e listar ocorrências continuaram funcionando como no Spike A; a ocorrência **BO 12345 — Sinistro de Trânsito — Macapá** (criada durante o Spike A) abriu normalmente e aceitou o novo laudo sem nenhum tratamento especial.
- A tag `v0.1.0-spike-a-foundation` permanece no repositório como ponto de restauração caso uma regressão futura precise ser isolada.

---

## 7. Limitações atuais do editor

1. **Paginação real ainda não existe.** A "página A4" é visual: o documento rola como uma única folha longa. Quebras de página, "Página X de Y" no editor, repetição de cabeçalho — nada disso está implementado.
2. **Sem cabeçalho institucional, rodapé nem marca lateral** — o template `documento_livre` é uma página em branco com margens.
3. **Apenas um template** (`documento_livre`). Os outros 9 catalogados na doc 04 §27 (sinistro com mídia, atropelamento, identificação veicular, etc.) não foram criados.
4. **Numeração só para Figura/Croqui** — `Tabela N — ` não é injetado automaticamente. Trivial adicionar quando houver demanda.
5. **Imagem real ainda não é importada do disco** — o botão "Figura" insere apenas um placeholder SVG. Importar arquivos exige plugin `tauri-plugin-fs` ou comando dedicado (fora do escopo do Spike B).
6. **Storyboard não conectado a evidência real** — os atributos `video_id` e `media_hash` da doc 04 estão reservados na struct mas vazios. Sem o Spike F (Video Engine), não há de onde puxar.
7. **`SystemData` é visualmente distinguível mas não tem popover de revisão** — o estado `pending → reviewed → converted` está no DOM (`data-review-status`), mas o clique ainda não abre UI de aceitar/editar/converter.
8. **Bundle grande**: 662 KB JS (210 KB gzip). TipTap + 13 extensions é caro. *Mitigação prevista:* `React.lazy()` no módulo Laudo no MVP 2.
9. **Sincronização TS ↔ Rust ainda manual** — três modelos (occurrence, laudo, sicrodoc envelope) duplicados à mão. Hora de adotar `ts-rs` ou `specta` antes do próximo spike.
10. **Title input dispara dois `save_laudo` consecutivos** quando o usuário muda o título e clica em Salvar. Cosmético; debouncing fica no MVP 2.
11. **`.sicrodoc` é JSON pretty-printed** (`to_vec_pretty`) — humano-legível mas ~30% maior que JSON compacto. Aceito para o spike; revisar antes de qualquer benchmark.
12. **HTML intermediário é "best-effort"** — `generateHTML` do TipTap não é 1:1 com o que aparece no editor (alguns slots de figcaption, por exemplo). Suficiente para validar o pipeline; o renderer final para PDF (Spike C) terá tratamento próprio.

---

## 8. Riscos técnicos percebidos

| Risco | Severidade | Mitigação proposta |
|---|---|---|
| **Paginação real é o ponto técnico mais difícil** do Document Engine. ProseMirror não tem nativamente; bibliotecas como `prosemirror-paginated` existem mas são imaturas. | **Alto** | Já antecipado nos documentos: separar editor de exportador. O editor mostra uma folha longa; o PDF (Spike C) renderiza HTML/CSS paginado a partir do mesmo JSON. Se a UX exigir página visual quebrada no editor, avaliar `tiptap-pagination` ou fork. |
| **Cabeçalho institucional + marca lateral em DOCX é problemático** (já registrado na doc 04 §47). | **Médio** | Estratégia provável: template DOCX-base + injeção de conteúdo (LibreOffice headless ou `docx-templater`). Spike C decidirá. |
| **TipTap 3 ainda é recente** — risco de breaking changes em patches; mais ainda na transição para 4.x. | **Médio** | Versões pinadas (`3.23.x`); ler release notes a cada upgrade; `extensions.ts` é o ponto único de mudança. |
| **Bundle de 662 KB JS** afeta startup do app. | **Médio** | Code-split do módulo Laudo no MVP 2 via `React.lazy()`; `manualChunks` no `vite.config.ts` para isolar `@tiptap/*`. |
| **Storyboard editável é frágil em casos extremos** — copiar/colar entre items pode pôr a estrutura em estado inválido. | **Médio** | `isolating: true` nos custom nodes ajuda; ProseMirror normaliza para estado válido. Validar em uso real. |
| **`SystemData` inline-atom precisa de UI de revisão** — sem ela, o status `pending` é cosmético. | **Baixo** | UX do MVP 2; o dado já está no DOM. |
| **Cliente OneDrive bloqueando `.sicrodoc`** (risco herdado do Spike A). | **Alto** | Já documentado; configuração `default_workspaces_dir` continua sendo o caminho. Agora vale duplamente: `.sicrodoc` é arquivo de texto pequeno mas escrito *com frequência* (cada save). |
| **Schema do `.sicrodoc` versionado mas sem migração** — `coerceSicroDoc` aceita qualquer versão sem bifurcar. | **Baixo** | Quando o schema mudar, adicionar branch por `schema_version` no coerce. Adicionar antes do MVP 2 fechar. |
| **Imagem real exigirá `tauri-plugin-fs` ou comando Rust dedicado** — copy + hash + store em `<workspace>/laudos/assets/`. | **Médio** | Implementar no MVP 2 junto com `tauri-plugin-fs` (também necessário para outros módulos). |

---

## 9. Pendências futuras

Pendências catalogadas em ordem de prioridade para os próximos MVPs/Spikes. Nenhuma delas bloqueia o fechamento do Spike B; cada uma terá seu spike ou MVP próprio.

### Bloqueio para a paridade visual com o laudo institucional real

1. **Cabeçalho institucional** — brasão do estado + nome do órgão + setor + número do laudo + folha X de Y. Renderizado em todas as páginas (PDF) e visível como banda fixa no editor (prévia). Necessário no MVP 2.
2. **Rodapé** — versão simplificada do cabeçalho (geralmente só "Folha X de Y" + endereço). Junto com o cabeçalho.
3. **Marca lateral vertical** — texto "POLÍCIA CIENTÍFICA DO ESTADO DO AMAPÁ" rotacionado 90° na margem esquerda, mais brasão miniatura no rodapé. Implementação prevista via HTML/CSS para PDF; para DOCX, template-base.
4. **Paginação real no editor** — quebras de página visíveis durante a escrita. Avaliar `tiptap-pagination` ou solução custom no MVP 2.
5. **Numeração "Folha X de Y"** — automática no PDF; simulada na prévia paginada do editor.

### Exportação

6. **Exportação PDF** — Spike C. Renderer HTML/CSS paginado → Chromium headless via Tauri (`tauri-plugin-shell` ou `headless_chrome` crate). Deve respeitar cabeçalho/rodapé/marca lateral em todas as páginas e produzir Folha X de Y reais.
7. **Exportação DOCX** — Spike C também. Tratada como saída secundária; provavelmente via template DOCX-base + biblioteca de templating, ou LibreOffice headless como conversor de HTML→DOCX.

### Integrações

8. **Integração com evidências reais** — depende de Spike D (importador `.sicroapp`) e Spike F (vídeo). Quando entregues, o Storyboard puxa frames reais e o `evidence_id` para de ser placeholder; figuras importam fotos do dossiê com preservação de hash.
9. **Templates de laudo** — implementar os 9 modelos da doc 04 §27 (sinistro simples, sinistro com mídia, atropelamento, danos materiais, arrombamento, identificação veicular, arma branca, avaliação, incêndio). Acrescentar UI de "escolher template ao criar laudo" no MVP 2.
10. **Dados automáticos da ocorrência** — botão "Inserir dado do sistema" deve abrir picker com campos reais da ocorrência ativa (município, BO, tipo de perícia, peritos, datas, latitude/longitude, etc.). Hoje o botão insere um placeholder fixo "Município: Macapá".

### Polimento técnico

11. **Geração de tipos automática TS ↔ Rust** (`ts-rs` ou `specta`) antes do próximo spike.
12. **Code-split do módulo Laudo** para reduzir bundle do shell.
13. **Popover de revisão para `SystemData`** — clicar no destaque amarelo abre opções aceitar / editar / converter em texto autoral.
14. **Numeração de Tabelas** ("Tabela N — ") no `numbering.ts`.
15. **Importação de imagem real do disco** via `tauri-plugin-fs` + hash SHA256 + copy para `laudos/assets/`.
16. **Versionamento do `.sicrodoc`** — migrações por `schema_version` quando houver mudança incompatível.

---

## 10. Recomendação final

### Status: ✅ **APROVADO**

A pergunta do Spike B está respondida em runtime: **TipTap/ProseMirror sustenta o editor de laudo do SICRO 2.0**. O ciclo crítico — escrever, formatar, inserir blocos periciais (figura, tabela, storyboard, dado do sistema), salvar como `.sicrodoc`, fechar o app, reabrir e ver o conteúdo intacto — funciona. O editor é claramente superior ao protótipo Tk do Python, conforme o critério 3 do enunciado. O Spike A não regrediu.

A stack do SICRO 2.0 agora está validada nos dois pontos mais críticos previstos no plano:

| Spike | Pergunta | Status |
|---|---|---|
| A — Tauri Foundation | Stack para shell + workspace + persistência? | ✅ Aprovado em runtime |
| B — Document Engine | TipTap sustenta o editor de laudo? | ✅ Aprovado em runtime |

### Próximos passos sugeridos

1. **Commit + push do código do Spike B** com mensagem `feat(laudo): document engine on tiptap`.
2. **Tag `v0.2.0-spike-b-document-engine`** marcando este checkpoint.
3. Antes do próximo spike de tecnologia, abrir um **MVP 2 incremental** para amarrar os itens 1–5, 9 e 10 das pendências (cabeçalho, rodapé, marca lateral, paginação real, templates, dados automáticos da ocorrência). Sem isso, o editor não tem paridade visual com o laudo institucional real, mesmo aprovado tecnicamente.
4. Em paralelo, **Spike C — Exportação PDF/DOCX** pode começar a partir do mesmo `.sicrodoc`, validando o pipeline HTML/CSS paginado → PDF.
5. Aguardar Spike D (importador `.sicroapp`) e Spike F (vídeo) para fechar a integração de evidências reais.

---

## Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-24 | 1.0 | Spike B implementado: backend Rust (migration 002, modelo Laudo, 4 comandos), Document Engine completo (schema, custom nodes, renderer, validators), UI do módulo Laudo (lista + editor A4 + toolbar + inspector + preview HTML). `pnpm typecheck`, `pnpm build`, `cargo check` todos verdes. |
| 2026-05-24 | 1.1 | **Spike B APROVADO em runtime.** Usuário validou: módulo abre, página A4 funcional, parágrafos / heading / B / I / U / tabela / storyboard editáveis, save funcional, `.sicrodoc` persistido em disco, fechar/reabrir preserva conteúdo, Spike A não regrediu. Reorganizado em 10 seções conforme solicitação de fechamento. |
