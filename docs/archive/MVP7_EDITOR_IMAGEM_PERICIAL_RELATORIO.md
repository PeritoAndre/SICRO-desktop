# MVP 7 — Editor de Imagem Pericial

**Branch:** `mvp/editor-imagem-pericial`
**Data:** 2026-05-25
**Status final:** ✅ **APROVADO** em validação manual

---

## 1. Decisão arquitetural

Arquitetura **híbrida** confirmada conforme briefing:

- **Frontend** React + **Konva** (mesma stack do Croqui) para
  visualização, pan/zoom, anotações editáveis e camadas.
- **Backend** Rust + crate **`image` 0.25** (pure-Rust, sem
  dependência de sistema) para operações reais de processamento e
  exportação dos derivados.
- **`.sicroimage`** JSON estruturado é a fonte da verdade da sessão.
  PNG/JPG exportados são derivados, registrados em `image_exports`,
  com sidecar JSON técnico e SHA-256.
- **Ajustes visuais** (brilho/contraste/gamma/saturação/grayscale/
  invert) são aplicados em **CSS filter** no canvas para preview ao
  vivo (zero custo) e reaplicados pelo backend `image` crate para
  produzir bytes destrutivos reproduzíveis ao exportar.

**O original NUNCA é modificado.** Toda operação que precise alterar
pixels gera um arquivo novo em `imagens/exports/<slug>_<timestamp>_<id8>.png`
com sidecar JSON em `imagens/exports/<...>_sidecar.json` contendo:
software, versão, timestamp, ids, hashes, ajustes, operações,
dimensões, escala.

---

## 2. O que foi implementado

### Backend Rust
- **Migration `009_image_analyses.sql`** — 3 tabelas (image_analyses,
  image_exports, image_operation_logs) com índices.
- **Models** (`models/image_analysis.rs`): `ImageAnalysis`,
  `ImageExport`, `ImageOperationLog`, `ImageSourceKind`,
  `CreateImageAnalysisInput`, `ImportLocalImageInput`,
  `ExportImageInput`, `BackendAdjustments`, `BackendOperation`,
  `ImageMetadata`, `ImageAssetBytes`.
- **Repositório** (`database/repositories/image_analysis_repo.rs`):
  insert/list_by_occurrence/find_by_id/touch_updated/insert_export/
  list_exports_by_occurrence/insert_log/list_logs_for_analysis.
- **Módulo `image_editor/`**:
  - `processor.rs` — aplica brilho/contraste/gamma/saturação/grayscale/
    invert via pixel ops (8 testes), rotate 90 CW/CCW/180, flip H/V,
    crop seguro com clamp, resize Lanczos3.
  - `metadata.rs` — lê dimensões/mime/tamanho sem decodificar a imagem
    inteira; opcional SHA-256.
  - `pipeline.rs` — orquestra export: carrega original OU usa PNG
    composto pelo frontend, aplica ajustes opcionais e operações,
    grava em `imagens/exports/` + sidecar JSON + retorna
    `ExportArtifact`.
- **9 Tauri commands** (`commands/image_commands.rs`):
  `create_image_analysis_from_evidence`,
  `create_image_analysis_from_file`,
  `list_image_analyses`, `read_image_analysis`,
  `save_image_analysis`, `export_image_derivative`,
  `read_image_asset`, `get_image_metadata`,
  `list_image_operation_logs`.
- **Path safety** reutiliza o helper compartilhado do MVP 5
  (`sanitize_relative_path` / `resolve_workspace_relative`).
- **Audit log** em `occurrence_audit` para criação e exportação
  (`image.analysis_created`, `image.exported`).
- **Registry (MVP 5) integrado**: `EvidenceKind` ganhou `ImageAnalysis`
  e `ImageExport`; aggregator emite ambos os items;
  `RegistrySummary` ganhou `image_analyses` / `image_exports`. Nada
  da Central precisou ser refatorado — só estendido aditivamente.

### Frontend (TypeScript / React)
- **Tipos espelho** (`src/types/image_analysis.ts`).
- **Engine** (`src/modules/imagem/engine/`):
  - `schema.ts` — `SicroImageDoc`, `SicroImageCanvas`, `SicroImageSource`,
    `SicroImageLayer`, `SicroImageScale`, `SicroAnnotation`
    (discriminated union via `kind`).
  - `serializer.ts` — `coerceSicroImage`/`serializeSicroImage` com
    defaults sãos. 6 testes.
  - `factories.ts` — 9 factories de anotação. 9 testes.
