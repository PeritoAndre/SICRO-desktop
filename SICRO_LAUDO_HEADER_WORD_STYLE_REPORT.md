# Relatório N — Cabeçalho Word-style no SICRO Laudo

**Data:** 2026-05-28
**Escopo:** N1 → N15 (refactor completo do sistema de cabeçalho do laudo)
**Status:** ✅ Implementação concluída, validações finais passando

---

## 1. Sumário executivo

O sistema de cabeçalho do SICRO Laudo foi completamente reescrito para
funcionar como uma **região editável independente** do corpo, no modelo
do Microsoft Word:

- O cabeçalho **não é mais** um parágrafo fixo no início do conteúdo.
- O cabeçalho **não é mais** um bloco institucional hardcoded com
  brasões + texto fixo em PNG.
- O cabeçalho **é agora** uma região própria do documento, com sua
  própria instância TipTap, seu próprio conteúdo persistido em
  `doc.header.content`, sua própria altura configurável, e
  replicação visual automática em todas as páginas.

O usuário ativa a edição do cabeçalho via **duplo clique** no topo de
qualquer página ou pelo botão de controle. Voltar ao corpo é feito com
**Esc** ou clicando em "Fechar cabeçalho".

A migração para docs antigos é automática e silenciosa: laudos legados
com `institutional_template` setado têm o conteúdo do cabeçalho semeado
a partir das `brand_lines` / `subtitle` / `metadata_fields` do template,
e ganham `header.enabled = true` na primeira abertura.

A exportação (HTML/PDF/DOCX) foi reescrita para consumir o conteúdo
dinâmico de `doc.header.content`. No DOCX, gera um Header nativo do
Word (não texto duplicado no body). No HTML/PDF, usa CSS `@page
running(...)` para repetir o cabeçalho automaticamente.

---

## 2. O que existia antes (demolido)

### 2.1 Componente `DocHeader` em `EditorPage.tsx`

Função React que renderizava uma faixa fixa institucional na primeira
página, lendo `template.header.brand_lines`, `subtitle` e
`metadata_fields` do `institutional_template`. Tinha lookups hardcoded
para brasões PNG (`brandImagePca`, `brandImageEstado`).

→ **Removido em N2**. JSX call + interface `DocHeaderProps` + função
completa (≈70 linhas). CSS associado em `EditorPage.module.css`
removido (`.docHeader`, `.docBrandRow`, `.brandImagePca`,
`.brandImageEstado`, `.brandLines`, `.brandLine`, `.docMeta`,
`.docMetaRow`).

### 2.2 Função `renderHeader()` em `renderer.ts`

Serializava o mesmo header institucional para HTML/PDF, usando
`generateHTML` indireto sobre os dados do template. Emite
`<header class="sicro-doc-header">` com brand_lines, metadata, brasões.

→ **Removido em N3**. Função (47 linhas) + bloco CSS de
`header.sicro-doc-header` (51 linhas) retirados. Import de
`resolveHeaderField` removido. Call site substituído por stub vazio
preservando assinatura pública.

### 2.3 Funções `build_institutional_chrome` / `pca_padrao_v1_chrome`
no walker DOCX

Em `src-tauri/src/exporters/docx.rs`. Injetavam 3 linhas hardcoded
(GOVERNO DO ESTADO DO AMAPÁ / POLÍCIA CIENTÍFICA / DEPTO
CRIMINALÍSTICA) + linha opcional "Laudo nº" no `Header::new()` nativo
do DOCX.

→ **Removido em N4**. `pca_padrao_v1_chrome` deletada (50 linhas).
`build_institutional_chrome` reduzida apenas para aplicar o Footer
(que está fora do escopo deste refactor). Teste de regressão em
`tests/docx_export.rs` adaptado para assertar **ausência** do header
hardcoded (`!has_header`).

---

## 3. Modelo de dados novo (schema 1.1.0 → 1.2.0)

Mudanças **aditivas**, sem quebrar `.sicrodoc` antigos.

