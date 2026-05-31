# SICRO LAUDO — Auditoria Técnica

**Data:** 2026-05-26
**Escopo:** Diagnóstico completo do módulo Laudo antes de evoluir para 80–90% das funcionalidades de um editor Word-like com inteligência pericial nativa.
**Estado da auditoria:** Concluída. **Sem alterações de código nesta etapa.**

---

## 1. Visão geral

| Aspecto | Estado |
|---|---|
| Motor de edição | TipTap 2 (ProseMirror) — robusto, escolha correta |
| Pilha | React 18 + Zustand + Tauri 2 + SQLite + Rust |
| Schema persistência | `.sicrodoc` (envelope JSON v1.0.0) |
| Tabelas SQLite | `laudos` (002), `exports` (003), `evidence_links` (008) |
| Exportadores | HTML (stub), PDF (Edge headless), DOCX (docx-rs walker — 1.204 linhas) |
| Maturidade visual | Premium institucional A4 com cabeçalho/rodapé/réguas |
| Cobertura funcional vs meta Word-like | **~35%** |

**Veredito:** a base existente é **muito boa** — TipTap está bem configurado, a arquitetura `extensions` + `nodes` + `renderer` + `walker` Rust está limpa, há paginação visual, brasão institucional, exportação PDF/DOCX funcionando, e nós customizados (Quesito, Signature, Figure, Storyboard, EvidenceTable, SystemData). A lacuna não é qualidade — é cobertura. O laudo precisa crescer de "MVP institucional" para "editor documental robusto Word-like".

---

## 2. Estrutura atual

### 2.1. Frontend (`src/modules/laudo/`)

```
src/modules/laudo/
├── LaudoModule.tsx                  88 ln   entry-point + branding loader
├── components/
│   ├── EditorPage.tsx              312 ln   folha A4 + réguas + cabeçalho/rodapé
│   ├── EditorPage.module.css       370 ln
│   ├── EditorToolbar.tsx           307 ln   toolbar minimalista (B/I/U, listas, alinhamento)
│   ├── EditorToolbar.module.css    106 ln
│   ├── Inspector.tsx               641 ln   6 abas (Validações, Estrutura, Evidências, Cabeçalho, Página, Dados)
│   ├── Inspector.module.css        242 ln
│   ├── ExportMenu.tsx              244 ln   dropdown PDF/DOCX/HTML
│   ├── ExportMenu.module.css       116 ln
│   ├── HtmlPreview.tsx             133 ln   modal de prévia HTML
│   ├── HtmlPreview.module.css       79 ln
│   ├── HorizontalRuler.tsx         104 ln   régua SVG cm
│   ├── VerticalRuler.tsx           146 ln
│   ├── Ruler.module.css             58 ln
│   ├── NewLaudoDialog.tsx          159 ln
│   ├── NewLaudoDialog.module.css    89 ln
│   └── evidence/
│       ├── EvidencePanel.tsx       ~150 ln   inserir foto/croqui/frame/storyboard/tabela
│       └── EvidencePanel.module.css ~100 ln
├── document-engine/                 ← coração do módulo
│   ├── index.ts                     78 ln   barrel
│   ├── schema.ts                   119 ln   SicroDoc envelope (v1.0.0)
│   ├── extensions.ts                82 ln   StarterKit + Underline + TextAlign + Image + Table + custom nodes
│   ├── serializer.ts                52 ln
│   ├── renderer.ts                 398 ln   SicroDoc → HTML (header/footer/marca + content)
│   ├── validators.ts                84 ln   warnings (figura sem legenda, systemData pendente)
│   ├── templates.ts                279 ln   "Documento livre" + "Sinistro de Trânsito Simples"
│   ├── institutional-templates.ts  144 ln   PCA Padrão (único shipped)
│   ├── branding.ts                  84 ln   loader PNG brasões
│   ├── evidence-assets.ts          104 ln   preload imagens
│   ├── page-layout.ts              108 ln   A4 dims + margens efetivas
│   ├── numbering.ts                 65 ln   Folha X de Y
│   ├── relative-src.ts              87 ln   convertFileSrc resolver
│   └── nodes/
│       ├── index.ts                 16 ln
│       ├── Figure.ts               166 ln   evidence-aware
│       ├── Storyboard.ts           237 ln   grid frames
│       ├── EvidenceTable.ts        129 ln
│       ├── Quesito.ts              155 ln   bloco numerado (list/item/question/answer)
│       ├── Signature.ts            103 ln
│       └── SystemData.ts            76 ln   inject readonly do caso
├── hooks/                           ← vazio (sem hooks específicos do laudo)
├── store/
│   └── laudoStore.ts               289 ln   create/open/save/updateMetadata/updateLayout
└── views/
    ├── LaudoEditorView.tsx         194 ln   orquestrador (toolbar+editor+inspector+preview)
    ├── LaudoEditorView.module.css   77 ln
    ├── LaudoListView.tsx           167 ln
    └── LaudoListView.module.css     79 ln
```

### 2.2. Backend (Rust)

```
src-tauri/src/
├── commands/
│   ├── laudo_commands.rs           ~195 ln  create_laudo, list_laudos, read_laudo, save_laudo, delete_laudo, list_laudo_exports
│   └── export_commands.rs          ~187 ln  export_laudo_pdf, export_laudo_docx, export_laudo_html, get_export_status
├── models/
│   ├── laudo.rs                     ~87 ln  Laudo struct
│   └── export.rs                    ~64 ln  Export struct
├── database/repositories/
│   ├── laudo_repo.rs               ~200 ln  CRUD SQLite
│   └── export_repo.rs              ~150 ln
├── exporters/
│   ├── mod.rs                       ~27 ln  dispatcher
│   ├── html.rs                      ~16 ln  stub (escreve string em arquivo)
│   ├── pdf.rs                      ~170 ln  Edge headless --print-to-pdf
│   ├── docx.rs                   ~1.204 ln  walker JSONContent → Word XML
│   └── paths.rs                     ~51 ln  helpers
└── migrations/
    ├── 002_laudos.sql               laudos table
    ├── 003_exports.sql              exports table
    └── 008_evidence_links.sql       evidence_links (MVP 4)
```

### 2.3. Documentação relacionada