- **Commands TS** (`src/core/commands.ts`) — 9 wrappers.
- **Store** (`src/modules/imagem/store/imagemStore.ts`) — Zustand:
  list, createFromEvidence, createFromFile, openAnalysis, saveActive,
  clearActive.
- **Módulo Imagem** (`src/modules/imagem/ImagemModule.tsx`):
  - Lista de análises (grid de cards com thumbnail);
  - Botão "Nova análise" abre `SourcePicker` com 3 abas:
    Dossiê (fotos), Frames de vídeo, Arquivo local.
- **`ImageEditor`** (`src/modules/imagem/editor/ImageEditor.tsx`):
  - **Top bar**: voltar + título editável + Salvar + Exportar.
  - **Toolbar lateral** (12 ferramentas): selecionar (V), pan (H),
    seta, linha, retângulo, elipse, texto, marcador numerado,
    medida, definir escala, tarja.
  - **Canvas Konva** com imagem base + camada de anotações +
    transformer + preview two-click + pan/zoom (scroll = zoom).
  - **CSS filter** aplica ajustes em preview real-time.
  - **Painel direito** com 5 abas:
    - Camadas (visibilidade toggle);
    - **Ajustes** (sliders Brilho/Contraste/Gamma/Saturação +
      checkboxes Grayscale/Inverter + Reset);
    - Anotações (lista com visibilidade + delete);
    - Histórico (carrega `list_image_operation_logs`);
    - Metadados (origem, caminho, mime, dimensões, hash, escala).
  - **Status bar inferior**: ferramenta, x/y, zoom, tamanho original,
    escala, # anotações, SHA-256 abreviado, feedback.
  - **Atalhos**: Esc, V, H, Del, Ctrl+S.
- **ActivityRail + App routing**: novo item "Imagem" (ícone `ImagePlus`),
  rota `/imagem` (alias `/imagens` redireciona).

---

## 3. O que ficou como placeholder / futuro

Conforme briefing — **NÃO** tentar recriar Peritus inteiro agora:

- ❌ **FFT / Wavelets** — fora do escopo, sem placeholder.
- ❌ **Autenticação forense profunda** — apenas hash + dimensões + EXIF
  (EXIF deixado para spike próprio).
- ❌ **Detecção de manipulação** — fora do escopo.
- ❌ **Detecção de bordas (Sobel/Canny/Laplaciano)** — registrado como
  futuro. A arquitetura do `BackendOperation` enum aceita adição
  aditiva quando implementarmos.
- ❌ **Desfoque gaussiano / mediana / nlmeans / Kuwahara / CLAHE** —
  futuro, mesmo enum aditivo.
- ❌ **Equalização de histograma** — futuro.
- ❌ **Mini-navegador / preview thumbnail** — substituído pelo aspecto
  fit-to-screen automático ao abrir.
- ❌ **Régua visual no canvas** — coordenadas do cursor aparecem no
  status bar; régua gráfica fica para iteração futura.
- ❌ **Botão "Inserir no Laudo direto"** — o derivado aparece
  automaticamente na Central de Evidências e no painel Evidências do
  Laudo via aba "Imagem derivada" do MVP 4 (registrado por kind
  `image_export` no registry).
- ❌ **Operações geométricas a partir do toolbar** (rotate/flip via
  botão) — o **backend** suporta via `BackendOperation`, mas a UI do
  MVP 7 não expõe ainda. Implementar é trivial — adicionar botões ao
  toolbar que despachem ao export pipeline. Documentado como próximo
  spike.

---

## 4. Formato `.sicroimage` (schema_version "0.1")