### 3.1 Novos tipos em `schema.ts`

```ts
export interface SicroDocHeader {
  content: JSONContent;  // ProseMirror doc completo
  enabled: boolean;
}

// SicroDocLayout ganha:
header_height_cm?: number;  // clamped [0..6], default 2.5

// SicroDoc ganha:
header?: SicroDocHeader;
```

### 3.2 Constantes públicas

```ts
DEFAULT_HEADER_HEIGHT_CM = 2.5
HEADER_HEIGHT_MIN_CM = 0
HEADER_HEIGHT_MAX_CM = 6
```

### 3.3 Helpers de coerção

- `emptyHeaderContent()` — retorna `{ type: "doc", content: [{ type: "paragraph" }] }`
- `clampHeaderHeightCm(value)` — NaN/undefined → default; fora dos limites → clamp
- `coerceSicroDoc` adapta docs antigos: gera `header` com defaults seguros
  (enabled: false, content vazio) e clamp do `header_height_cm`.

### 3.4 Compatibilidade

| Doc origem | `header` no resultado |
|---|---|
| schema 1.0.0 (sem `header`) | `{ enabled: false, content: emptyHeader() }` |
| schema 1.1.0 (sem `header`) | mesmo |
| schema 1.2.0 com header completo | preservado |
| schema 1.2.0 com header parcial | campos faltantes default |

---

## 4. Estado de edição (`editingRegion`)

Adicionado em `laudoStore` (Zustand):

```ts
type EditingRegion = "body" | "header";
state: { editingRegion: EditingRegion }  // default "body"
action: setEditingRegion(region)  // UI-only, não persiste
action: setHeader(workspacePath, header)  // persiste no .sicrodoc
```

`clearCurrent` reseta para `body` ao fechar o laudo.

A transição **body → header** é disparada por:
- Duplo clique na região do cabeçalho (handler em `PageHeaderRegion`)
- Botão "Editar no editor" no painel "Cabeçalho" do Inspector

A transição **header → body** é disparada por:
- Tecla **Esc** (listener global em EditorPage quando em modo header)
- Botão "Fechar cabeçalho" da `HeaderToolbar`
- Botão "Desativar" da `HeaderToolbar` (também desliga `enabled`)

---

## 5. Instância TipTap separada (`useHeaderEditor`)

Hook em `src/modules/laudo/hooks/useHeaderEditor.ts`. Cria uma instância
TipTap dedicada ao cabeçalho com:

- Extensões reduzidas via `headerExtensions()` (sem pagination, sem
  comments, sem revisionMark, sem Figure/Storyboard/EvidenceTable/
  Quesito/Signature/CrossReference/DynamicLists/AutoNumbering/
  FieldPlaceholder/LaudoStyleAttribute).
- `editable = editingRegion === "header" && headerEnabled`.
- `onUpdate` repassa o JSON para o caller persistir (`onHeaderChange`).
- Sincronização externa: quando `initialContent` muda por algo que
  não foi este editor (undo de margem, abertura de outro laudo),
  aplica `setContent` com `emitUpdate: false` pra não disparar loop.

**Princípio:** o `body` (editor principal) e o `header` (este editor)
são instâncias TipTap **completamente independentes**. Não compartilham
ProseMirror state, não compartilham seleção, não compartilham
histórico. Atalhos de teclado dentro de cada um afetam APENAS aquele.
A seleção de texto não atravessa as regiões.

---

## 6. Componente `PageHeaderRegion`

Em `src/modules/laudo/components/PageHeaderRegion.tsx`. Renderizado
**uma vez por page card** dentro do `pageStack` do EditorPage.

| Estado | O que renderiza | Editável? |
|---|---|---|
| `enabled: false` | Faixa fina de 0.4cm no topo (hint pra ativar) | Não, mas dispara `onActivate` no double-click |
| `enabled: true`, modo `body` | Clone visual estático do `doc.header.content` (HTML rendered via `generateHTML`) | Não, mas dispara `onActivate` no double-click |
| `enabled: true`, modo `header`, **pg 1** | `<EditorContent editor={headerEditor}>` — editor real, interativo | **Sim** |
| `enabled: true`, modo `header`, **pg 2+** | Mesmo clone visual estático (que reflete edições em tempo real, porque o `headerHtml` é recomputado pelo pai a cada update) | Não |

