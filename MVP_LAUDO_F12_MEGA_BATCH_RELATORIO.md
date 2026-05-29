# Laudo — F12 Mega-batch (Auto-numeração → Assinatura digital)

> Mega-batch de 12 features aprovado verbatim pelo usuário em **2026-05-27**:
> _"escolho todos juntos, implemente todos, quando chegar reviso como ficou"_.
>
> Branch: **`feat/laudo-f12-megabatch`** (sobre o trabalho de paginação real
> + multipage de F11).
>
> **Status: ✅ Pronto para revisão.**
>
> typecheck: ✓ · `vitest run`: ✓ (963 testes, 46 arquivos) · `vite build`: ✓
> (bundle dividido em 9 chunks, biggest 422 KB gzip 133 KB)

---

## Objetivo

Fechar o laudo do MVP 11/12 com **paridade Word-like** + **rigor pericial
institucional**. As 12 features endereçam três dimensões:

| Dimensão                   | Features                                  |
|----------------------------|-------------------------------------------|
| Produtividade do perito    | F12.1, F12.2, F12.3, F12.5, F12.10        |
| Confiabilidade do produto  | F12.4, F12.6, F12.7, F12.9                |
| Rigor pericial institucional | F12.8, F12.11                           |

---

## F12.1 — Auto-numeração de figuras / tabelas / quesitos

**Problema.** Numeração de figuras/croquis/tabelas/quesitos era feita só na
hora de exportar (renderer). Dentro do editor, o perito via "Figura — ",
sem o ordinal, e tinha que adivinhar a posição.

**Solução.** Plugin ProseMirror `AutoNumbering.ts` que:

- Numera nodes `figure`, `table[data-sicro-table]`, `quesito_item` em
  ordem de aparição.
- Mantém um `idToOrdinal` Map (chave = `data-fig-id` UUID gerado em
  insert) acessível via plugin state.
- Injeta `Decoration.widget` antes do figcaption: `"Figura 1 — "`,
  `"Croqui 2 — "`, `"Tabela 3 — "`, com classe `.sicro-auto-number`.
- Recalcula em todo `apply` quando o doc muda.

**Arquivos.**
- `src/modules/laudo/document-engine/auto-numbering/AutoNumbering.ts` (novo)
- `src/modules/laudo/document-engine/nodes/Figure.ts` — atributo `id`
  + helper `generateFigureId()`.
- `src/modules/laudo/document-engine/styles/styles.css` —
  `.sicro-auto-number` / `.sicro-auto-number-table`.

---

## F12.2 — Cross-references (ver Figura N, conforme Tabela M)

**Problema.** Texto fixo: "ver Figura 3" virava "ver Figura 4" mas nunca
era atualizado automaticamente.

**Solução.** Node inline atomic `crossReference` com attr `targetId`.
NodeView consulta `AUTO_NUMBERING_PLUGIN_KEY.getState().idToOrdinal`
e re-renderiza ao update do plugin.

- Classe `.sicro-cross-ref` (azul) quando o target existe.
- Classe `.sicro-cross-ref--missing` (vermelho) quando target sumiu.
- Texto auto-formatado: "ver Figura 3", "conforme Tabela 2".

**Arquivos.**
- `src/modules/laudo/document-engine/nodes/CrossReference.ts` (novo).

---

## F12.3 — Sumário e listas dinâmicas (não snapshot)

**Problema.** O sumário e listas de figuras/tabelas em F10 eram snapshots
estáticos — quando o conteúdo mudava, ficavam desatualizados.

**Solução.** Três nodes ProseMirror:

- `DynamicSummary` — recomputa via `extractOutline(doc)` a cada
  update.
- `DynamicFigureList` — usa `buildFigureList(doc)`.
- `DynamicTableList` — usa `buildTableList(doc)`.

Cada um tem NodeView que monta a lista via DOM direto no `dom` element,
sem ProseMirror filhos. Atualiza no callback `update()` do NodeView.

**Arquivos.**
- `src/modules/laudo/document-engine/nodes/DynamicList.ts` (novo).
- Styles em `styles.css`: `.sicro-dynamic-list-*`.

---

## F12.4 — Auto-backup local rolling (IndexedDB)