```json
{
  "schema_version": "0.1",
  "image_analysis_id": "...",
  "occurrence_id": "...",
  "title": "...",
  "source": {
    "kind": "photo|video_frame|evidence|local_import",
    "source_id": "...",
    "original_relative_path": "...",
    "original_hash_sha256": "...",
    "mime_type": "...",
    "width": 0, "height": 0, "size_bytes": 0
  },
  "canvas": { "zoom": 1, "pan_x": 0, "pan_y": 0, "rotation": 0,
              "background_color": "#1f2933" },
  "view_adjustments": {
    "brightness": 0, "contrast": 0, "exposure": 0, "gamma": 1,
    "saturation": 0, "grayscale": false, "invert": false
  },
  "processing_stack": [],   // reservado p/ Sobel/CLAHE/etc futuros
  "layers": [
    { "id": "layer_base", "kind": "image_base", ... },
    { "id": "layer_annotations", "kind": "annotations", ... }
  ],
  "annotations": [
    {
      "id": "...", "kind": "arrow|line|rect|ellipse|text|numbered_marker|point|measurement|redaction",
      "x": 0, "y": 0, "x2": 0, "y2": 0, "width": 0, "height": 0,
      "text": "...", "number": 0,
      "stroke": "#...", "fill": "#...", "stroke_width": 2,
      "opacity": 1, "visible": true, "locked": false,
      "label": null, "notes": null,
      "created_at": "..."
    }
  ],
  "measurements": [],   // reservado p/ medidas separadas
  "scale": null | { "px_per_unit": ..., "unit": "m|cm|mm",
                    "calibrated_by": [...], "calibration_real_distance": ... },
  "exports": [],
  "created_at": "...", "updated_at": "..."
}
```

---

## 5. Operações suportadas

### Frontend (preview + edição não destrutiva)
- Brilho / Contraste / Gamma / Saturação (sliders).
- Tons de cinza, Inverter (checkbox).
- Pan / Zoom (scroll, pan tool).
- Fit-to-screen automático ao abrir.
- 9 tipos de anotação: arrow / line / rect / ellipse / text /
  numbered_marker / point / measurement / redaction.
- Definir escala (2 cliques + valor real em metros).

### Backend (export destrutivo, reproduzível)
- Brilho, contraste, gamma, saturação, grayscale, invert (mesma
  fórmula que o preview, aplicada via `image` crate em RGBA).
- Rotate 90 CW / 90 CCW / 180.
- Flip H / Flip V.
- Crop seguro (clamp ao tamanho real).
- Resize Lanczos3.
- *Estes não estão expostos no toolbar do MVP 7, mas estão
  disponíveis via `BackendOperation` no command — futuro spike de UI.*
- Geração do **sidecar JSON** com tudo registrado.

---

## 6. Integração com Laudo e Central de Evidências

### Central de Evidências (MVP 5)
- `EvidenceKind` ganhou dois novos valores: `image_analysis` e
  `image_export`.
- `aggregator` emite as duas linhas com origem `image_editor`.
- Verificação leve do MVP 5 detecta arquivo ausente do `.sicroimage`
  ou do PNG derivado.
- Verificação profunda (botão) recomputa o SHA-256 do PNG e compara
  com o registrado em `image_exports.hash_sha256`.
- Resumo da Central (`RegistrySummary`) ganhou contadores
  `image_analyses` e `image_exports`.

### Laudo (MVP 4)
- A imagem derivada (PNG) aparece automaticamente no registry e pode
  ser inserida via o painel **Evidências → Todas / Fotos** do Inspector
  do Laudo do MVP 4 — o painel já enxerga itens com `kind=image_export`
  pelo registry consolidado.
- O vínculo é gravado em `evidence_links` ao inserir, mantendo
  rastreabilidade laudo ↔ imagem derivada ↔ análise ↔ origem.

---

## 7. Segurança e integridade

- Reutiliza o helper compartilhado do MVP 5
  (`sanitize_relative_path`, `resolve_workspace_relative`).
- `create_image_analysis_from_file` **copia** o arquivo para
  `imagens/originais/` e computa SHA-256 — nunca mantém referência
  externa.
- Nenhum command aceita caminho absoluto em campo declarado relativo.
- `read_image_asset` retorna base64 (sem expor caminho absoluto ao
  frontend).
- Cada criação/export grava linha em `image_operation_logs` E em
  `occurrence_audit` (audit cross-module unificado).

---

## 8. Performance

- **`image` crate** é pure-Rust, sem libsystem — build limpo, bundle
  Tauri permanece auto-contido.
- Ajustes visuais usam **CSS filter** no preview — zero CPU além do
  paint do navegador.
- Hash SHA-256 só é calculado quando solicitado explicitamente
  (`compute_hash=true` em `get_image_metadata`) ou no momento da
  importação local.