**Visual:**
- Em modo body: borda inferior tracejada cinza, hint "Clique duas
  vezes para editar o cabeçalho" só aparece no hover.
- Em modo header: borda inferior sólida azul, fundo levemente
  azulado, shadow externo azul claro, badge "Editando cabeçalho ·
  aplicado a todas as páginas" no canto superior direito da pg 1.

**Posicionamento:** absoluto, dentro do `pageStack`, alinhado com o
`top` de cada page card. Altura = `headerHeightCm`. Padding lateral =
margens horizontais do laudo. Vive **dentro da margem superior** (igual
ao Word) — não consome área útil adicional.

---

## 7. Toolbar do cabeçalho (`HeaderToolbar`)

Em `src/modules/laudo/components/HeaderToolbar.tsx`. Barra sticky
flutuante no topo do scroll container do editor. **Visível apenas
quando `editingRegion === "header"` E `headerEnabled === true`**.

Controles:
- **Título** "Editando cabeçalho · aplicado em todas as páginas"
- **Altura** (input numérico em cm, 0–6, step 0.1) +
  **presets** (1.5 / 2.0 / 2.5 / 3.0 / 4.0)
- Indicador "(máx X — margem)" quando `header_height > margin.top`
  está sendo forçado pelo hardcap
- Botão **Desativar** (deixa enabled=false e fecha o modo)
- Botão **Fechar cabeçalho** (só fecha o modo, mantém ativo)

A altura é clampada pela schema (`clampHeaderHeightCm`) E pelo
`maxAllowedHeightCm = margins.top` (o cabeçalho vive dentro da
margem superior — não pode ultrapassá-la).

---

## 8. Decisão arquitetural — header dentro da margem superior

Optei por colocar o cabeçalho **dentro da margem superior** (modelo
Word), em vez de "subtrair header_height da área útil do body".

**Vantagem 1:** a paginação não precisa mudar. O motor de paginação
real (`computePaginationDecos` em `pagination/Pagination.ts`) continua
usando `marginTopCm` para o spacer inicial — sem necessidade de passar
`headerHeightCm` como nova opção. Toda a estabilidade conquistada nos
fixes M4–M8 fica intacta.

**Vantagem 2:** o usuário não tem surpresas. Aumentar o cabeçalho
**não desloca** o corpo do laudo se a margem superior for grande o
suficiente — exatamente como no Word.

**Restrição:** o `header_height_cm` é clampado pelo `margins.top`
atual. Se o usuário reduzir `margins.top` abaixo do
`header_height_cm` salvo, a renderização usa `min(header_height,
margins.top)` automaticamente (o valor salvo não é alterado, pra
restaurar quando a margem voltar). A `HeaderToolbar` também aplica o
mesmo cap interativamente.

---

## 9. Migração de docs legados (N12)

Em `laudoStore.openLaudo`. Quando o doc carregado satisfaz:
- `layout.institutional_template` está setado, **E**
- `header.content` está vazio (stub default ou só whitespace)

…a migração roda automaticamente:

1. Resolve o template via `findInstitutionalTemplate(...)`.
2. Chama `seedHeaderContentFromInstitutionalTemplate(template, metadata, null)`
   que gera um ProseMirror doc com:
   - 1 parágrafo centralizado em **negrito** por brand_line
   - Subtitle em itálico (se houver)
   - 1 parágrafo com metadata em linha única, separada por " · ",
     pulando campos vazios
3. Seta `header.enabled = true` + `header.content = seeded`.
4. Persiste via `commands.saveLaudo` antes de exibir.

Próximas aberturas do mesmo doc pulam a branch (`header.content` já
tem conteúdo). Se a persistência falhar (sem permissão de write),
mantém em memória sem persistir — não bloqueia abertura.