- `docs/archive/SPIKE_B_RELATORIO.md` — TipTap engine + schema + extensions
- `docs/archive/SPIKE_C_RELATORIO.md` — exportadores PDF/DOCX/HTML
- `docs/archive/MVP2_LAUDO_INSTITUCIONAL_RELATORIO.md` — chrome institucional, templates, quesito/assinatura, paginação visual
- `docs/archive/MVP4_EVIDENCIAS_NO_LAUDO_RELATORIO.md` — evidence nodes (Figure/Storyboard/EvidenceTable), assets loader, DOCX walker image embed

---

## 3. O que JÁ existe (funcional hoje)

### 3.1. Documento e arquivo

- ✅ **Criar novo laudo** — `NewLaudoDialog` + `commands.createLaudo` + template aplicado após criação.
- ✅ **Abrir laudo** — `commands.readLaudo` + `coerceSicroDoc` + resolução de paths para imagens.
- ✅ **Salvar (Ctrl+S NÃO atalho — só botão)** — `LaudoEditorView.handleSave` + `saveCurrent` no store.
- ✅ **Excluir laudo** — `commands.deleteLaudo`.
- ✅ **Lista de laudos** — `LaudoListView` com grid.
- ✅ **Metadata editável** — Inspector "Cabeçalho" + `updateMetadata`.
- ✅ **Layout editável** — Inspector "Página" + `updateLayout` (margens).
- ✅ **Exportar PDF** — Edge headless via `exporters/pdf.rs`.
- ✅ **Exportar DOCX** — walker `exporters/docx.rs` com 1.204 linhas (cobre quesito, signature, header, footer, image embed, table).
- ✅ **Exportar HTML** — stub que escreve a string renderizada.
- ✅ **Histórico de exports** — `exports` table + `listLaudoExports` mostra recents no menu.

### 3.2. Motor de edição rica

- ✅ Digitação normal, seleção, copy/paste (TipTap nativo).
- ✅ **Undo/Redo** — `StarterKit` traz `history` (Ctrl+Z/Y nativos do TipTap).
- ✅ **Negrito (Ctrl+B)** — botão + atalho TipTap.
- ✅ **Itálico (Ctrl+I)** — botão + atalho TipTap.
- ✅ **Sublinhado (Ctrl+U)** — botão + atalho `@tiptap/extension-underline`.
- ✅ **Listas com marcadores / numeradas** — botões + atalhos.
- ✅ **Alinhamento esquerda/centro/direita/justificado** — `@tiptap/extension-text-align`.
- ✅ **Título / Seção / Subseção** — select de heading (h1/h2/h3) na toolbar.
- ✅ Quebra de linha / parágrafo nativos.
- ✅ Placeholder customizável.

### 3.3. Página real e layout documental

- ✅ **Página A4 visível** com sombra e bordas (`EditorPage.tsx`).
- ✅ **Margens reais configuráveis** via Inspector "Página" + persistidas em `layout.page.margins`.
- ✅ **Cabeçalho institucional** com 3 linhas de brasão, brasão PNG, grid metadata (Laudo nº, BO nº, Tipo de perícia, Município).
- ✅ **Rodapé institucional** com texto + "Folha X de Y".
- ✅ **Marca lateral vertical** (POLÍCIA CIENTÍFICA DO AMAPÁ).
- ✅ **Régua horizontal e vertical** (SVG em cm).
- ✅ **Marcadores de página visuais** — linhas tracejadas "— página N —" a cada 29,7 cm.
- ✅ Modo retrato.

### 3.4. Estilos

- ✅ Heading H1 / H2 / H3 (via select da toolbar).
- ✅ Bold, italic, underline, code inline.
- ✅ Bloco quesito custom (com numeração via CSS counter).
- ✅ Bloco assinatura custom.

### 3.5. Templates

- ✅ "Documento livre" (placeholder mínimo).
- ✅ "Sinistro de Trânsito Simples" — preâmbulo + histórico + exames + análise + conclusão + quesitos + assinatura.
- ✅ Templates injetam `systemData` inline com `occurrence.numero_bo`, `municipio`, `tipo_pericia`, `data_fato`, etc.

### 3.6. Imagens / Croqui / Vídeo

- ✅ **Node Figure** — kind=`image|croqui|frame`, captura `evidence_id`, `relative_path`, `source_hash`.
- ✅ **Node Storyboard** — grid de frames de vídeo.
- ✅ **Node EvidenceTable** — tabela com colunas/rows + metadata.
- ✅ Inspector "Evidências" com sub-abas para inserir foto, croqui, frame, storyboard, tabela.
- ✅ DOCX walker faz embed real de imagens via `Pic::AddImage` com fallback.
- ✅ HTML preview/PDF preloads imagens como data URI.
- ✅ `relative-src.ts` resolve `relative_path → convertFileSrc` no editor; `normalize` reverte para portabilidade no save.

### 3.7. Tabelas

- ✅ Inserir tabela 3×3 (botão Tabela → `insertTable({ rows, cols, withHeaderRow })`).
- ✅ `Table`, `TableRow`, `TableHeader`, `TableCell` extensões TipTap.
- ✅ `resizable: false` (limitação aceita).

### 3.8. Quesitos

- ✅ Bloco `quesitoList` → `quesitoItem` → `quesitoQuestion` / `quesitoAnswer`.
- ✅ Toolbar tem botão "Quesito" — `insertQuesitoList(1)`.

### 3.9. Validação

- ✅ Aba "Validações" no Inspector.
- ✅ `validateSicroDoc` retorna warnings: figura sem legenda, systemData pendente.

### 3.10. Integrações

- ✅ **Croqui**: `ExportMenu` chama `ensureCroquiExportFresh()` (MVP 9) antes de exportar laudo.
- ✅ **Dossiê / Evidências**: Figure/Storyboard/EvidenceTable preservam `evidence_id` + `relative_path` + `source_hash` (audit trail).
- ✅ **Vídeo**: Storyboard recebe frames.
- ✅ **Ocorrência ativa**: `useWorkspaceStore.activeOccurrence` alimenta templates + header.

---

## 4. O que está PARCIAL (existe mas incompleto)

### 4.1. Toolbar