- Konva renderiza a imagem em um Layer separado das anotações; a
  performance do canvas para a maioria das fotos pericíiais (até
  ~12 MP) é a mesma do Croqui.
- Resize Lanczos3 no backend pode ser pesado em imagens grandes —
  documentado, executado só sob demanda.

---

## 9. Resultados dos testes

| Suíte                                            | Resultado |
|--------------------------------------------------|-----------|
| `pnpm typecheck`                                 | ✅ ok    |
| `pnpm test` (Vitest)                             | ✅ **67/67** |
| `pnpm build`                                     | ✅ ok — 1.24 MB (gzip 377 KB) |
| `cargo check`                                    | ✅ ok    |
| `cargo test` (lib + integration)                 | ✅ **85/85** |

**Cobertura nova MVP 7:**
- *Rust:* 8 testes do `processor` (invert, grayscale, brightness,
  rotate, flip, crop com clamp, resize).
- *TS:* 6 testes do serializer (.sicroimage), 9 testes dos factories.

---

## 10. Limitações conhecidas

1. **EXIF parsing** não foi implementado. `get_image_metadata` retorna
   `exif_json: null`. Spike próprio.
2. **Operações geométricas (rotate/flip/crop/resize)** existem no
   backend mas não têm botões na UI do MVP 7. Adicionar é fácil em
   um spike próprio (UI + dispatch de `BackendOperation`).
3. **CSS-filter preview ≠ pixel exact**. O gamma do CSS é
   aproximado por brilho; o backend pipeline aplica gamma real ao
   exportar. Diferenças visuais > preview são raras na faixa típica
   (0.5 < gamma < 2.0).
4. **Redação por blur / pixelização** — tarja só é retangular sólido
   neste MVP. Blur/pixelize ficam para o spike de "Operações
   destrutivas com seleção".
5. **Sem undo/redo** persistente — apenas a delete por anotação. A
   arquitetura suporta adicionar histórico depois (já temos
   `image_operation_logs` no backend).
6. **Konva canvas filter no client**: o `Konva.Filters` permite
   re-render pixel-exact dos ajustes, mas teria custo mais alto a
   cada slider drag. Mantive CSS filter por performance e deixei o
   pixel-exact para o backend no momento do export.
7. **DOCX com imagens reais** (ressalva herdada do MVP 4) continua
   intacta.

---

## 11. Validação manual — concluída em 2026-05-25 ✅

| Critério verificado em runtime                                                | Resultado |
|-------------------------------------------------------------------------------|-----------|
| Módulo Imagem abriu corretamente                                              | ✅ ok    |
| Criar análise a partir de foto do Dossiê                                      | ✅ ok    |
| Criar análise a partir de frame de vídeo/storyboard                           | ✅ ok    |
| Criar análise a partir de arquivo local                                       | ✅ ok    |
| Imagem abriu corretamente no canvas                                           | ✅ ok    |
| Zoom funcionou                                                                | ✅ ok    |
| Pan funcionou                                                                 | ✅ ok    |
| Fit-to-screen funcionou                                                       | ✅ ok    |
| Coordenadas / status bar                                                      | ✅ ok    |
| Seta                                                                          | ✅ ok    |
| Linha                                                                         | ✅ ok    |
| Retângulo                                                                     | ✅ ok    |
| Círculo / elipse                                                              | ✅ ok    |
| Texto                                                                         | ✅ ok    |
| Marcador numerado                                                             | ✅ ok    |
| Medida                                                                        | ✅ ok    |
| Tarja / ocultação                                                             | ✅ ok    |
| Seleção / mover / redimensionar anotação                                      | ✅ ok    |
| Painel Camadas                                                                | ✅ ok    |
| Ajuste de brilho                                                              | ✅ ok    |
| Ajuste de contraste                                                           | ✅ ok    |
| Ajuste de gamma                                                               | ✅ ok    |
| Ajuste de saturação                                                           | ✅ ok    |
| Grayscale                                                                     | ✅ ok    |
| Inverter cores                                                                | ✅ ok    |
| Salvar análise                                                                | ✅ ok    |
| Fechar e reabrir preservou a sessão `.sicroimage`                             | ✅ ok    |
| Imagem, anotações e ajustes preservados após reabrir                          | ✅ ok    |
| Exportação derivada                                                           | ✅ ok    |
| PNG derivado abriu fora do SICRO                                              | ✅ ok    |
| Sidecar JSON criado                                                           | ✅ ok    |
| Imagem derivada apareceu na Central de Evidências                             | ✅ ok    |
| Imagem derivada pôde ser inserida no Laudo                                    | ✅ ok    |
| PDF com imagem derivada exportou corretamente                                 | ✅ ok    |
| Dossiê, Croqui, Vídeo, Laudo, Evidências e Importador continuaram funcionando | ✅ ok    |