O `Occurrence` não está disponível no `openLaudo` (vive em
`workspaceStore`), então campos do header que dependem dele (ex:
`occurrence.numero_bo`) ficam ausentes na migração inicial. O
usuário pode preencher manualmente depois.

---

## 10. Exportação HTML/PDF (N10)

Em `renderer.ts`:

### 10.1 Função `renderDynamicHeader(doc)`

```ts
function renderDynamicHeader(doc: SicroDoc): string {
  if (!doc.header || !doc.header.enabled) return "";
  if (!hasMeaningfulHeaderContent(doc.header.content)) return "";
  const inner = generateHTML(doc.header.content, headerExtensions());
  return `<header class="sicro-doc-page-header" style="--sicro-header-height:${heightCm}cm">${inner}</header>`;
}
```

- Usa **as mesmas `headerExtensions()`** do editor interativo — fidelidade
  pixel-perfect entre WYSIWYG e export.
- Filtra **conteúdo vazio** via `hasMeaningfulHeaderContent` (walk
  recursivo da árvore ProseMirror procurando texto não-whitespace ou
  imagem) — evita banda em branco no PDF.

### 10.2 CSS injetado em `pageStyles`

```css
header.sicro-doc-page-header {
  position: running(sicroHeader);
  width: 100%;
  height: var(--sicro-header-height, 2.5cm);
  ...
}
@page {
  @top-center {
    content: element(sicroHeader);
  }
}
```

A regra `position: running(sicroHeader)` + `@page @top-center` faz com
que o cabeçalho seja **automaticamente repetido em todas as páginas**
quando o Edge headless renderiza o PDF — sem precisar duplicar markup.

Para HTML preview (uma única página contínua), o header aparece uma
vez no topo do body.

---

## 11. Exportação DOCX (N11)

Em `src-tauri/src/exporters/docx.rs`:

### 11.1 Função `build_dynamic_header(envelope) -> Option<Header>`

- Retorna `None` quando: envelope sem `header`, ou `enabled === false`,
  ou content "trivialmente vazio" (só 1 parágrafo sem children).
- Caso contrário, monta `Header::new()` iterando os blocos top-level
  do `header.content.content` e convertendo cada um via as **mesmas
  funções** que o walker do body usa (`paragraph_from_inline`,
  `heading_paragraph`).
- Fallback defensivo (`fallback_paragraph`) para qualquer node de
  schema futuro não tratado explicitamente.

### 11.2 Aplicação no walker principal

```rust
let mut docx = build_institutional_chrome(...);  // só footer
if let Some(header) = build_dynamic_header(envelope) {
    docx = docx.header(header);
}
```

Resultado: Word abre o DOCX com **Header nativo** (Header part XML
real, não texto duplicado no body). Funciona em Word desktop,
LibreOffice e Office Mobile.

---

## 12. Inspector — painel "Cabeçalho" (N13)

Em `Inspector.tsx`, função `HeaderPanel`:

- Bloco novo no topo "Cabeçalho Word-style":
  - Linha **Status**: badge "Ativado" (verde) ou "Desativado" (cinza)
  - Linha **Altura**: valor atual em cm (ex: "2.5 cm")
  - Botões **Ativar/Desativar** e **Editar no editor**
  - Hint: "Conteúdo do cabeçalho aplica em **todas as páginas**.
    Para editar o texto, dê duplo clique no topo de qualquer página."
- Subseção "Metadados do laudo (usados pelos campos automáticos)"
  com os campos legados `numero_laudo` e `setor` (preservados pra
  alimentar `{{numero_laudo}}`, `{{setor}}` em campos automáticos
  futuros).
- Subseção read-only "Do registro da ocorrência" inalterada.

---

## 13. Testes adicionados (N14)

Em `src/modules/laudo/document-engine/__tests__/header.test.ts`:

