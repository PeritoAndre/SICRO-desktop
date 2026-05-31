# MVP 4 — Integração Evidência → Laudo

**Branch:** `mvp/evidencias-no-laudo`
**Data:** 2026-05-25
**Status final:** ✅ **APROVADO COM RESSALVA** após validação manual
**Ressalva:** DOCX não exportou imagens reais (placeholder presente) →
registrado como pendência técnica futura, **não bloqueia** o MVP 4
porque o PDF é a saída oficial/fiel e o DOCX é a saída editável
secundária.

---

## 1. Escopo

Permitir ao perito inserir, no laudo, evidência **rastreável** vinda dos
módulos anteriores:

- Fotos do Dossiê (Spike D / MVP 3) → figura;
- Croquis (Spike E, PNG exportado pelo próprio módulo) → figura;
- Frames de vídeo extraídos por FFmpeg (Spike F) → figura;
- Storyboard completo de um vídeo → bloco storyboard;
- Campos da ocorrência → `systemData` (revisão pendente);
- Anotações de campo do Dossiê → parágrafo;
- Tabelas geradas do Dossiê (checklist, vestígios, medições) →
  `evidenceTable` (bloco atomic).

Cada inserção gera dois artefatos:

1. um node TipTap no `.sicrodoc` com atributos de procedência
   (`evidence_id`, `evidence_kind`, `relative_path`, `source_hash`,
   `metadata_json`, etc.);
2. uma linha em `evidence_links` (SQLite), que serve de índice/audit log
   independente do parser de documento.

A fonte da verdade continua sendo o `.sicrodoc`. PDF e DOCX continuam
sendo exportações.

---

## 2. Decisões arquiteturais (acordadas com o usuário)

### 2.1 `src` no `.sicrodoc`
Foi decidido (`AskUserQuestion`) que o `src` salvo no `.sicrodoc` é o
**caminho relativo ao workspace**, não data URI nem absoluto. Vantagens:

- `.sicrodoc` permanece textual, diffável e portável entre máquinas;
- evita pesar o arquivo com base64;
- mantém o link forense intacto se o workspace inteiro for movido.

Como o WebView do Tauri não carrega `<img src="imports/photos/IMG.jpg">`
diretamente, o frontend faz duas pontes:

- **`resolveEvidenceSrcsForEditor(content, workspacePath)`**: chamada ao
  carregar/salvar para a UI, troca `src` por `convertFileSrc(absolute)`
  para o editor exibir a foto;
- **`normalizeEvidenceSrcsForSave(content)`**: chamada antes do
  `save_laudo`, devolve `src` à forma relativa.

O loop é idempotente; nada vaza para o disco com URL `tauri://` ou
caminho absoluto.

### 2.2 DOCX com imagens
Foi decidido tentar embed real via docx-rs `Pic`/`AddImage` com **fallback
para placeholder**. O walker:

- lê os bytes via `<workspace>/<relative_path>`;
- detecta PNG/JPEG por magic bytes (não usamos `image` crate — parser
  inline pequeno);
- calcula proporção real da imagem (PNG IHDR ou JPEG SOFn);
- emite `Pic::new(bytes).size(w_emu, h_emu)` com largura alvo de 14 cm
  (figura) ou 7 cm (frame de storyboard);
- se o arquivo estiver faltando ou não for PNG/JPG, cai em parágrafo
  itálico `[Figura — imagem indisponível nesta exportação]`.

Path traversal é rejeitado (mesmo whitelist do
`read_evidence_asset`: sem `..`, sem letra de drive, sem `/` inicial).

### 2.3 `EvidenceTable` como atomic node
Para checklist / vestígios / medições optei por um node **separado** do
TipTap `Table` (extensão de tabela editável). Razões:

- a tabela é gerada do Dossiê e considerada imutável dentro do laudo —
  edição correta é no Dossiê;