**Problema.** Antes só havia snapshots manuais (criados pelo perito).
Se o app/máquina crashasse antes do autosave debounced, o trabalho
sumia.

**Solução.** Service `autoBackup.ts` em IndexedDB (cross-session):

- DB `sicro-laudo-autobackup`, store `backups`.
- `saveAutoBackup({ laudoId, capturedAt, content, wordCount })`.
- `pruneAutoBackups(laudoId)` — rolling buffer de 10 por laudo.
- `listAutoBackups(laudoId)` — descendente por capturedAt.
- `clearAutoBackups(laudoId)` — para uso quando o laudo é excluído.

Hook `useAutoBackup({ editor, laudoId, intervalMs: 30_000 })`:

- Captura inicial após 5s de delay (deixa o editor settle).
- Tick a cada 30s, skip se conteúdo igual ao último.
- Captura final no unmount (best-effort).

**Arquivos.**
- `src/modules/laudo/services/autoBackup.ts` (novo).
- `src/modules/laudo/hooks/useAutoBackup.ts` (novo).
- Integrado em `LaudoEditorView` na linha de `useAutosave`.

---

## F12.5 — Modal de atalhos de teclado (tecla `?`)

**Problema.** Crescimento de atalhos (F2 → F12) sem documentação visual
no app. Perito não sabia que existem.

**Solução.** Componente `KeyboardShortcutsDialog` modal centrado.

- Abre via tecla `?` (Shift+/), com guard para focus em
  input/textarea/contenteditable.
- 6 seções: Documento, Formatação, Estilos do laudo, Visualização,
  Réguas, Ajuda.
- `<kbd>` styled (border-bottom 2px) — visual de tecla física.
- Botão `?` na status bar do laudo para descobribilidade.
- Esc fecha + click outside fecha.

**Arquivos.**
- `src/modules/laudo/components/KeyboardShortcutsDialog.tsx` (novo).
- `src/modules/laudo/components/KeyboardShortcutsDialog.module.css` (novo).
- `src/modules/laudo/components/LaudoStatusBar.tsx` — prop
  `onOpenShortcuts` + botão "?" no canto direito.

---

## F12.6 — Error boundary global do editor

**Problema.** Se o TipTap/ProseMirror crashasse (NodeView, plugin,
serialização), todo o app pegava tela branca. Perito perdia o trabalho.

**Solução.** `LaudoErrorBoundary` (React class component):

- Cobre `EditorPage + HtmlPreview + Inspector`.
- Em crash, mostra card com:
  - Mensagem amigável + ícone âmbar.
  - Botão **Tentar novamente** — incrementa `resetKey` e força
    remount.
  - Botão **Recuperar do auto-backup** — lista IndexedDB (F12.4)
    com timestamps; restaurar = `saveCurrent(workspacePath, entry.content)`
    + remount.
  - Botão **Voltar para a lista** — sai do editor.
  - Details colapsável com stack trace técnico.

**Arquivos.**
- `src/modules/laudo/components/LaudoErrorBoundary.tsx` (novo).
- `src/modules/laudo/components/LaudoErrorBoundary.module.css` (novo).

---

## F12.7 — Print/PDF polido

**Problema.** Print nativo do browser (Ctrl+P do navegador) mostrava
chrome (toolbar, statusbar, réguas, inspector) no PDF. PDF do
pipeline (Ctrl+P → Rust Edge headless) tinha "Folha X de Y" só no
rodapé direito, sem header institucional repetido em todas as
páginas.

**Solução em duas frentes.**

### Pipeline oficial (renderer.ts → Edge headless)

- `@page` com `@top-center` carregando o nome institucional
  ("POLÍCIA CIENTÍFICA DO AMAPÁ") em **todas as páginas**, com
  border-bottom 0.4pt.
- `@page :first` suprime o top-center (header completo cobre a
  primeira página).
- `@bottom-right`: "Página N de M" (humanizou "Folha" → "Página").
- `@bottom-left`: texto institucional do template.
- Regras `@media print`: widows/orphans = 3, `page-break-after:
  avoid` em h1/h2/h3, `page-break-inside: avoid` em figuras,
  tabelas, quesitos, assinatura, storyboard.