| # | Teste | O que verifica |
|---|---|---|
| 1 | doc legado sem `header` recebe defaults | coerce produz enabled=false + content vazio |
| 2 | doc legado sem `header_height_cm` recebe default | layout.header_height_cm = 2.5 |
| 3 | doc com header completo é preservado | round-trip sem perda |
| 4 | `clampHeaderHeightCm` clampa fora dos limites | -5 → 0, 100 → 6, NaN → 2.5, "x" → 2.5 |
| 5 | seed migra brand_lines em negrito centralizadas | structure correta |
| 6 | seed inclui metadata.numero_laudo na linha | "Laudo nº: 999/2026" aparece |
| 7 | seed retorna doc vazio quando template sem dados | edge case |
| 8 | renderer emite faixa quando enabled=true + conteúdo | tag `<header class="sicro-doc-page-header">` presente |
| 9 | renderer NÃO emite faixa quando enabled=false | tag ausente, conteúdo do header também ausente |
| 10 | renderer NÃO emite faixa para empty stub | evita banda branca no PDF |
| 11 | doc sem header continua exportando body | body intacto |

**11/11 passam.**

---

## 14. Validações finais

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ limpo |
| `pnpm test` | ✅ **985/985** (48 files; +11 do header.test.ts) |
| `pnpm build` | ✅ artefatos gerados, gzip OK |
| `cargo check` | ✅ limpo |
| `cargo test` (root) | ✅ 5/5 (importer_t) |
| `cargo test --test docx_export` | ✅ 6/6 (incluindo regressão "sem header hardcoded") |

---

## 15. Arquivos novos

```
src/modules/laudo/document-engine/header-extensions.ts        (N6)
src/modules/laudo/document-engine/__tests__/header.test.ts    (N14)
src/modules/laudo/hooks/useHeaderEditor.ts                    (N6)
src/modules/laudo/components/PageHeaderRegion.tsx             (N7)
src/modules/laudo/components/PageHeaderRegion.module.css      (N7)
src/modules/laudo/components/HeaderToolbar.tsx                (N8)
src/modules/laudo/components/HeaderToolbar.module.css         (N8)
SICRO_LAUDO_HEADER_WORD_STYLE_REPORT.md                       (este)
```

## 16. Arquivos modificados

```
src/modules/laudo/document-engine/schema.ts                   (N1)
src/modules/laudo/document-engine/index.ts                    (N1, N6, N12)
src/modules/laudo/document-engine/renderer.ts                 (N3, N10)
src/modules/laudo/document-engine/institutional-templates.ts  (N12)
src/modules/laudo/components/EditorPage.tsx                   (N2, N7, N8, N9)
src/modules/laudo/components/EditorPage.module.css            (N2)
src/modules/laudo/components/Inspector.tsx                    (N13)
src/modules/laudo/components/Inspector.module.css             (N13)
src/modules/laudo/store/laudoStore.ts                         (N5, N12)
src/modules/laudo/views/LaudoEditorView.tsx                   (N7)
src-tauri/src/exporters/docx.rs                               (N4, N11)
src-tauri/tests/docx_export.rs                                (N4)
```

---

## 17. Critério de aprovação — checklist

| # | Requisito | Status |
|---|---|---|
| 1 | Cabeçalho antigo foi removido/substituído | ✅ N2/N3/N4 |
| 2 | Existe região de cabeçalho separada do body | ✅ `doc.header` separado de `doc.content` |
| 3 | Duplo clique no topo ativa edição do cabeçalho | ✅ `PageHeaderRegion.onDoubleClick → onActivate` |
| 4 | Botão superior permite ativar modo cabeçalho | ✅ HeaderPanel/"Editar no editor" + duplo clique |
| 5 | Botão/controle superior permite configurar altura | ✅ HeaderToolbar (input numérico + presets) |
| 6 | Conteúdo do header aparece em todas as páginas | ✅ PageHeaderRegion uma por pageCard + clone visual |
| 7 | Header e body são salvos separadamente | ✅ `doc.header` e `doc.content` independentes |
| 8 | Exportações respeitam o header | ✅ HTML/PDF via `renderDynamicHeader` + DOCX via `build_dynamic_header` |
| 9 | Documentos antigos não quebram | ✅ coerceSicroDoc + migração suave N12 |
| 10 | Não há duplicidade de cabeçalho | ✅ DocHeader removido, renderHeader() removido, pca_padrao_v1_chrome removido |