- evita colisão com a engine de tabela existente (que tem regras de
  paste/cell-merge complexas);
- guarda `columns`, `rows`, `kind`, `title`, `metadata_json` em attrs,
  permitindo regenerar o HTML/DOCX deterministicamente.

### 2.4 Dossiê → parágrafo
Anotações de campo viram parágrafo de texto puro. O vínculo com o
`field_notes.id` original mora em `evidence_links` (não inflamos o
schema do Paragraph com attrs custom só para essa origem).

---

## 3. Arquivos tocados

### 3.1 Backend Rust
- **`migrations/008_evidence_links.sql`** *(novo)* — tabela
  `evidence_links` com colunas opcionais para cada tipo de fonte
  (`media_asset_id`, `croqui_id`, `video_storyboard_frame_id`,
  `field_note_id`, etc.).
- **`src/database/migrations.rs`** — registra a migration 008.
- **`src/models/evidence.rs`** *(novo)* — enum `EvidenceSourceKind`,
  struct `EvidenceLink`, `RecordEvidenceLinkInput`, `EvidenceAsset`.
- **`src/models/mod.rs`** — re-exporta os tipos.
- **`src/database/repositories/evidence_link_repo.rs`** *(novo)* — insert
  + list_for_target.
- **`src/database/repositories/mod.rs`** — registra o módulo.
- **`src/commands/evidence_commands.rs`** *(novo)*:
  - `record_evidence_link`
  - `list_evidence_links_for_laudo`
  - `read_evidence_asset` (com `sanitize_relative_path`).
- **`src/commands/mod.rs`** + **`src/lib.rs`** — registra os 3 commands.
- **`src/exporters/docx.rs`** — adiciona:
  - parâmetro `workspace_root: Option<&Path>` para `render_doc_to_docx`;
  - struct `RenderCtx`;
  - dispatcher `evidenceTable` → `render_evidence_table`;
  - `build_image_pic` / `build_storyboard_pic`;
  - parser inline de dimensões PNG/JPEG (sem deps novas);
  - `sanitize_relative_path` local (mesmo contrato do command);
  - mensagens de placeholder atualizadas
    (`[Figura — imagem indisponível nesta exportação]`).
- **`src/commands/export_commands.rs`** — passa `Some(&ws)` para o
  walker.
- **`tests/docx_export.rs`** — atualiza 6 call sites para o 3º parâmetro
  `None` (continua testando o caminho de placeholder).

### 3.2 Document Engine (TS)
- **`document-engine/nodes/Figure.ts`** — attrs `evidence_id`,
  `evidence_kind`, `relative_path`, `source_hash`, `metadata_json`;
  `renderHTML` emite `data-*`; `insertFigure` aceita os novos params.
- **`document-engine/nodes/Storyboard.ts`** — `media_hash` no bloco;
  `storyboard_frame_id`, `event_id`, `pts`, `time_base`,
  `relative_path` por item; novo command `insertStoryboardFromVideo`.
- **`document-engine/nodes/EvidenceTable.ts`** *(novo)* — bloco atomic
  com `kind`, `title`, `columns`, `rows`, `metadata_json`; renderHTML
  produz `<table data-sicro-evidence-table>`.
- **`document-engine/nodes/index.ts`** — re-exporta `EvidenceTable` e
  tipos.
- **`document-engine/extensions.ts`** — registra `EvidenceTable`.
- **`document-engine/evidence-assets.ts`** *(novo)* — `collectEvidencePaths`,
  `loadEvidenceAssets`, `inlineEvidenceAssets`.
- **`document-engine/relative-src.ts`** *(novo)* —
  `resolveEvidenceSrcsForEditor`, `normalizeEvidenceSrcsForSave`.
- **`document-engine/renderer.ts`** — `RenderOptions` ganha
  `evidenceAssets?: EvidenceAssetMap | null`; aplica
  `inlineEvidenceAssets` antes do `generateHTML`.