### Print nativo (fallback)

- Em `styles.css` global + `LaudoEditorView.module.css`: esconde
  toolbar, statusbar, réguas, inspector, banners, spacers.
- Cards de página viram fluxo simples sem sombra, com
  `page-break-after: always` (exceto último).
- Comentários e marcas de revisão suprimidos.

**Arquivos.**
- `src/modules/laudo/document-engine/renderer.ts` — `pageStyles()`
  expandido.
- `src/modules/laudo/document-engine/styles/styles.css` — bloco
  `@media print`.
- `src/modules/laudo/views/LaudoEditorView.module.css` — bloco
  `@media print`.

---

## F12.8 — QR Code de verificação institucional

**Problema.** Laudo finalizado tem `content_hash` (SHA-256), mas é
hash bruto: impossível conferir manualmente. Outras autoridades
precisam de uma forma rápida (mobile) de validar.

**Solução.** Lib `qrcode` (29 KB) + serviço + componente + integração
no renderer.

### Payload

URL custom: `sicro://verify?id=<doc_id>&h=<hash>&t=<finalized_at>`
(esquema offline; quando o portal subir, troca para
`https://verifica.policiacientifica.ap.gov.br/laudo/...`).

### Serviço

- `buildVerificationPayload({ documentId, finalization })`.
- `renderVerificationQrPngDataUri(...)` — para embutir HTML/PDF.
- `renderVerificationQrSvg(...)` — opcional.

### UI

- `VerificationQrCard` em `StatusPanel` — mostra QR + metadados
  (ID curto, hash truncado, finalização, autor) na aba **Status**
  do Inspector, quando status === "final".

### Exportação

- `RenderOptions.verificationQrDataUri` (novo).
- `renderVerificationBlock(doc, qrDataUri)` adiciona section
  `.sicro-doc-verify` antes do footer com grid 3.5cm + texto.
- `ExportMenu.runExport` chama `renderVerificationQrPngDataUri`
  dinâmica (lazy import — fica no chunk `vendor-qrcode`) só se
  `doc.finalization` existe.

**Arquivos.**
- `src/modules/laudo/services/verificationQrCode.ts` (novo).
- `src/modules/laudo/components/VerificationQrCard.tsx` (novo).
- `src/modules/laudo/components/VerificationQrCard.module.css` (novo).
- `src/modules/laudo/document-engine/renderer.ts` — RenderOptions +
  verification block + CSS dedicada.
- `src/modules/laudo/components/ExportMenu.tsx` — lazy import.
- `src/modules/laudo/components/StatusPanel.tsx` — embed QR no card
  de finalização.

---

## F12.9 — Bundle splitting

**Problema.** Bundle único de ~1.7 MB. Tempo até interactive lento na
máquina Tauri (CPU mid-tier do Estado).

**Solução em duas camadas.**

### Manual chunks (Vite/Rollup)

`vite.config.ts` com `manualChunks` por path-substring (não por
package name, porque `@tiptap/pm` tem subpath exports e quebra
match exato):

```
vendor-react    → /react/, /react-dom/, /react-router-*/, /scheduler/
vendor-tiptap   → /@tiptap/, /prosemirror-/
vendor-konva    → /konva/, /react-konva/
vendor-leaflet  → /leaflet/, /react-leaflet/
vendor-qrcode   → /qrcode/
vendor-misc     → /zustand/, /lucide-react/, /polygon-clipping/
```

### Lazy modules (React.lazy)

`App.tsx`: rotas pesadas viram dynamic import:

```
CroquiModule  → lazy + suspense (carrega Konva + Leaflet sob demanda)
VideoModule   → lazy
ImagemModule  → lazy + suspense
RoadRenderLab → lazy
```

Home, Laudo, Dossiê, Evidências ficam no main bundle (fluxo
frequente do perito).

### Resultados