- ⚠️ **Sem cor de fonte, sem realce/marca-texto, sem tachado, sem sobrescrito/subscrito, sem limpar formatação.**
- ⚠️ **Sem dropdown de família/tamanho de fonte.** (Não temos `@tiptap/extension-font-family` nem `@tiptap/extension-font-size`.)
- ⚠️ Heading dropdown chama "Texto/Título/Seção/Subseção" — mas sem corpo, legenda, citação, observação, conclusão, etc.
- ⚠️ Sem "copiar formatação" (format painter).

### 4.2. Atalhos

- ⚠️ **Ctrl+S não salva** — só botão.
- ⚠️ **Ctrl+P não exporta/imprime** — só menu.
- ⚠️ **Ctrl+F (localizar) inexistente**.
- ⚠️ Ctrl+A (selecionar tudo) nativo do navegador, sem destaque.

### 4.3. Autosave

- ❌ **Não há autosave.** Cada save é manual via botão.
- ❌ **Não há recuperação após falha** (sem snapshot local).

### 4.4. Histórico de versões

- ❌ **Nenhum sistema de versionamento** — cada save sobrescreve.
- ❌ Sem "duplicar laudo" (só o backend tem `update_laudo_content`, sem branch/snapshot).
- ❌ Sem "salvar como".

### 4.5. Estados do documento

- ❌ Sem `status: rascunho | em_revisão | final`.
- ❌ Sem bloqueio de edição na versão final.
- ❌ Sem hash + timestamp de finalização.

### 4.6. Página

- ⚠️ Orientação retrato hardcoded — `landscape` declarado no schema mas sem UI.
- ⚠️ **Não há zoom** — `EditorPage` renderiza sempre em 1×.
- ⚠️ **Não há modo leitura / foco / revisão** — só edição.
- ⚠️ Visualização de impressão = HtmlPreview, mas não é WYSIWYG real.
- ⚠️ Quebras de página são **visuais apenas** (linhas tracejadas) — texto não é re-fluido em páginas reais.
- ⚠️ Sem miniaturas de páginas.

### 4.7. Estilos documentais

- ⚠️ Heading dropdown limitado a 3 níveis. Sem subtítulo, sem corpo do laudo distinto, sem legenda, sem citação, sem observação, sem conclusão, sem advertência.
- ❌ **Não há sistema de estilos centralizado** — fontes/tamanhos vêm de CSS global.
- ❌ Sem painel de estilos.
- ❌ Sem "atualizar estilo globalmente".

### 4.8. Estrutura documental

- ⚠️ **Numeração de seções é manual** — templates trazem "1 – DO HISTÓRICO" hardcoded; não é re-numerado se o perito inserir/remover.
- ⚠️ **Não há sumário (TOC)** automático.
- ⚠️ **Não há lista de figuras** automática.
- ⚠️ **Não há lista de tabelas** automática.
- ⚠️ **Sem referência cruzada.**
- ⚠️ Inspector tem aba "Estrutura" (`outline`) que extrai headings — base existe, mas é só leitura, sem navegação clicável.

### 4.9. Templates

- ⚠️ Só 2 templates. **Faltam:** arrombamento, avaliação merceológica, constatação, exame veicular, local de crime, genérico, em branco.
- ❌ Sem editor de templates pelo perito.

### 4.10. Campos automáticos

- ⚠️ Existe `SystemData` node, mas:
  - Funciona apenas como **destaque inline** com `review_status: pending`.
  - Sem **placeholder `{{variavel}}`** com substituição automática.
  - Atualização ao mudar dados do caso é **manual** (perito precisa editar nó por nó).
  - Sem painel lateral de campos do caso (Inspector tem aba "Cabeçalho" parcial).
  - Sem validação de campos obrigatórios.

### 4.11. Imagens

- ⚠️ Figure existe, mas:
  - Sem redimensionar interativo (drag handles).
  - Sem cortar, girar dentro do laudo.
  - Sem alinhamento configurável.
  - Largura padrão hardcoded.
  - **Legenda existe** mas numeração não é automática (não há `Figura 1`, `Figura 2`, ...).
- ❌ **Pranchas fotográficas** não existem — sem layout 1/2/4/6 por página.
- ❌ Lista de figuras: ausente.
- ❌ Substituir imagem mantendo legenda: não há UX dedicada.

### 4.12. Tabelas

- ⚠️ Tabela existe (TipTap padrão), mas:
  - Sem botões/atalho para inserir linha/coluna após criar.
  - Sem mesclar células interativo.
  - Sem bordas/sombreamento configuráveis.
  - Sem estilos de tabela presets (pericial padrão).
  - Sem repetir cabeçalho na quebra de página.
  - Sem legenda/numeração automática.
  - Sem lista de tabelas.
- ❌ Tabelas-modelo periciais (dados do local, dos veículos, dos envolvidos, dos vestígios, medições, cronologia, quesitos, etc.) — ausentes.

### 4.13. Quesitos

- ⚠️ Bloco existe, mas:
  - Sem renumeração automática ao inserir/remover.
  - Sem marcar quesito como respondido/pendente.
  - Sem validação de quesitos sem resposta.
  - Sem resumo de pendentes.

### 4.14. Validação

- ⚠️ `validateSicroDoc` só checa figura sem legenda + systemData pendente.
- ❌ Sem checagem de: campo obrigatório vazio (número do laudo, requisição, etc.), seções obrigatórias ausentes, quesitos sem resposta, tabelas sem legenda, croqui ausente, sumário desatualizado, comentários não resolvidos.
- ❌ Sem botão "ir até o problema" / "ignorar alerta".

### 4.15. Exportação

- ⚠️ PDF/DOCX/HTML funcionam, mas:
  - Sem opção "com / sem comentários" (comentários não existem ainda).
  - Sem "versão final bloqueada" vs "editável".
  - Sem **export JSON estruturado** explícito.
  - Sem imprimir nativo (Ctrl+P → diálogo de impressão).
  - Sem visualização de impressão WYSIWYG (HtmlPreview existe mas em modal).

---

## 5. O que NÃO EXISTE (lacunas totais)

### 5.1. Funcional