---

## 18. Limitações conhecidas (alpha)

- **Imagens no header**: o schema TipTap aceita Image nodes, mas a
  primeira release do cabeçalho dinâmico não tem UI dedicada para
  inserir uma imagem dentro do header. O caminho pra resolver: extender
  o pipeline de inserção de imagens externas (já existe pro body) pra
  reagir ao `editingRegion === "header"`.

- **Campos automáticos `{{var}}`**: removidos do `headerExtensions()`
  por enquanto. Se quiser ressuscitar, basta adicionar `FieldPlaceholder`
  à lista — não há acoplamento que impeça.

- **Migração N12 sem occurrence**: como o `openLaudo` não tem acesso
  ao `workspaceStore.activeOccurrence`, campos de metadata que
  dependem da ocorrência ficam ausentes no seed inicial. Workaround:
  o usuário ativa o header pela toolbar e edita à mão na primeira
  abertura do doc legado. Refinamento futuro: passar `occurrence`
  como argumento extra do `openLaudo`.

- **DOCX walker dos blocos do header**: suporta `paragraph` e
  `heading`. Tabelas e imagens caem no `fallback_paragraph` (extrai
  texto). Refinamento: estender `build_dynamic_header` para iterar
  table/image como o walker do body já faz.

- **Header_height vs margins.top**: quando `margins.top` é reduzido
  abaixo do `header_height_cm` salvo, a renderização usa o min
  automaticamente mas o valor salvo NÃO é alterado. Se o usuário
  achar isso confuso, alternativa seria escrever de volta o valor
  capado.

---

## 19. Como testar manualmente

1. Abrir o SICRO Laudo, criar um laudo novo (ou abrir um existente).
2. Dar duplo clique no topo da primeira página. → Modo header ativo,
   barra superior aparece, badge azul "Editando cabeçalho" visível.
3. Digitar "POLÍCIA CIENTÍFICA — LAUDO TÉCNICO". → Texto aparece nas
   réplicas das outras páginas em tempo real.
4. Mudar a altura via input numérico ou presets. → Faixa muda visualmente.
5. Pressionar **Esc**. → Volta pro body, badge some.
6. Digitar texto no corpo. → Confirma que body funciona normal.
7. Duplo clique no cabeçalho de novo. → Volta ao modo header
   preservando o conteúdo.
8. Botão **Desativar** na HeaderToolbar. → Header some, faixa fina
   discreta no topo aparece (alvo de double-click pra reativar).
9. Fechar o laudo, reabrir. → Conteúdo do cabeçalho preservado, modo
   inicial é body.
10. Exportar PDF. → Header aparece em **todas** as páginas.
11. Exportar DOCX, abrir no Word. → Header nativo do Word, edita pela
    UI do Word como qualquer header.
12. Confirmar que **não existe cabeçalho duplicado antigo**: não há
    brasão PNG fixo, não há linhas "GOVERNO DO ESTADO DO AMAPÁ" no
    body do laudo.

---

## 20. Próximos passos (não escopo deste ciclo)

- Adicionar suporte a inserir imagens dentro do header pela UI.
- Adicionar suporte a footer no mesmo modelo (separado, editável,
  configurável). O `Footer` do DOCX atualmente é hardcoded — seria
  uma extensão natural deste trabalho.
- Mostrar visualmente a linha do `margins.top` na régua vertical
  quando o cabeçalho está em modo edição, pra que o usuário veja
  exatamente onde o body começa.
- Refinar a HeaderToolbar pra ser dockable / colapsável.

---

**Implementação por:** Claude (Anthropic) via Claude Code
**Sessão:** N1–N15, contínua após estabilização da paginação M1–M8.