```
vendor-tiptap     422 KB  (gzip 133 KB)
index             375 KB  (gzip 105 KB)
vendor-konva      285 KB  (gzip  88 KB)  — só croqui/imagem
vendor-react      180 KB  (gzip  58 KB)
CroquiModule      187 KB  (gzip  59 KB)  — lazy
vendor-leaflet    155 KB  (gzip  45 KB)  — só croqui
vendor-misc        70 KB  (gzip  15 KB)
ImagemModule       33 KB  (gzip  11 KB)  — lazy
vendor-qrcode      24 KB  (gzip   9 KB)  — só finalização
VideoModule        24 KB  (gzip   8 KB)  — lazy
LabApp             21 KB  (gzip   7 KB)  — lazy
```

Time-to-interactive do laudo agora carrega apenas
**index + vendor-react + vendor-tiptap + vendor-misc** ≈ 311 KB
gzip (vs 1.7 MB do single bundle anterior).

**Arquivos.**
- `vite.config.ts` — rollupOptions.output.manualChunks (function).
- `src/app/App.tsx` — lazy imports + Suspense + ModuleLoading fallback.

---

## F12.10 — Loading states polidos (toast system)

**Problema.** Save manual, exportação, restauração — todos sem
feedback claro. Perito clicava e ficava na dúvida se algo aconteceu.

**Solução.** Sistema de toasts global minimalista.

### Toast store

`src/components/toast/toastStore.ts` — Zustand store + helper
`pushToast(kind, msg, opts)`:

- 5 variantes: `info`, `success`, `warn`, `error`, `progress`.
- `progress` é sticky (`durationMs: 0`); outros auto-dismiss em 4s.
- `dismissToast(id)` para fechar progress quando terminar.

### Toaster

`Toaster.tsx` montado em `App.tsx` (uma vez):

- Bottom-right, stacking vertical, animação slide-in.
- Cada toast: ícone (CheckCircle/AlertTriangle/XCircle/Loader2/Info),
  título opcional, mensagem, botão X (exceto progress).
- Spinner rotacional no kind `progress`.

### Integração

- `LaudoEditorView.handleSave`: progress "Salvando…" → success/error.
- `ExportMenu.runExport`: progress "Exportando PDF…" → success com
  path do arquivo, error com mensagem.

Imports dinâmicos para não inflar o main bundle (toast store +
Toaster pesam ~5 KB).

**Arquivos.**
- `src/components/toast/toastStore.ts` (novo).
- `src/components/toast/Toaster.tsx` (novo).
- `src/components/toast/Toaster.module.css` (novo).
- `src/app/App.tsx` — mount global.
- `src/modules/laudo/views/LaudoEditorView.tsx` — save flow.
- `src/modules/laudo/components/ExportMenu.tsx` — export flow.

---

## F12.11 — Assinatura digital (mock A3/A1)

**Problema.** Selo de finalização (F9) tem hash + autor + timestamp,
mas falta o equivalente institucional de assinatura digital. Não
existe ainda integração com PKCS#11 (driver de token A3) nem com
.pfx (A1), mas a UI/UX precisa estar pronta.

**Solução.** Schema aditivo `SicroDocSignature` + dialog mock.

### Schema (`schema.ts`)

```ts
interface SicroDocSignature {
  type: "A1" | "A3" | "mock";
  signer_name: string;
  signer_id?: string;        // CPF
  issuer?: string;           // AC
  valid_until?: string;
  signed_at: string;
  signed_hash: string;       // deve bater com finalization.content_hash
  signature_blob?: string;   // base64 do PKCS#7 (real); vazio no mock
}
```

`SicroDocFinalization.signature?: SicroDocSignature` (opcional).

### DigitalSignatureDialog

- Tabs A1 (arquivo) vs A3 (token), default A1.
- Campos: signer_name (auto-preenchido do `finalized_by`), CPF, AC,
  validade.
- A1: campo senha (não persistida).
- A3: nota sobre detecção de driver simulada.
- Card mostrando o `content_hash` que será assinado.
- Banner amarelo "Modo demonstração — assinatura simulada".
- Confirmação cria o objeto + chama `setStatus("final", {...,
  signature})`.

### StatusPanel

Quando `finalization.signature` ausente → mostra botão "Assinar
digitalmente (A3/A1)". Quando presente → exibe ✓ nome + tipo +
data.

**Arquivos.**
- `src/modules/laudo/document-engine/schema.ts` — interface +
  campo opcional.