- **`document-engine/index.ts`** — re-exports.

### 3.3 Tipos + commands TS
- **`types/evidence.ts`** *(novo)* — espelha os models Rust.
- **`core/commands.ts`** — 3 wrappers:
  `recordEvidenceLink`, `listEvidenceLinksForLaudo`,
  `readEvidenceAsset`.

### 3.4 Módulo Laudo (UI)
- **`modules/laudo/components/evidence/EvidencePanel.tsx`** *(novo)* —
  painel "Inserir Evidência" com 6 sub-abas (Dados / Fotos / Croquis /
  Vídeo / Dossiê / Tabelas). Cada inserção:
  1. dispara o command TipTap;
  2. chama `commands.recordEvidenceLink(...)`.
- **`modules/laudo/components/evidence/EvidencePanel.module.css`**
  *(novo)* — estilos densos no padrão "workbench".
- **`modules/laudo/components/Inspector.tsx`** — adiciona a 6ª aba
  *Evidências*; aceita `editor`, `workspacePath`, `laudoId`.
- **`modules/laudo/views/LaudoEditorView.tsx`** — passa
  `editor`/`workspacePath`/`laudoId` ao Inspector + `workspacePath` ao
  `HtmlPreview`.
- **`modules/laudo/store/laudoStore.ts`** — usa
  `resolveEvidenceSrcsForEditor` ao abrir e
  `normalizeEvidenceSrcsForSave` ao salvar; mantém o `currentDoc`
  in-memory na forma resolvida.
- **`modules/laudo/components/HtmlPreview.tsx`** — pre-carrega evidence
  assets, normaliza o content antes do render e passa
  `evidenceAssets` para `renderSicroDocToHtml`.
- **`modules/laudo/components/ExportMenu.tsx`** — mesma técnica:
  `collectEvidencePaths` + `loadEvidenceAssets` antes do HTML/PDF
  export.

---

## 4. Não fazer (princípios respeitados)

- ❌ Não importou imagem solta sem vínculo. Toda inserção passa por
  `evidence_links` e attrs no node.
- ❌ Não fez commit / merge / tag. Branch `mvp/evidencias-no-laudo`
  permanece com 31 arquivos modificados/novos, sem commit.
- ❌ Não criou IA, OCR, análise automática, edição de imagem nem
  cálculo de velocidade.
- ❌ Não refatorou o Document Engine inteiro — só estendeu Figure e
  Storyboard e adicionou EvidenceTable.
- ❌ Não transformou DOCX em fonte da verdade — `.sicrodoc` continua
  sendo o original; DOCX e PDF lêem dele.
- ❌ Não quebrou Laudo / Dossiê / Croqui / Vídeo / Importador
  (cargo test 39/39 ok, vitest 24/24 ok, pnpm typecheck/build ok).

---

## 5. Validações executadas

| Comando            | Resultado                                                      |
|--------------------|----------------------------------------------------------------|
| `cargo check`      | ok, sem warnings novos                                         |
| `cargo test`       | 39/39 testes passam (docx_export, dossie_persistence, …)       |
| `pnpm typecheck`   | ok                                                             |
| `pnpm test`        | 24/24 testes passam (croqui geometry + serializer)             |
| `pnpm build`       | ok — `index-*.js 1.13 MB` (gzip 348 KB)                        |

**Validação manual — concluída em 2026-05-25:** ✅