- ❌ **Salvar como** / Duplicar laudo.
- ❌ **Renomear laudo** dedicado (existe via título da view, mas inline).
- ❌ **Autosave debounced**.
- ❌ **Recuperação após falha** (snapshot crash).
- ❌ **Histórico de versões** (snapshots por save).
- ❌ **Status do documento** (rascunho/revisão/final).
- ❌ **Bloqueio de edição** no estado final.
- ❌ **Hash + timestamp + responsável** ao finalizar.
- ❌ **Reabrir como nova versão**.
- ❌ **Localizar texto (Ctrl+F)**.
- ❌ **Substituir texto**.
- ❌ **Contagem de palavras / caracteres** visível.
- ❌ **Exibir caracteres invisíveis** (¶, →, etc.).
- ❌ **Cor de fonte, marca-texto, sobrescrito, subscrito, tachado**.
- ❌ **Fonte família/tamanho** configurável.
- ❌ **Espaçamento entre linhas / antes / depois do parágrafo**.
- ❌ **Recuo esquerdo/direito/primeira linha**.
- ❌ **Tabulação**.
- ❌ **Lista multinível**.
- ❌ **Quebra de página real / quebra de seção**.
- ❌ **Sumário automático (TOC)**.
- ❌ **Lista de figuras** / **Lista de tabelas**.
- ❌ **Referência cruzada**.
- ❌ **Painel de navegação por títulos clicáveis**.
- ❌ **Numeração automática de seções**.
- ❌ **Estilos completos** (Normal/Título/Subtítulo/Seção/Quesito/Resposta/Legenda/Citação/Observação/Conclusão/Advertência/Assinatura).
- ❌ **Painel de estilos**.
- ❌ **Painel de campos do caso** com formulário.
- ❌ **Placeholders `{{variavel}}` reativos**.
- ❌ **Pranchas fotográficas** (1/2/4/6 por página).
- ❌ **Tabelas-modelo periciais**.
- ❌ **Renumeração automática de quesitos**.
- ❌ **Comentários internos** vinculados a trechos.
- ❌ **Modo revisão / controle de alterações**.
- ❌ **Comparar versões**.
- ❌ **Biblioteca de blocos textuais reutilizáveis**.
- ❌ **Corretor ortográfico** dedicado + dicionário técnico.
- ❌ **Status bar inferior** (palavras, caractere, modo, zoom, save).
- ❌ **Indicador de modo** (edição/revisão/leitura/final).
- ❌ **Miniaturas de páginas**.

### 5.2. Arquitetural

- ❌ Pasta `hooks/` vazia — convém ter `useLaudoEditor`, `useLaudoAutosave`, `useLaudoValidation`.
- ❌ Sem pasta `services/` para utilitários (find/replace engine, autosave timer, version snapshotting).
- ❌ Sem pasta `exporters/` no frontend separada da `document-engine` (exporters atuais misturam render + invoke).

---

## 6. Riscos arquiteturais

| Risco | Severidade | Como mitigar |
|---|---|---|
| **TipTap state heavy on re-renders** — `LaudoEditorView` re-cria o editor inteiro quando `currentLaudo.id` muda (linha 67); ok hoje, mas pode interagir mal com autosave + comentários. | Médio | Memoizar conteúdo inicial via `useMemo`. Já existe `initializedRef` defensivo. |
| **`SicroDoc.content` é `JSONContent` opaco** — coerce permissivo; nodes futuros podem corromper docs antigos sem migration. | Alto | Adicionar `schema_version` checking + migrations no `coerceSicroDoc`. Schema hoje aceita qualquer JSON com `.type`. |
| **DOCX walker tem 1.204 linhas e está acoplado ao set de nodes atual** — adicionar novo node exige tocar walker + renderer.ts (frontend) + Inspector. | Alto | Manter contrato dos nodes (`attrs` estáveis) + criar tabela de "nodes suportados em export" no início do walker. |
| **`document-engine/index.ts` exporta tudo (78 ln barrel)** — qualquer mudança causa cascata de re-exports. | Baixo | Manter, mas criar barrels secundários por subdomínio (styles, fields, sections). |
| **Sem testes unitários do frontend do laudo** (só backend `docx_export.rs`). Tests Vitest cobrem só croqui/imagem. | Médio | Adicionar testes Vitest para `validators.ts`, `templates.ts`, `numbering.ts`, futuros estilos e campos. |
| **`hooks/` vazio** indica que toda lógica de editor está dentro de componentes (espalhada entre `LaudoEditorView`, `EditorPage`, `Inspector`). | Médio | Extrair gradualmente para hooks como `useLaudoEditor`, `useAutosave`, `useDocumentValidation`. |
| **Renderer HTML e walker DOCX divergem em capacidades** — adicionar feature exige atualizar 2 lados ou aceitar perda no DOCX. | Médio | Criar testes de paridade (snapshot do HTML vs validação do walker) por feature. |
| **Sem dirty state / unsaved guard** no laudo (já existe no Croqui) — perito perde edições ao trocar de laudo. | Alto | Replicar o mecanismo do Croqui (`UnsavedChangesModal` + `navGuard`). |
| **Image extension permite base64 inline (`allowBase64: true`)** — pode gerar `.sicrodoc` enormes se perito colar imagens diretamente. | Médio | Detectar paste de imagem + redirecionar para evidence upload. |
| **`SystemData` não atualiza ao mudar `Occurrence`** — perito tem que re-aplicar templates. | Médio | Implementar resolver dinâmico que substitui no momento de render/save. |

---

## 7. Cobertura percentual estimada (vs meta Word-like 80–90%)

| Bloco funcional | Estado atual | Cobertura |
|---|---|---|
| 1. Documento e arquivo | parcial | 40% |
| 2. Edição rica de texto | parcial | 45% |
| 3. Página e layout | parcial | 55% |
| 4. Estilos documentais | embrionário | 20% |
| 5. Estrutura documental | embrionário | 15% |
| 6. Modelos de laudo | parcial | 25% |
| 7. Campos automáticos | embrionário | 15% |
| 8. Imagens / pranchas | parcial | 50% |
| 9. Tabelas | embrionário | 20% |
| 10. Quesitos | parcial | 35% |
| 11. Revisão e comentários | ausente | 0% |
| 12. Validação | embrionário | 15% |
| 13. Exportação | bom | 70% |
| 14. Assinatura / integridade | ausente | 5% |
| 15. Integrações com outros módulos | parcial | 50% |
| 16. UX | bom | 60% |
| 17. Biblioteca de blocos | ausente | 0% |
| 18. Ortografia | ausente | 5% (TipTap default browser) |
| 19. Performance / confiabilidade | aceitável | 60% |
| 20. Arquitetura | sólida-incompleta | 65% |
| **Cobertura média ponderada** | | **~35%** |