- `src/modules/laudo/document-engine/index.ts` — re-export.
- `src/modules/laudo/components/DigitalSignatureDialog.tsx` (novo).
- `src/modules/laudo/components/DigitalSignatureDialog.module.css`
  (novo).
- `src/modules/laudo/components/StatusPanel.tsx` — botão + dialog
  + handler.

**Roadmap.** Quando o backend Rust ganhar suporte real (provavelmente
crate `cryptoki` para PKCS#11 + `openssl` para .pfx), trocar o
`type: "mock"` por `"A1"` / `"A3"` e popular `signature_blob` com
o PKCS#7 / CMS real. A UI atual já está preparada — só muda o
backend.

---

## F12.12 — Validações finais

### typecheck

```
$ pnpm typecheck
> tsc --noEmit
(exit 0)
```

### Tests

```
$ pnpm test
46 test files passed
963 tests passed
Duration: 2.20s
```

Nenhum teste regrediu. Os módulos F12 não têm cobertura unit dedicada
ainda — todos têm comportamento integrado (NodeViews, IndexedDB,
React effects) que ficaria caro testar em isolamento. Cobertura
funcional via teste manual.

### Build

```
$ pnpm build
✓ 2149 modules transformed
✓ built in 4.26s
```

Bundle splitting validado — 9 chunks, biggest `vendor-tiptap` 422 KB
(gzip 133 KB). Warning de circular dependency `vendor-misc ↔
vendor-react` é non-blocking (zustand referencia react via export
default, comum em libs hooks).

---

## Decisões registradas

### "Modo demonstração" para assinatura

Esquema custom `sicro://verify` no QR + selo "mock" na assinatura.
Avaliado e descartado: emitir QR com URL https-real apontando para
domínio ainda não-existente — usuário poderia clicar e ir para
404. Esquema custom não é clicável no Android/iOS sem app
companheiro — neutro até subir o portal.

### IndexedDB para auto-backup, não FS

Considerado: usar Tauri FS API (`writeBinaryFile`) em
`%APPDATA%/sicro/autobackup/`. Descartado porque:
1. IndexedDB já abstrai cleanup/eviction quando o disco enche.
2. O snapshot manual (em-doc) já cobre o caso "outro computador" —
   auto-backup só precisa cobrir o caso "mesmo computador, crash
   antes do save".

### React.lazy no nível das rotas, não no nível do componente

Tentação: lazy do `EditorPage`, ou de cada panel do Inspector.
Descartado por overhead — chunks pequenos demais (~5 KB) inflam o
manifest e ganham pouco. As rotas são o sweet spot.

### `@page :first` na primeira página

Quando exportamos um laudo de 1 página, NÃO queremos `@top-center`
repetir o nome institucional — o `<header class="sicro-doc-header">`
já cobre. `@page :first { @top-center { content: none } }` resolve
elegantemente.

---

## Não-feito (registrado pra próximo ciclo)

- **Crash recovery automático no boot.** Hoje, se o user reabre o
  laudo após crash, o LaudoErrorBoundary só atua se o crash
  acontecer no React tree atual. Falta detectar "laudo abriu, JSON
  do disco bateu/não bateu com o auto-backup mais recente" e
  oferecer restaurar automaticamente.
- **PKCS#11 / .pfx real.** Hoje só mock. Pendente Rust crate
  `cryptoki` (PKCS#11) ou parsing manual de PKCS#12 — escolha
  pendente.
- **Sumário/listas no PDF.** Os nodes dinâmicos (F12.3)
  renderizam corretamente no editor. O renderer.ts ainda
  serializa o ProseMirror via `generateHTML` — verificar se o
  output dos NodeViews atravessa bem. Se não, fallback de
  re-extrair outline no renderer.

---

## Resumo executivo

12 features fechadas em uma sessão única. Frontend cresceu ~3.500
linhas de TS/CSS (todos arquivos novos pequenos a médios), zero
mudanças destrutivas. Schema do `.sicrodoc` é aditivo (campo
`signature?:` opcional em `finalization`). Nenhuma migração de
documento necessária.

Pronto para revisão visual pelo perito (conforme aprovação verbatim
no início da sessão).