| Critério                                                                | Resultado |
|-------------------------------------------------------------------------|-----------|
| Módulo Laudo abriu corretamente                                         | ✅ ok    |
| Aba *Evidências* apareceu no Inspector                                  | ✅ ok    |
| Fotos importadas do SICRO Operacional apareceram                        | ✅ ok    |
| Inserir foto do Dossiê                                                  | ✅ ok    |
| Inserir frames coletados do Vídeo (individualmente)                     | ✅ ok    |
| Inserir storyboard completo                                             | ✅ ok    |
| Inserir croqui exportado                                                | ✅ ok    |
| Visual do laudo no editor (figuras, storyboards, blocos)                | ✅ ok    |
| Desempenho do editor                                                    | ✅ rápido |
| Travamentos                                                             | ✅ nenhum |
| Blocos inseridos apareceram corretamente no editor                      | ✅ ok    |
| Salvar funcionou                                                        | ✅ ok    |
| Fechar e reabrir funcionou (persistência)                               | ✅ ok    |
| HTML exportou corretamente                                              | ✅ ok    |
| PDF exportou corretamente (saída oficial/fiel)                          | ✅ ok    |
| PDF ficou visualmente adequado                                          | ✅ ok    |
| Laudo / Dossiê / Croqui / Vídeo / Importador continuaram funcionando    | ✅ ok    |
| **DOCX exportar imagens reais**                                         | ❌ falhou — imagens não saíram embutidas; placeholder aparece em vez do bytes via `Pic` |

---

## 6. Roteiro de validação para o usuário

1. **Abrir um workspace existente** com fotos importadas (Dossiê), pelo
   menos um croqui exportado em PNG (Croqui) e pelo menos um vídeo com
   storyboard coletado (Vídeo). Se não tiver, criar via Importador →
   Dossiê → Croqui → Vídeo.
2. **Abrir um laudo** existente (ou criar novo).
3. No Inspector lateral, clicar na **aba Evidências**. Conferir as 6
   sub-abas: Dados / Fotos / Croquis / Vídeo / Dossiê / Tabelas.
4. **Inserir uma foto**: na sub-aba Fotos, clicar "Inserir foto" em um
   item. O editor deve mostrar a imagem no fim do laudo + uma figcaption
   editável.
5. **Inserir um croqui**: na sub-aba Croquis, se houver `PNG`
   exportado, "Inserir croqui" deve funcionar; senão a mensagem orienta
   a exportar primeiro no módulo Croqui.
6. **Inserir um frame de vídeo**: na sub-aba Vídeo, clicar "Abrir
   frames" em um vídeo. Listar storyboard. Clicar "Inserir frame" em
   um item.
7. **Inserir storyboard completo**: na mesma janela, clicar "Inserir
   storyboard completo". Deve criar um bloco com todos os frames.
8. **Inserir dados da ocorrência**: na sub-aba Dados, clicar
   "Inserir" em um campo (ex.: Município). O texto aparece em destaque
   (cinza = revisão pendente — mesma convenção do MVP 2).
9. **Inserir anotação**: sub-aba Dossiê → "Inserir anotação".
10. **Inserir tabelas**: sub-aba Tabelas → 3 botões para checklist,
    vestígios, medições.
11. **Salvar**. Reabrir o laudo. Tudo precisa continuar aparecendo.
12. **Exportar PDF e DOCX**. Conferir:
    - PDF mostra cada figura, frame, storyboard e tabela;
    - DOCX abre no Word com as imagens (não placeholder) e tabelas
      reais.
13. **Inspecionar `.sicro/data.sqlite`** (opcional): confirmar que
    `evidence_links` tem uma linha por inserção, com `source_kind`
    coerente e os IDs estrangeiros corretos.

---

## 7. Limites conhecidos / dívida técnica