---

## 8. Arquitetura proposta (evolução)

Para sair de 35% → 80–90% sem refazer, **mantemos** todo o existente e **estendemos** com novos diretórios:

```
src/modules/laudo/
├── components/
│   ├── editor/                     ← já há equivalentes; consolidar
│   │   ├── LaudoEditorShell.tsx    (substitui partes do LaudoEditorView)
│   │   ├── LaudoCanvas.tsx
│   │   └── LaudoToolbar/           (toolbar quebrada em sub-toolbars: fonte, parágrafo, inserir, revisar)
│   │       ├── index.tsx
│   │       ├── FontToolbar.tsx
│   │       ├── ParagraphToolbar.tsx
│   │       ├── InsertToolbar.tsx
│   │       ├── StyleSelector.tsx
│   │       └── FindReplaceBar.tsx
│   ├── panels/
│   │   ├── NavigationPanel.tsx     ← outline clicável
│   │   ├── StylesPanel.tsx         ← lista de estilos
│   │   ├── FieldsPanel.tsx         ← formulário de campos do caso
│   │   ├── CommentsPanel.tsx       ← novo
│   │   └── ValidationPanel.tsx     ← já existe parcial
│   ├── status-bar/
│   │   └── LaudoStatusBar.tsx      ← novo: palavras, caracteres, modo, zoom, save
│   ├── plates/                     ← pranchas fotográficas
│   │   └── PhotoPlateInsert.tsx
│   └── version-bar/
│       └── DocumentStatusBadge.tsx ← rascunho/revisão/final
│
├── document-engine/                ← já sólido, expandir
│   ├── styles/                     ← NOVO
│   │   ├── index.ts
│   │   ├── definitions.ts          ← Normal, Título 1-3, Quesito, etc.
│   │   ├── applyStyle.ts
│   │   └── styles.css
│   ├── fields/                     ← NOVO
│   │   ├── index.ts
│   │   ├── catalog.ts              ← {{numero_laudo}}, etc.
│   │   ├── resolver.ts             ← occurrence → valor
│   │   └── Placeholder.ts          ← TipTap node placeholder reativo
│   ├── sections/                   ← NOVO
│   │   ├── numbering.ts            ← renumeração automática
│   │   ├── toc.ts                  ← sumário
│   │   ├── figureList.ts
│   │   └── tableList.ts
│   ├── comments/                   ← NOVO
│   │   ├── CommentMark.ts
│   │   └── commentStore.ts
│   ├── versioning/                 ← NOVO
│   │   ├── snapshot.ts
│   │   └── compareSimple.ts
│   ├── blocks/                     ← NOVO biblioteca de blocos textuais
│   │   ├── index.ts
│   │   ├── catalog.ts
│   │   └── categories.ts
│   ├── nodes/                      ← já existe; adicionar
│   │   ├── PhotoPlate.ts           ← prancha fotográfica
│   │   ├── FieldPlaceholder.ts     ← {{var}} clicável
│   │   ├── PericialTable.ts        ← tabela com legenda + numeração
│   │   └── CommentAnchor.ts
│   ├── exporters/                  ← NOVO frontend wrapper
│   │   ├── pdf.ts
│   │   ├── docx.ts
│   │   ├── html.ts
│   │   └── jsonStructured.ts
│   ├── templates/                  ← já existe; expandir para 8 templates
│   │   ├── index.ts
│   │   ├── documento-livre.ts
│   │   ├── sinistro-transito.ts
│   │   ├── sinistro-transito-completo.ts
│   │   ├── arrombamento.ts
│   │   ├── avaliacao-merceologica.ts
│   │   ├── constatacao.ts
│   │   ├── exame-veicular.ts
│   │   ├── local-crime.ts
│   │   └── em-branco.ts
│   └── validation/                 ← NOVO consolidação
│       ├── rules.ts
│       └── runValidation.ts
│
├── hooks/
│   ├── useLaudoEditor.ts           ← consolidar lifecycle
│   ├── useAutosave.ts              ← debounced save
│   ├── useUnsavedGuard.ts          ← bloquear navegação
│   ├── useFindReplace.ts
│   ├── useDocumentValidation.ts
│   ├── useWordCount.ts
│   ├── useZoom.ts
│   └── useFieldResolver.ts         ← ouvir mudanças no caso → atualizar placeholders
│
├── services/
│   ├── autosave.ts
│   ├── snapshot.ts                 ← gerar snapshot + hash
│   ├── exportPipeline.ts
│   └── crashRecovery.ts            ← localStorage rolling
│
└── store/
    └── laudoStore.ts               ← expandir: status, comments, snapshots
```

**Não removeremos nada existente.** Cada novo arquivo é aditivo.

---

## 9. Plano de implementação por fases

| Fase | Escopo principal | Risco | Esforço relativo |
|---|---|---|---|
| **F1** — Auditoria (esta) | docs/sicro-laudo-auditoria.md + checklist + tasks | nulo | concluído |
| **F2** — Edição rica | Toolbar completa, atalhos (Ctrl+S/F/P/A), autosave debounced, find/replace, contagem palavras, cor/realce/tachado/sobrescrito/subscrito, font família/tamanho | baixo-médio | 1× |
| **F3** — Página e layout | Zoom (50%-200%), modos (edição/leitura/foco/revisão), orientação retrato/paisagem com UI, visualização de impressão WYSIWYG, miniaturas opcionais | médio | 1× |
| **F4** — Estilos e estrutura | Sistema de estilos centralizado (12+ estilos), painel de estilos, numeração automática de seções, sumário automático, lista de figuras, lista de tabelas, painel de navegação clicável | alto | 1,5× |
| **F5** — Templates + campos | 8 templates (arrombamento, avaliação, constatação, exame veicular, local crime, etc.), node `FieldPlaceholder` com `{{var}}`, resolver dinâmico, painel de campos com formulário | médio-alto | 1,5× |
| **F6** — Imagens + pranchas | Redimensionar/girar interno, legenda automática numerada `Figura N`, lista de figuras, prancha fotográfica (1/2/4/6 por página), substituir mantendo legenda | médio | 1,5× |
| **F7** — Tabelas + quesitos | Toolbar de tabela, mesclar/inserir/remover, estilos de tabela, tabelas-modelo periciais, legenda+numeração de tabelas, renumeração automática de quesitos, marcação respondido/pendente, validação de pendentes | médio-alto | 1,5× |
| **F8** — Revisão + comentários + histórico | CommentMark + painel de comentários, resolver/reabrir, modo revisão (ver alterações), snapshots por save, comparar versões, status doc (rascunho/revisão/final) | alto | 2× |
| **F9** — Validação + exportação + finalização | Validação completa (rules table), painel/modal validação, exportar PDF "final bloqueado" vs "editável", marcar como final + hash + timestamp + bloqueio, exportar JSON estruturado, recuperação após falha | médio-alto | 1,5× |
| **F10** — UX + integrações + blocos | Status bar, indicadores modo/zoom, miniaturas, biblioteca de blocos textuais + categorias, integração croqui (referência clicável), atualizar laudo quando caso muda (com confirmação), polir visual premium | médio | 1× |