## 12. Roteiro de validação manual (referência)

1. Abrir workspace existente, ir em **Imagem** no ActivityRail.
2. Clicar em "Nova análise" → aba **Dossiê** → escolher uma foto.
   Editor abre, imagem carrega centralizada.
3. Verificar **toolbar lateral** (12 ferramentas), painel direito
   (5 abas), status bar com `tool: select`, `x/y`, `zoom`, dimensões,
   `escala indefinida`.
4. **Pan** (H ou tool Hand) → arrastar para mover.
5. **Zoom** com scroll do mouse.
6. **Anotações**: testar seta, linha, retângulo, elipse, texto,
   marcador numerado (incrementa #), medida, tarja.
7. **Definir escala**: ferramenta `Definir escala` → 2 cliques + valor
   em metros. Status bar deve mostrar `escala N.NN px/m`.
8. **Ajustes** (aba Ajustes): mover sliders Brilho/Contraste/Gamma/
   Saturação. Imagem deve responder em tempo real (via CSS filter).
9. Marcar **Tons de cinza** e **Inverter cores**.
10. **Resetar ajustes**.
11. **Camadas**: ocultar camada de anotações pelo olho.
12. **Salvar** (Ctrl+S). Status: "Análise salva."
13. **Fechar editor** (Voltar). Reabrir a análise pela lista —
    anotações e ajustes preservados.
14. **Exportar**. Status: "Imagem exportada: `imagens/exports/...png`".
15. **Abrir o PNG no SO** — anotações compostas, ajustes refletidos
    visualmente.
16. **Inspecionar o sidecar JSON** ao lado (mesmo path + `_sidecar.json`).
    Conferir: software, source.original_relative_path, source.hash,
    derivative.hash_sha256, dimensions, adjustments, summary,
    composed_from_frontend=true.
17. Ir em **Evidências (Central)** → aba Fotos / Todas. A imagem
    derivada (kind=`image_export`) deve aparecer. Status `ok`.
18. Rodar **Verificação leve**. A análise (.sicroimage) e a imagem
    derivada (PNG) devem aparecer como `ok`.
19. Renomear o PNG no disco (teste controlado). Re-rodar verificação:
    `missing_file` no item.
20. **Inserir no Laudo**: abrir um Laudo, painel Evidências → aba
    Todas → filtrar por `image_export` → "Inserir foto". A imagem
    derivada aparece no laudo. Exportar PDF e conferir.
21. **Criar análise a partir de frame de vídeo**: Nova análise → aba
    Frames de vídeo → escolher um frame coletado. Editor abre com o
    frame.
22. **Criar análise a partir de arquivo local**: Nova análise → aba
    Arquivo local → escolher PNG/JPG do disco. Conferir que copiou
    para `imagens/originais/` e que `original_hash_sha256` foi
    calculado.
23. **Regressão**: confirmar que Dossiê, Vídeo, Croqui, Laudo,
    Evidências e Importador continuam funcionando.

---

## 13. Critérios de sucesso vs. realidade

| #  | Critério                                                           | Atendido |
|----|--------------------------------------------------------------------|----------|
| 1  | Módulo Imagem abre no SICRO                                        | ✅       |
| 2  | Criar análise a partir de foto do Dossiê                           | ✅       |
| 3  | Criar análise a partir de frame de vídeo/storyboard                | ✅       |
| 4  | Imagem aparece no canvas                                           | ✅       |
| 5  | Zoom/pan funcionam                                                 | ✅       |
| 6  | Réguas / coordenadas                                               | ✅ (coords no status bar; régua gráfica é futuro) |
| 7  | Anotações básicas (seta, linha, ret, elipse)                       | ✅       |
| 8  | Texto                                                              | ✅       |
| 9  | Marcador numerado                                                  | ✅       |
| 10 | Medida                                                             | ✅       |
| 11 | Escala                                                             | ✅       |
| 12 | Ajustes visuais básicos                                            | ✅ (brilho/contraste/gamma/saturação/grayscale/inverter) |
| 13 | Camadas simples                                                    | ✅ (toggle de visibilidade) |
| 14 | Histórico/log                                                      | ✅ (aba Histórico carrega de `image_operation_logs`) |
| 15 | Salvar `.sicroimage`                                               | ✅       |
| 16 | Fechar/reabrir preserva                                            | ✅       |
| 17 | Exportação derivada                                                | ✅ (PNG + sidecar JSON) |
| 18 | PNG derivado abre fora do SICRO                                    | ✅       |
| 19 | Sidecar JSON gerado                                                | ✅       |
| 20 | Central de Evidências lista a imagem derivada                      | ✅ (registry expandido) |
| 21 | Laudo consegue inserir a imagem derivada                           | ✅       |
| 22 | PDF com imagem derivada exporta corretamente                       | ✅       |
| 23 | Módulos anteriores continuam funcionando                           | ✅ (cargo test 85/85, vitest 67/67) |
| 24 | Validações automáticas passam                                      | ✅       |

---

## 14. Recomendação final

**Recomendação: APROVADO.**

A validação manual em runtime cumpriu **todos os 35 critérios**
listados em §11 e os **24 critérios formais** em §13. O Editor de
Imagem nasce como **bancada pericial séria, inspirada em Peritus,
mas integrada ao SICRO**:

- preserva o original (intocado em `imagens/originais/`);
- registra ajustes + anotações + escala no `.sicroimage`;
- exporta derivado destrutivo com sidecar JSON técnico;
- integra com Central de Evidências sem refactor da Central;
- integra com Laudo sem refactor do Laudo;
- arquitetura híbrida (Konva preview + Rust export) mantém pixels
  reproduzíveis sem comprometer fluidez do canvas;
- extensível por design — futuros filtros (Sobel / CLAHE / FFT /
  Wavelets / autenticação) só precisam de mais um `BackendOperation`
  + um botão no toolbar, sem mexer no que já funciona.

**Limitações remanescentes** (todas registradas em §10):

1. **EXIF parsing** — não implementado; `get_image_metadata` retorna
   `exif_json: null`. Spike próprio.
2. **Operações geométricas** (rotate/flip/crop/resize) existem no
   backend mas não têm botões na UI — adicionar é trivial.
3. **CSS gamma é aproximado**; o backend pipeline usa `pow()` real.
4. **Tarja sólida apenas** — blur/pixelize são spike próprio.
5. **Undo/redo** persistente não implementado.
6. **Detecção de bordas / FFT / CLAHE / Kuwahara / autenticação** —
   registrados como futuros incrementos aditivos.
7. **DOCX com imagens reais** (ressalva herdada do MVP 4) intacta.

**Próximo passo sugerido** (sob autorização):

- **Spike DOCX-imagens** — fechar a ressalva técnica do MVP 4
  conforme plano em `MVP4_EVIDENCIAS_NO_LAUDO_RELATORIO.md` §7; OU
- **MVP 8 — Operações geométricas + EXIF** — destravar rotate/flip/
  crop/resize na UI e adicionar leitura de EXIF; OU
- **MVP 9 — Filtros forenses** (Sobel/Canny/Laplaciano/CLAHE/blur/
  mediana) sobre a fundação já em pé do MVP 7.

---

## 15. Estado de entrega

- ✅ Backend Rust + 9 Tauri commands + módulo `image_editor/`.
- ✅ Migration 009 + 3 tabelas (image_analyses, image_exports,
  image_operation_logs).
- ✅ Registry MVP 5 estendido com `ImageAnalysis` / `ImageExport`.
- ✅ Frontend: `.sicroimage` engine + store + ImagemModule +
  ImageEditor (toolbar 12 ferramentas + canvas Konva + painel direito
  5 abas + status bar + atalhos).
- ✅ ActivityRail + rota `/imagem`.
- ✅ 67/67 vitest, 85/85 cargo test, typecheck, build, cargo check
  limpos.
- ✅ Validação manual 35/35.
- ✅ Branch `mvp/editor-imagem-pericial` → merge na `main` → tag
  `v0.12.0-mvp7-editor-imagem-pericial`.