- **DOCX — imagens reais (RESSALVA do MVP 4)**: validação manual
  confirmou que o `Pic::new(bytes).size(...).add_image(...)` não
  aparece como imagem renderizada quando o DOCX é aberto no Word.
  Hipóteses prováveis a investigar:
  1. A versão 0.4.x do `docx-rs` exige que o `Pic` seja adicionado a
     um `Run` que então é inserido numa `Paragraph` específica — o
     fluxo atual (`Paragraph::new().add_run(Run::new().add_image(pic))`)
     pode estar produzindo um drawing que o Word ignora silenciosamente
     se faltar o relationship `/word/media/imageN`. Confirmar se o
     `docx-rs` cuida do `_rels/document.xml.rels` automaticamente.
  2. Tamanho em EMU pode estar batendo zero por aritmética de
     `i32 vs u32` em alguma rota — vale instrumentar com `dbg!` antes
     de empacotar.
  3. Pode ser necessário escolher uma API específica do `docx-rs` 0.4
     para embed de imagem (`add_image` vs `add_picture` etc.) — vale
     ler o changelog da versão.

  **Plano sugerido para o Spike DOCX-imagens** (próximo trabalho):
  - extrair um arquivo DOCX produzido pelo SICRO + um produzido pelo
    Word com a mesma imagem;
  - comparar `[Content_Types].xml`, `_rels/document.xml.rels`,
    `word/document.xml` e `word/media/*`;
  - se faltar algum relacionamento, abrir issue no `docx-rs`;
  - alternativamente avaliar troca pelo crate `docx-rust` (mais
    novo, com `Image` nativo) ou geração direta do XML OPC.

  Enquanto isso, o walker continua emitindo
  `[Figura — imagem indisponível nesta exportação]` em itálico — não
  quebra o documento, apenas fica menos rico que o PDF.

- **DOCX — clamp de altura**: se um PNG/JPG real fosse embutido com
  proporção muito vertical, o walker clampa a 18 cm; isso ainda vale
  para quando a ressalva acima for resolvida.
- **JPEG progressivo**: o parser de dimensão usa `SOF0/SOF1/SOF2…`,
  mas se a foto importada não bater o magic byte 0xFF 0xD8 0xFF (raro
  com fotos de celular) o embed cai em placeholder.
- **`field_note → paragraph`**: o vínculo está em `evidence_links`,
  mas o texto inserido vira parágrafo puro — sem marcação visual no
  editor (decisão deliberada para não inflar Paragraph). Se for
  necessário "voltar" do parágrafo ao field_note original, é só
  consultar `evidence_links.field_note_id`.
- **Re-export de croqui**: se o perito editar o croqui depois de
  inserí-lo no laudo, ele precisa re-exportar o PNG no módulo Croqui e
  re-inserir no laudo. Não há sincronização automática (seria fácil
  cometer surpresa visual).
- **Cache de evidence assets**: o `HtmlPreview` recarrega tudo a cada
  abertura do preview. Tem espaço para um cache LRU caso o `.sicrodoc`
  cresça muito — não implementado nesta MVP.

---

## 8. Próximos passos sugeridos

**Prioridade alta (resolver a ressalva):**
- **Spike DOCX-imagens** (recomendação técnica): isolar o problema
  do `Pic` do docx-rs 0.4 conforme plano em §7. Esperar ~1 dia. Se
  o `docx-rs` não cooperar, considerar troca por `docx-rust` ou
  geração OPC manual. **Não bloqueia uso clínico do SICRO** porque o
  PDF — saída oficial — está OK.

**Prioridade média:**
- MVP 5: revisão dos `systemData` em massa (transitar
  `pending → reviewed → converted`).
- Painel "Evidências usadas" em uma sub-aba do Laudo, listando o
  conteúdo de `evidence_links` para inspeção / remoção.
- Inteligência mínima de detecção de evidência órfã (figure no
  `.sicrodoc` cujo `relative_path` não existe mais no workspace).
- Migrar a regeneração de tabelas para um botão "Atualizar a partir do
  Dossiê" mantendo a posição no documento.

---

## 9. Status final

✅ **APROVADO COM RESSALVA** — validação manual concluída em
2026-05-25.

Branch: `mvp/evidencias-no-laudo` → mergeada na `main` →
tag `v0.9.0-mvp4-evidencias-no-laudo`.

A ressalva (DOCX com imagens reais) está registrada em §7 e §8 como
trabalho técnico futuro, não bloqueante para o uso do MVP 4 em produção
restrita.