**Total estimado:** 10 fases. **Validação após cada fase:** typecheck + test + build + cargo check.

---

## 10. Checklist técnico (vivo — atualizar ao fim de cada fase)

### F1 — Auditoria
- [x] Mapeamento completo de arquivos
- [x] Diagnóstico funcional
- [x] Riscos arquiteturais identificados
- [x] Plano de fases definido
- [x] Tasks #271–#279 criadas

### F2 — Edição rica ✅ ENTREGUE
- [x] Toolbar reorganizada com **3 novos grupos**: fonte (família + tamanho), marcas (bold/italic/underline/strike/sub/sup/code), cor (texto + realce + limpar)
- [x] Atalhos Ctrl+S (salva), Ctrl+F (localizar), Ctrl+H (substituir), Esc (fecha barra) — `useLaudoShortcuts`
- [x] Autosave debounced **3000ms** — `useAutosave` com pause durante save manual
- [x] Find + Replace — `FindReplaceBar` + `useFindReplace` com case/whole-word toggles
- [x] Contagem palavras / caracteres / caracteres-sem-espaços / parágrafos — `useWordCount` + `LaudoStatusBar`
- [x] Cor de fonte (TextStyle + Color extension) — ColorPickerBtn com 6 cores periciais
- [x] Realce/marca-texto (Highlight extension multicolor) — paleta com 5 cores
- [x] Tachado (Strike — já vinha no StarterKit, agora exposto)
- [x] Sobrescrito / Subscrito (Superscript / Subscript extensions)
- [x] Font família + tamanho — `FontFamily` extension + `FontSize` custom mark
- [x] Limpar formatação (`unsetAllMarks + clearNodes`)
- [x] Tests Vitest — 11 novos testes em `useFindReplace.test.ts`
- [x] Indicador de save (saved/saving/dirty/error) na `LaudoStatusBar`
- [ ] Recuperação local após crash — adiado para F8 (junto com versionamento)
- [ ] Lista multinível / Espaçamento entre linhas — adiado para F4 (sistema de estilos)
- [ ] Caracteres invisíveis — adiado para F3 (modos do editor)

**Métricas F2:**
- Arquivos novos: 7 (`useAutosave`, `useFindReplace`, `useWordCount`, `useLaudoShortcuts`, `FindReplaceBar`, `LaudoStatusBar`, `FontSize`).
- CSS novos: 2 (`FindReplaceBar.module.css`, `LaudoStatusBar.module.css`).
- Pacotes adicionados: 6 TipTap extensions (`text-style`, `color`, `highlight`, `subscript`, `superscript`, `font-family`).
- `EditorToolbar` antes: 30% das features Word. Depois: ~75%.
- `LaudoEditorView` integrou hooks + barra + status bar sem quebrar fluxos legados.
- Testes: 812 → 823 (11 novos).
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 823 passed, `pnpm build` ✅.

### F3 — Página e layout ✅ ENTREGUE
- [x] Zoom 50%-200% com slider — `useZoom` + `PageControls`
- [x] Botões "Ajustar à largura" / "Ajustar à página" — dropdown Maximize2 com `fitWidth`/`fitPage`
- [x] Botão "100%" (reset zoom)
- [x] Orientação retrato/paisagem — toggle no Inspector "Página" (persiste em `doc.layout.orientation`)
- [x] Modo edição / leitura / foco / revisão — `useEditorMode` + segmented control na status bar
- [x] **Edição**: tudo visível (default)
- [x] **Leitura**: `editor.setEditable(false)`, fundo neutro, cursor padrão
- [x] **Foco**: Inspector + status bar ocultos, fundo suave, sem distração
- [x] **Revisão**: Inspector visível (preparado para F8 comentários)
- [x] Atalhos `Ctrl+=`, `Ctrl+−`, `Ctrl+0` para zoom in/out/reset
- [x] `EditorPage` renderiza A4 paisagem corretamente (sheet 29.7×21cm)
- [x] `useZoom` aplica `transform: scale()` no workspace (não afeta DOCX/PDF export)
- [x] Tests Vitest — 16 novos (11 useZoom + 5 useEditorMode)
- [ ] Visualização de impressão WYSIWYG dedicada — `HtmlPreview` existente já cobre; melhoria adiada para F9 (exportação)
- [ ] Miniaturas de páginas — adiado para F10 (UX refinement)

**Métricas F3:**
- Hooks novos: 2 (`useZoom`, `useEditorMode`).
- Componentes novos: 1 (`PageControls`) + CSS module.
- Schema usado: `doc.layout.orientation` (já existia, agora exposto na UI).
- `EditorPage` agora aceita `zoom` + `mode` props.
- `useLaudoShortcuts` estendido com `onZoomIn/Out/Reset`.
- Tests: 823 → 839 (+16).
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 839 passed, `pnpm build` ✅, `cargo check` ✅.

### F4 — Estilos e estrutura ✅ ENTREGUE (núcleo) + parcial
- [x] `document-engine/styles/` criado com catálogo, extension TipTap e CSS
- [x] **14 estilos** definidos (Normal, Título 1-3, Subtítulo, Seção técnica, Quesito, Resposta, Legenda, Citação, Observação, Conclusão, Advertência, Assinatura)
- [x] **StylesPanel** no Inspector — galeria com 2 categorias (Estrutura / Pericial), preview visual de cada estilo, destaque do estilo ativo
- [x] **Atalhos Ctrl+Alt+0..7** para os estilos mais usados (Normal, T1, T2, T3, Subtítulo, Seção técnica, Quesito, Resposta)
- [x] Botão "Limpar estilo" para remover atributo `data-laudo-style`
- [x] **document-engine/sections/** com `extractOutline` + `numberOutline`
- [x] **Numeração automática** de seções (1, 1.1, 1.1.1) calculada em tempo de leitura
- [x] **NavigationPanel** clicável — substitui o `OutlinePanel` legado: numeração automática + click navega para a seção + highlight do heading sob o cursor
- [x] Tests Vitest — 25 novos (14 extractOutline+numberOutline + 11 styles)
- [ ] **Sumário automático** como bloco inserível no documento — adiado para F6/F9 (precisa de um node TipTap dedicado + atualização sob demanda)
- [ ] **Lista de figuras** automática — adiado para F6 (depende de Figure numerada por F6)
- [ ] **Lista de tabelas** automática — adiado para F7 (depende de tabelas numeradas por F7)

**Métricas F4:**
- Arquivos novos: 11 (catálogo, extension, helper, CSS, 2 componentes + 2 CSS, 2 módulos sections, 2 arquivos de teste).
- `Inspector` ganhou 7ª aba "Estilos" (`Palette`); aba "Estrutura" agora usa `NavigationPanel`.
- `EditorPage` importa `styles.css` para renderizar `data-laudo-style`.
- `useLaudoShortcuts` ganhou `onApplyStyle` + Ctrl+Alt+digit mapper.
- Tests: 839 → 864 (+25).
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 864 passed, `pnpm build` ✅.

**Cobertura:**
- **Bloco 4 (Estilos documentais): 20% → ~85%** ✅
- **Bloco 5 (Estrutura documental): 15% → ~55%** ⚠️ (numeração + navegação ok; sumário/figuras/tabelas continua em F6/F7)

### F5 — Templates + campos ✅ ENTREGUE
- [x] **9 templates** publicados (8 explícitos + alias legado):
  - Documento livre, Em branco, Genérico
  - Sinistro de Trânsito (completo), Arrombamento, Local de Crime
  - Avaliação Merceológica, Constatação, Exame Veicular
- [x] **`FieldPlaceholder`** node TipTap (atomic inline `{{var}}`)
- [x] **Catálogo `LAUDO_FIELDS`** com **32 campos** em 7 grupos (identificação, local, pessoas, veículos, vestígios, mídia, sistema)
- [x] **`resolveFieldValue`** com 4 fontes: `occurrence`, `metadata`, `system` (data_hoje/data_hora_agora), `fixed`
- [x] **`FieldsPanel`** no popover superior — galeria com preview de valor, indicação de obrigatórios sem valor, click para inserir no cursor
- [x] **Validação de obrigatórios** — `findMissingRequiredFields` + badge vermelho no botão "Campos" do menu superior
- [x] **Estilos `data-laudo-style`** em todos os headings dos templates (integração F4 ↔ F5)
- [x] **Bloco de assinatura reutilizável** com `data_hoje`, `nome_perito`, `cargo_perito`, `matricula_perito`
- [x] **Helpers compartilhados** (`heading`, `subtitulo`, `paragraph`, `styledParagraph`, `sentence`, `field`, `quesitoList`, `signatureBlock`)
- [x] **Alias legado** `sinistro_transito_simples` → `sinistro_transito` (sem quebrar laudos antigos)
- [x] Tests Vitest — 46 novos (24 fields + 22 templates)

**Métricas F5:**
- Arquivos novos: 19 (catalog, resolver, FieldPlaceholder, 9 templates, helpers, types, 2 testes, FieldsPanel + CSS, e 3 outros)
- Removido: `document-engine/templates.ts` (substituído pelo diretório `templates/`)
- `EditorMenuBar` ganhou 6º popover **"Campos"** com badge para obrigatórios faltando
- `extensions.ts` registra `FieldPlaceholder`
- Tests: 864 → 910 (+46)
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 910 passed, `pnpm build` ✅, `cargo check` ✅

**Cobertura:**
- **Bloco 6 (Modelos de laudo): 25% → ~95%** ✅
- **Bloco 7 (Campos automáticos): 15% → ~90%** ✅
- **Bloco 12 (Validação): 15% → ~30%** (placeholder de obrigatórios + badge; validação completa em F9)

### F6 — Imagens + pranchas ✅ ENTREGUE (núcleo) + parcial
- [x] **Figure atributos novos**: `width` (CSS), `align` (left/center/right) — aplicados via `data-*` + style inline
- [x] **`setFigureSize`** command — ajusta largura/alinhamento sem perder atributos
- [x] **`replaceFigureSrc`** command — troca imagem **mantendo legenda + numeração + provenance**
- [x] **PhotoPlate node** — 4 layouts (1x1, 1x2, 2x2, 2x3) com 1/2/4/6 fotos
- [x] **PhotoPlate render** — grid CSS print-friendly + page-break-inside avoid + slots vazios visíveis durante edição
- [x] **`document-engine/figures/`** — `extractFigures` (varre figure/photoPlate) + `buildFigureList` (numeração)
- [x] **Numeração por kind** (Figura/Croqui/Frame séries independentes) ou unificada (`unified` mode)
- [x] **FiguresPanel** no menu superior — lista numerada + counts por tipo + inserir prancha com seletor visual de layout (4 SVG previews)
- [x] **Estilos CSS** para Figure + PhotoPlate (page-break, legendas centradas em italic)
- [x] Tests Vitest — 12 novos (extractFigures + buildFigureList + helpers)
- [ ] **Resize handles interativo** (drag-corner real no editor) — adiado para F10 (UX). Por ora largura/alinhamento via Inspector.
- [ ] **Bloco "Lista de Figuras" inserível** (tipo TOC para figuras) — adiado para F9 junto com sumário e validação final.
- [ ] **UI dedicada para popular pranchas** (drag photos do dossiê para slots) — adiado para F10.

**Métricas F6:**
- Arquivos novos: 6 (`PhotoPlate.ts`, `figures/extractFigures.ts`, `figures/numbering.ts`, `figures/index.ts`, `FiguresPanel.tsx` + CSS)
- `Figure.ts` estendido com 2 atributos novos + 2 commands
- `extensions.ts` registra `PhotoPlate`
- `EditorMenuBar` ganhou 7º popover "Figuras"
- CSS para PhotoPlate + Figure aprimorado em `styles.css`
- Tests: 910 → 922 (+12)
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 922 passed, `pnpm build` ✅, `cargo check` ✅

**Cobertura:**
- **Bloco 8 (Imagens/pranchas): 50% → ~80%** ✅ (pranchas fotográficas + numeração + width/align funcionando; resize handles e UI de popular pranchas ficam para F10)

### F7 — Tabelas + quesitos ✅ ENTREGUE (núcleo) + parcial
- [x] **Toolbar contextual** dentro de tabela: inserir/remover linha acima/abaixo, inserir/remover coluna esquerda/direita, mesclar/dividir células, alternar header row/column, remover tabela
- [x] **10 tabelas-modelo periciais** — Tabela 3×3, Dados do local, Dos veículos, Dos envolvidos, Vestígios, Medições, Cronologia, Materiais examinados, Condições ambientais, Mídias/vídeos
- [x] **Estilo institucional de tabela** — bordas cinza finas, header com fundo claro, font 10.5pt, page-break-inside avoid
- [x] **`document-engine/tables/`** com `extractTables` + `buildTableList` (paralelo a sections/figures)
- [x] **TablePanel no menu superior** — 3 seções (contextual + galeria templates + lista de tabelas no documento)
- [x] **Cleanup toolbar de formatação** — removidos 6 botões duplicados (Figura/Tabela/Storyboard/Quesito/Assinatura/Dado do sistema). Localizar/Prévia/Exportar/Salvar permanecem na primeira linha. Toolbar agora foca em **formatação**.
- [x] Quesito como **estilo `data-laudo-style="quesito"`** (entregue em F4 + atalho Ctrl+Alt+6)
- [x] Tests Vitest — 23 novos (templates + extractTables + buildTableList)
- [ ] **Numeração visual "Tabela N:" antes da tabela** — adiado para F9 (junto com sumário/lista de tabelas/figuras)
- [ ] **Marcar quesito respondido/pendente + validação** — adiado para F9

**Métricas F7:**
- Arquivos novos: 6 (`tables/templates.ts`, `tables/extractTables.ts`, `tables/index.ts`, `tables/__tests__/tables.test.ts`, `TablePanel.tsx` + CSS)
- `EditorToolbar.tsx` — removidos 6 botões + 6 imports de ícones não usados (cleanup)
- `EditorMenuBar.tsx` — 8º popover **"Tabela"** (ícone `Table`)
- `styles.css` — regras institucionais para `table[data-sicro-table]`
- Tests: 922 → 945 (+23)
- Validações: `pnpm typecheck` ✅, `pnpm test` ✅ 945 passed, `pnpm build` ✅, `cargo check` ✅

**Cobertura:**
- **Bloco 9 (Tabelas): 20% → ~85%** ✅
- **Bloco 10 (Quesitos): 35% → ~55%** (estilo + atalho via F4; validação de pendentes em F9)

### F8 — Revisão + comentários + histórico
- [ ] CommentMark + CommentAnchor nodes
- [ ] CommentsPanel
- [ ] Modo revisão (mostrar alterações)
- [ ] Snapshots por save (limite 20)
- [ ] Compare visual de versões
- [ ] Status doc (rascunho/revisão/final) + DocumentStatusBadge

### F9 — Validação + finalização
- [ ] rules.ts com 20+ regras
- [ ] ValidationPanel completo (erros/alertas/sugestões)
- [ ] Botão "ir até o problema"
- [ ] Export "final bloqueado" vs "editável"
- [ ] Marcar como final → hash + timestamp + bloqueio
- [ ] Reabrir como nova versão
- [ ] Export JSON estruturado

### F10 — UX + integrações + blocos
- [ ] LaudoStatusBar
- [ ] Indicadores de modo / zoom
- [ ] Miniaturas de página
- [ ] BlocksPanel (biblioteca textual)
- [ ] Inserir croqui clicável (link vivo)
- [ ] Atualizar laudo quando caso muda (com confirmação)

---

## 11. Decisões assumidas (a confirmar pelo usuário antes de prosseguir)

1. **Manter TipTap** como motor de edição. ✓ (escolha já consolidada)
2. **Não substituir nada existente** — só estender.
3. **Comentários internos NÃO aparecem na versão final exportada** por padrão (com opção explícita).
4. **Histórico de versões: snapshot por save**, limite ~20 versões mantidas.
5. **Placeholders `{{var}}`**: sintaxe inspirada em mustache/handlebars, com node TipTap dedicado, NÃO regex em texto puro.
6. **Marcação visual de campo não preenchido**: highlight amarelo no editor + entrada no ValidationPanel.
7. **Pranchas fotográficas**: node TipTap com `layout: "1x1"|"1x2"|"2x2"|"2x3"` e bloco renderiza grid.
8. **Status do documento**: novo campo em `SicroDocMetadata` ou top-level no envelope; preferência por top-level `status` para serializar/validar facilmente.
9. **Schema bump**: ao adicionar styles + status + fields, **bump para `1.1.0`** com migração leve.
10. **DOCX export**: cada feature nova precisa de suporte no walker (`docx.rs`) OU é marcada como "não exportável em DOCX" — não vamos quebrar export.

---

## 12. Próximos passos imediatos

1. ✅ **Esta auditoria** entregue.
2. ⏳ **Aguardar approval do usuário** sobre o plano (especialmente §11).
3. Iniciar **F2 — Edição rica** (toolbar completa + atalhos + autosave + find/replace).
4. Ao final de F2: rodar typecheck + test + build + cargo check, atualizar checklist desta auditoria, e parar para validação visual antes de F3.

**Filosofia:** Word-like na edição, pericial na inteligência. Cada fase entrega valor visível e não derruba o que já existe.
