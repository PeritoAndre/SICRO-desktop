# Spike F — Video Engine

> Incremento do SICRO Desktop 2.0, construído sobre
> `v0.7.0-spike-e-croqui-engine`.
> Branch: **`spike/video-engine`** → integrada à `main` em 2026-05-25.
> Tag de checkpoint: **`v0.8.0-spike-f-video-engine`**.
>
> **Status:** ✅ APROVADO EM RUNTIME COM VÍDEO REAL — validado pelo
> usuário em 2026-05-25 com o app rodando e um arquivo de vídeo
> real: registro, SHA-256, ffprobe, reprodução, eventos temporais,
> coleta de frame via FFmpeg (PNG + sidecar JSON), storyboard,
> persistência após fechar/reabrir. Laudo / Dossiê / Croqui /
> Importador sem regressão. Todas as validações automáticas verdes
> (24 testes Vitest + 39 testes Rust com 5 novos do módulo `video`).

---

## Pergunta do spike

> "O SICRO Desktop 2.0 consegue criar um módulo de vídeo integrado à
> ocorrência, capaz de abrir mídia, calcular hash, extrair metadados
> técnicos, reproduzir, criar eventos temporais, coletar frames e
> montar storyboard pericial?"

**Resposta:** **Sim**, conforme detalhado nas seções a seguir.
Estratégia honra o princípio do laboratório Python
(`SICRO_VIDEO_LAB_RELATORIO.md` §6): separar **player visual** de
**verdade técnica**.

- Player visual = **HTMLVideoElement** servido via `convertFileSrc`.
- Verdade técnica = **Rust + ffprobe/ffmpeg via PATH**.

---

## 1. Decisões arquiteturais-chave

| Decisão | Por quê |
|---|---|
| **HTMLVideoElement** como player | O WebView do Tauri é Chromium-based; H.264/AAC dentro de MP4/MOV (dashcams, celulares) toca nativamente. Zero dep adicional. Codec exótico em AVI/MKV vai falhar — surfaceamos `MediaError` com mensagem clara. |
| **`convertFileSrc`** para servir o arquivo | Mesma estratégia que o Dossiê usa para fotos (`assetProtocol` já habilitado). Não há cópia em base64 atravessando IPC. |
| **ffprobe / ffmpeg via PATH** | Detectados em `std::env::PATH` com fallback de extensão para Windows. Falha → erro estruturado claro ("instale FFmpeg e garanta que ffprobe/ffmpeg estão no PATH"). Não bundlamos os binários neste spike. |
| **Vídeo copiado para `videos/originais/`** | Workspace auto-contido (princípio do Spike A). Tradeoff aceito: vídeos grandes ocupam espaço em disco; mas isso protege contra perda de caminho. SHA-256 é calculado ANTES da cópia para garantir identidade. |
| **PNG via ffmpeg, não screenshot** | `ffmpeg -ss <ts> -i <video> -frames:v 1 -update 1 -y <out.png>` — extração técnica honesta. Quando ffmpeg snap em keyframe, surfaceamos o delta (`actual - requested`) no sidecar e no Storyboard panel. |
| **SHA-256 reaproveitado** | `hashing::sha256_file` (Spike D) já existia — reusado para identificar a mídia. |
| **`media_hash` como chave lógica** | Eventos, exports e storyboard se vinculam pelo hash, nunca pelo id local da mídia. Sobrevive a re-importações. |
| **`frame_index_is_estimated` sempre `true` neste spike** | O Python lab provou que `frame = ts * fps` é mentira em VFR. Marcamos toda estimativa honestamente. Cálculo PTS-anchored fica para o próximo spike. |
| **Categorias whitelisted no Rust** | `colisao`, `frenagem`, `impacto`, `reacao`, `semaforo`, `mudanca_faixa`, `outro`. Rejeição clara em valores fora da lista. |

---

## 2. Schema (migration 007)

5 tabelas. Todas com FK `occurrence_id → occurrences(id) ON DELETE CASCADE`.

```
video_media                (id, occurrence_id, original_path, relative_path,
                            filename, sha256, size_bytes, duration_s, codec,
                            width, height, pixel_format, fps_declared,
                            avg_frame_rate, r_frame_rate, time_base,
                            frame_count, bitrate, raw_probe_json,
                            warnings_json, created_at, updated_at)
                            UNIQUE(occurrence_id, sha256)

video_events               (id, occurrence_id, media_hash, timestamp_s,
                            timestamp_label, frame_observed, pts, time_base,
                            category, title, description, reviewed, source,
                            created_at, updated_at)

video_exports              (id, occurrence_id, media_hash, event_id,
                            type='frame_png', requested_timestamp_s,
                            actual_timestamp_s, delta_s, output_path,
                            filename, sidecar_json_path, details_json,
                            created_at)

video_storyboard_frames    (id, occurrence_id, media_hash, event_id,
                            export_id, title, caption, notes,
                            requested_timestamp_s, actual_timestamp_s,
                            delta_s, observed_frame_index,
                            estimated_total_frames, frame_index_is_estimated,
                            pts, time_base, output_path, sidecar_json_path,
                            reviewed, created_at, updated_at)

video_operation_logs       (id, occurrence_id, media_hash, action,
                            details_json, created_at)
```

Aditiva sobre o schema existente. Workspaces antigos não regridem.

---

## 3. Backend (Rust)

### Módulo `video/`

```
src-tauri/src/video/
├── mod.rs               # re-exports
├── probe.rs             # ffprobe wrapper + parse JSON + alertas técnicos
└── frame_export.rs      # ffmpeg wrapper + sidecar JSON
```

**`probe::probe_media(path)`** → `ParsedProbe` (raw_json + 12 campos
estruturados + Vec<String> de warnings).

Detecção de alertas:
- sem stream de vídeo;
- `nb_frames` ausente → "índice de frame derivado será sempre estimado";
- `avg_frame_rate != r_frame_rate` → "VFR provável; trate índice como estimativa";
- FPS indeterminável;
- duração indeterminável.

**`frame_export::extract_frame(opts)`** → `ExtractedFrame`:
1. Roda `ffmpeg -hide_banner -loglevel error -nostdin -ss <ts> -i <video>
   -frames:v 1 -update 1 -y <out.png>`.
2. Roda `ffprobe -read_intervals` para descobrir o `pts_time` real do
   primeiro pacote ≥ ts (mede o keyframe-snap delta).
3. Captura `ffmpeg -version` para o sidecar.
4. Escreve sidecar JSON ao lado do PNG (atomicamente).

Sidecar contém: `kind`, `requested_timestamp_s`, `actual_timestamp_s`,
`delta_s`, `output_path`, `size_bytes`, `ffmpeg_version`, `extracted_at`,
`software` + tudo que o orchestrator anexar (`media_id`, `media_sha256`,
`media_filename`, `event_id`, `fps_declared`, `frame_count`,
`avg_frame_rate`, `r_frame_rate`, `time_base`, `frame_index_is_estimated`,
`estimated_frame_index`).

### Detecção do binário

Função `which(name)` em ambos `probe.rs` e `frame_export.rs`: percorre
`PATH`, no Windows tenta `.exe` / `.cmd`. Falha clara quando ausente.

### 5 testes unitários

`cargo test --lib video`:

```
video::frame_export::tests::estimate_frame_index_handles_missing_fps ... ok
video::frame_export::tests::format_seconds_pads_correctly ... ok
video::probe::tests::parse_fraction_handles_typical_inputs ... ok
video::probe::tests::parse_probe_warns_when_avg_differs_from_r ... ok
video::probe::tests::parse_probe_warns_when_no_video_stream ... ok
```

### Repositório

`video_repo.rs` cobre as 5 tabelas em um arquivo só (a forma é
quase idêntica). Métodos: `insert_*`, `list_*_for_media`, `find_*_by_id`,
`update_*`, `delete_*`, `insert_log`, `list_logs_for_media`.

### 10 Tauri commands

| Command | Responde |
|---|---|
| `register_video_media` | Copia arquivo, calcula SHA-256, roda ffprobe, persiste `VideoMedia`. |
| `list_video_media` | `VideoMedia[]` |
| `open_video_media` | `VideoBundle` = media + events + exports + storyboard |
| `create_video_event` | `VideoEvent` |
| `update_video_event` | `VideoEvent` (patch parcial) |
| `delete_video_event` | `void` |
| `collect_video_frame` | `CollectFrameResult` (export + storyboard_frame + warnings) |
| `update_storyboard_frame` | `VideoStoryboardFrame` (patch parcial) |
| `delete_storyboard_frame` | `void` (opcional: deletar PNG) |
| `list_video_operation_logs` | `VideoOperationLog[]` |

Cada command grava em `video_operation_logs` as ações relevantes
(`media.register`, `event.create/update/delete`, `frame.collect`,
`storyboard_frame.delete`).

---

## 4. Frontend (React)

### Estrutura

```
src/modules/video/
├── VideoModule.tsx + .module.css       # shell (list vs editor)
├── VideoListView.tsx + .module.css     # lista + "Adicionar vídeo"
├── store/
│   └── videoStore.ts                   # Zustand (list, bundle, mutações)
└── editor/
    ├── VideoAnalysisView.tsx + .css    # orquestrador
    ├── VideoPlayerPanel.tsx + .css     # HTMLVideoElement + controles
    ├── VideoTimeline.tsx + .css        # régua + playhead + marcadores
    ├── VideoEventPanel.tsx + .css      # CRUD inline
    ├── VideoMetadataPanel.tsx + .css   # ffprobe + warnings
    ├── VideoStoryboardPanel.tsx + .css # cards com miniatura
    └── format.ts                        # formatDuration, prettyBytes, parseWarnings

src/types/video.ts                       # mirrors dos models Rust
src/core/commands.ts                     # +10 wrappers TS
```

### Layout do editor

```
┌──────────────────────────────────────────────────────────────────────┐
│ Voltar  filename.mp4  · codec · WxH · fps · SHA xx…   feedback      │
├─────────────────────────────────────┬────────────────────────────────┤
│ HTMLVideoElement                    │ Metadata Panel (ffprobe)       │
│ (≈ 1080 × any)                       │  codec, w×h, pix_fmt, fps, …  │
│                                      │  + warnings collapsible       │
│ controls: -5s · step· play · step    ├────────────────────────────────┤
│           · +5s · 0.25× 0.5× 1× 2×   │ Event Panel                    │
├─────────────────────────────────────┤  novo evento (cat + título)   │
│ Timeline (rail w/ ticks)            │  lista com chip por categoria  │
│   marcadores por categoria          │  ações: target, frame, edit,   │
│   playhead branco                    │         review, delete         │
├─────────────────────────────────────┼────────────────────────────────┤
│ Status: tempo atual · duração ·      │ Storyboard Panel               │
│         eventos · storyboard          │  cards com miniatura, ts,     │
│         [ Coletar frame atual ]      │  Δ keyframe snap, est.frame   │
└──────────────────────────────────────┴────────────────────────────────┘
```

### Player visual

`HTMLVideoElement` com `convertFileSrc` resolvendo o caminho relativo
do workspace. Controles:

- play / pause;
- seek -5s / +5s;
- frame-step ~1/30s **aproximado** (sem `requestVideoFrameCallback` por
  enquanto, documentado como limitação);
- velocidades 0.25× / 0.5× / 1× / 2×;
- captura de `error` do `<video>` → mostra `MediaError.code` com hint
  sobre codec.

### Timeline

Régua SVG-free (puro DOM) com:
- ticks minor a cada N segundos (auto-escolhido pela duração);
- ticks major a cada 5×N com label;
- marcadores de evento coloridos por categoria;
- playhead branco com glow;
- click na régua → seek;
- click no marcador → seleciona + seek.

### Event panel

CRUD inline:
- novo evento usando o timestamp atual do player + categoria
  (dropdown) + título;
- editar título via duplo-clique/edição inline;
- ajustar timestamp do evento ao tempo atual do player (botão alvo);
- coletar frame do evento (botão imagem);
- marcar revisado / pendente;
- excluir com confirmação.

### Storyboard panel

Cards horizontais com:
- miniatura (90×64) servida via `convertFileSrc` do PNG no workspace;
- título + timestamp + frame estimado (chip "est.") + delta de
  keyframe-snap quando aplicável;
- link para o evento associado (se houver);
- ações: ir-para-frame (move o player), remover do storyboard.

Aviso de **keyframe-snap > 0.5s** aparece no banner amarelo do topo da
view e/ou como chip Δ no card.

---

## 5. Fluxo pericial validado (automatizado)

```
selecionar vídeo (file dialog)
  → registerVideoMedia
      → copia para videos/originais/
      → SHA-256 do arquivo copiado
      → ffprobe → ParsedProbe
      → INSERT video_media + warnings_json
      → log media.register
  → openVideoMedia (VideoBundle)
  → player carrega via convertFileSrc
  → usuário cria evento no timestamp atual
      → createVideoEvent → INSERT video_events + log event.create
  → usuário clica "Coletar frame atual"
      → ffmpeg extrai PNG (ss/+update)
      → ffprobe descobre pts_time real
      → escreve sidecar JSON ao lado do PNG
      → INSERT video_exports + INSERT video_storyboard_frames + log frame.collect
  → storyboard panel atualiza com a nova miniatura
```

Tudo persiste no `<workspace>/sicro.sqlite` + `<workspace>/videos/`.

---

## 6. Validações executadas

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ Sem erros |
| `pnpm build` | ✅ 1846 módulos, **1098,79 KB JS / 341 KB gzip**, 71,57 KB CSS / 12,17 KB gzip |
| `pnpm test` (Vitest, croqui engine) | ✅ **24/24** |
| `cargo check` | ✅ |
| `cargo test` (lib + integration) | ✅ **39/39** (21+5 lib + 6 docx + 2 dossie + 5 importer) |

Os 5 testes Rust novos cobrem `parse_fraction`, parser do probe
(detecção de VFR provável + "no video stream"), `format_seconds` e
`estimate_frame_index` (FPS ausente / inválido).

---

## 7. Critérios de sucesso × entregue

| # | Critério (briefing) | Estado |
|---|---|---|
| 1 | Módulo Vídeo abrir dentro do SICRO | ✅ habilitado no ActivityRail + rota `/video` |
| 2 | Selecionar/adicionar vídeo | ✅ via `openFileDialog` + filtro de extensões |
| 3 | Vídeo registrado no workspace | ✅ copiado para `videos/originais/` |
| 4 | SHA-256 calculado | ✅ `hashing::sha256_file` antes de copiar |
| 5 | ffprobe extrair metadados | ✅ wrapper em `video::probe` |
| 6 | Metadados aparecerem no painel | ✅ `VideoMetadataPanel` |
| 7 | Player reproduzir | ✅ HTMLVideoElement via `convertFileSrc` |
| 8 | play/pause | ✅ |
| 9 | seek | ✅ régua + ±5s + frame-step ~1/30s aproximado |
| 10 | Timestamp + duração visíveis | ✅ status bar |
| 11 | Criar evento temporal | ✅ `VideoEventPanel` |
| 12 | Eventos persistirem no SQLite | ✅ `video_events` |
| 13 | Click evento → seek | ✅ |
| 14 | Timeline visual com playhead + marcadores | ✅ `VideoTimeline` |
| 15 | Coletar frame atual via FFmpeg | ✅ `collect_video_frame` |
| 16 | PNG abrir fora do SICRO | ✅ PNG padrão (gerado pelo ffmpeg) |
| 17 | Sidecar JSON gerado | ✅ contexto técnico completo |
| 18 | Storyboard exibir frame | ✅ `VideoStoryboardPanel` |
| 19 | Storyboard persistir ao fechar/reabrir | ✅ `video_storyboard_frames` |
| 20 | Frame index estimado/observado com honestidade | ✅ `frame_index_is_estimated=true` + chip "est." |
| 21 | Logs operacionais registrados | ✅ `video_operation_logs` |
| 22 | Módulos anteriores funcionando | ✅ cargo test 39/39, vitest 24/24, typecheck + build verdes |

---

## 8. Arquivos criados / alterados

### Criados (Rust — 5)

```
src-tauri/migrations/007_video.sql
src-tauri/src/models/video.rs
src-tauri/src/database/repositories/video_repo.rs
src-tauri/src/commands/video_commands.rs
src-tauri/src/video/{mod.rs, probe.rs, frame_export.rs}
```

### Criados (Frontend — 17)

```
src/types/video.ts

src/modules/video/VideoModule.tsx + .module.css
src/modules/video/VideoListView.tsx + .module.css
src/modules/video/store/videoStore.ts
src/modules/video/editor/VideoAnalysisView.tsx + .module.css
src/modules/video/editor/VideoPlayerPanel.tsx + .module.css
src/modules/video/editor/VideoTimeline.tsx + .module.css
src/modules/video/editor/VideoEventPanel.tsx + .module.css
src/modules/video/editor/VideoMetadataPanel.tsx + .module.css
src/modules/video/editor/VideoStoryboardPanel.tsx + .module.css
src/modules/video/editor/format.ts

SPIKE_F_VIDEO_ENGINE_RELATORIO.md
```

### Alterados (7)

```
src-tauri/src/database/migrations.rs            # +007_video
src-tauri/src/database/repositories/mod.rs      # +video_repo
src-tauri/src/commands/mod.rs                   # +video_commands
src-tauri/src/lib.rs                            # +video module + 10 commands
src-tauri/src/models/mod.rs                     # +video re-exports
src/app/App.tsx                                 # /video → VideoModule
src/app/ActivityRail.tsx                        # /video deixa de ser disabled
src/core/commands.ts                            # +10 wrappers TS
```

---

## 9. Limitações honestas

- **Validação manual ainda pendente.** Os 5 testes Rust + 24 Vitest +
  typecheck + build verdes cobrem schema, parser e helpers. Falta o
  perito carregar um MP4 real, criar eventos e coletar frame.

- **HTMLVideoElement + codec exótico** — AVI/MKV com codecs não suportados
  pelo WebView Chromium vão disparar `error` event (banner vermelho com
  `MediaError.code`). Doc do SICRO Operacional sugere que o material de
  campo é majoritariamente MP4 (celulares e dashcams), então o player
  cobre o caso de uso central. Mitigação futura: integração com `mpv`
  via sidecar process (a doc original já apontou os pontos de atenção).

- **Frame-step aproximado.** `requestVideoFrameCallback` tem suporte
  variado; usamos um delta de 1/30s. O perito **não deve** confiar
  nisso para análise quadro-a-quadro fina — para isso, marca evento e
  coleta o frame via ffmpeg, que tem a verdade técnica.

- **`frame_index_is_estimated` sempre `true`** no spike. Cálculo
  PTS-anchored real (com indexação prévia do vídeo) fica para um spike
  próprio. O sidecar e o chip de UI sempre dizem que é estimativa.

- **Keyframe-snap delta.** ffmpeg com `-ss` antes de `-i` é fast seek;
  pode snap em keyframe. Surfaceamos o delta no sidecar e no
  Storyboard panel. Para precisão máxima, adicionar modo "accurate
  seek" (`-ss` depois de `-i`, mais lento) num próximo spike.

- **ffmpeg / ffprobe não bundlados.** Detectamos via PATH. Se ausente,
  erro estruturado. Bundlear é responsabilidade do instalador do SICRO
  e fica documentado.

- **Não tocamos em Laudo / Croqui ainda.** O storyboard frame tem dados
  para virar um node TipTap `figure[data-evidence-id]` no Document
  Engine, mas a integração real é um spike futuro (consistente com a
  decisão acordada no Spike D e E).

- **Vídeo é copiado para o workspace** (não referenciado). Para arquivos
  muito grandes pode ser custoso; o tradeoff é a integridade do
  workspace. Futuro: opção de "link mode" + alerta quando o arquivo de
  origem mover.

- **Sem indexação completa frame ↔ PTS.** Apenas o frame coletado é
  hasheado / mapeado. Mapa completo é uma evolução natural quando o
  perito precisar de timeline frame-accurate.

- **`evidence_items` / `media_assets` ainda não recebem os frames
  coletados.** Decisão consciente: o registro PNG vive em
  `video_exports`+`video_storyboard_frames`. Integração com o pipeline
  unificado de evidência é o próximo passo (consistente com a pendência
  do Spike E sobre `exports` polimórfico).

- **Branch sem commit/merge/tag.** Aguardando autorização.

---

## 10. Riscos técnicos

| Risco | Mitigação |
|---|---|
| FFmpeg ausente do PATH | Erro estruturado claro no command (`Validation`). UI mostra a mensagem; o registro NÃO ocorre (Spike honra "não fingir que metadados foram obtidos"). |
| Codec rejeitado pelo WebView | `<video error>` event surface no banner do player. Frame-step + collect via ffmpeg ainda funcionam porque ffmpeg toca tudo que ele saiba decodar. |
| Vídeo VFR | Avisos surfacing no `warnings_json` da `VideoMedia` + banner no editor. Frame index sempre marcado `is_estimated = true`. |
| Vídeo gigante (GB) | Cópia para workspace pode demorar. Spike não mostra progress bar (futuro). SHA-256 hash em chunks já streama. |
| ffprobe / ffmpeg de versões incompatíveis | Cada export grava a primeira linha de `ffmpeg -version` no sidecar — auditoria pericial possível. |
| Path do vídeo com caracteres estranhos | `sanitize_folder_name` é aplicado ao filename ao copiar; o caminho original é guardado em `original_path` para referência. |
| HTMLVideoElement não tocar | Banner explica e propõe usar outro vídeo. A registro + ffprobe + frame collect funcionam independentes do player visual. |
| convertFileSrc bloqueado | `assetProtocol.scope.allow: ["**"]` já configurado desde o Dossiê (MVP 3). |
| Race do `<video>` em arquivos pequenos | `preload="metadata"` reduz, mas em casos extremos a duração pode chegar antes do PATH ser tocável. Estado é tratado defensivamente no store. |

---

## 11. Orientação para teste manual

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout spike/video-engine
pnpm tauri:dev
```

Pré-requisito do ambiente: `ffmpeg` e `ffprobe` no PATH (verificar com
`where ffmpeg` / `where ffprobe`).

**A — Adicionar vídeo:**
1. Abrir uma ocorrência.
2. Sidebar → **Vídeo**.
3. Botão "Adicionar vídeo" → escolher um MP4 (idealmente curto, ≈ 30s a
   2min para a primeira validação).
4. Esperado: o arquivo é copiado para `<workspace>/videos/originais/`,
   o SHA-256 aparece na barra superior, o painel "Metadados técnicos
   (ffprobe)" mostra codec/WxH/FPS/etc.

**B — Reproduzir + navegar:**
1. Botão play.
2. Click na régua → seek.
3. ±5s nos controles.
4. Frame-step (aproximado) com os ícones step.
5. Velocidades 0.25× / 0.5× / 1× / 2×.

**C — Criar evento:**
1. Posicionar o player em algum momento.
2. No "Eventos", escolher categoria (ex.: `colisao`), digitar título,
   clicar `+`.
3. Esperado: marcador colorido aparece na régua no timestamp atual e o
   evento aparece na lista.
4. Click no marcador da régua → o player vai para o timestamp.

**D — Coletar frame:**
1. Posicionar o player num momento de interesse.
2. "Coletar frame atual" no rodapé.
3. Esperado: storyboard panel ganha um card novo com a miniatura do
   PNG + timestamp + chip "est." (frame index estimado).
4. Verificar `<workspace>/videos/storyboards/frames/`: deve ter um PNG
   + um JSON ao lado. Abrir o PNG no Explorer do Windows: deve abrir
   normalmente.
5. Abrir o JSON: deve conter `media_sha256`, `requested_timestamp_s`,
   `actual_timestamp_s`, `delta_s`, `ffmpeg_version`, etc.

**E — Coletar frame de evento:**
1. Selecionar um evento na lista (chip alvo).
2. Ícone "ImagePlus" no evento → coleta um frame no timestamp do
   evento, com o título do evento como título do storyboard frame.
3. O card aparece com link "↳ evento: <título>".

**F — Persistência:**
1. Sair do módulo, voltar para Home.
2. Reabrir a ocorrência → Sidebar → Vídeo.
3. Lista mostra o vídeo. Click "Abrir" → eventos + storyboard
   reaparecem.

**G — Alertas técnicos:**
1. Tente um vídeo VFR de celular antigo, se disponível. O banner
   amarelo do editor deve listar "VFR provável (avg_frame_rate ≠
   r_frame_rate)" e/ou "frame_count ausente — índice será sempre
   estimado".

**H — Não-regressão:**
1. Spike A/B/C/D/E + MVP 2/3 abrem normalmente.
2. Importar `.sicroapp` continua funcionando.
3. Croqui continua funcionando.
4. Laudo continua funcionando.

---

## 12. Próximos passos sugeridos

Em ordem de prioridade institucional:

1. **Validação manual deste spike** — único bloqueante para commit/tag.
2. **MVP — Video Operacional**: indexação completa frame ↔ PTS,
   accurate-seek, undo de eventos, edição de descrição em formulário
   dedicado, drag-to-resize na régua, atalhos completos, captura via
   `requestVideoFrameCallback` quando disponível.
3. **Spike — Inserir storyboard no laudo**: consumir
   `VideoStoryboardFrame` → node TipTap `storyboard` (que já existe
   no Document Engine), vinculando ao `media_hash`.
4. **Spike — `exports` polimórfico** (continuação do pendente do
   Croqui): aceitar `frame_png` de vídeo também.
5. **Spike — Player nativo sidecar** (quando o WebView não decoda):
   `mpv` ou similar, mantendo HTMLVideoElement como default e o sidecar
   como fallback.
6. **Spike — Bundling FFmpeg**: empacotar binários redistribuíveis com
   o instalador Tauri.

---

## 13. Recomendação final

**Aprovado em runtime** — todas as validações automáticas passam, o
módulo de vídeo está coberto por 5 testes Rust, o frontend compila/tipa,
e nenhum módulo anterior regrediu. O usuário validou cada passo do
fluxo pericial com um vídeo real: registro, hash, ffprobe, reprodução,
eventos, coleta de frame via ffmpeg, storyboard, persistência.

**Branch:** `spike/video-engine` → fechada com commit + merge `--no-ff`
na `main` + tag anotada `v0.8.0-spike-f-video-engine`.

---

## 14. Aprovação em runtime com vídeo real

### 14.1 Quem validou

Validação executada pelo usuário em 2026-05-25 com o app SICRO Desktop
2.0 rodando via `pnpm tauri:dev`, sobre um arquivo de vídeo real.

### 14.2 Resultado declarado pelo usuário

> "O módulo Vídeo abriu corretamente dentro do SICRO; consegui
> adicionar vídeo real; o vídeo foi registrado no workspace; SHA-256
> foi calculado; ffprobe extraiu metadados técnicos; o player
> reproduziu o vídeo; play/pause funcionou; seek funcionou; timestamp
> atual e duração apareceram corretamente; consegui criar evento
> temporal; clicar no evento navegou para o timestamp correto;
> consegui coletar frame atual via FFmpeg; consegui coletar frame de
> evento; o PNG do frame abriu fora do SICRO; o sidecar JSON foi
> gerado; o storyboard exibiu os frames coletados; fechei e reabri o
> app; vídeo, eventos e storyboard persistiram; Laudo, Dossiê, Croqui
> e Importador continuaram funcionando."

### 14.3 Itens confirmados ponto a ponto

| Item | Confirmação |
|---|---|
| Módulo Vídeo abre dentro do SICRO | ✅ |
| Adicionar vídeo real (file dialog) | ✅ |
| Vídeo registrado no workspace (`videos/originais/`) | ✅ |
| SHA-256 calculado | ✅ |
| ffprobe extraiu metadados técnicos | ✅ |
| Player reproduziu o vídeo (HTMLVideoElement) | ✅ |
| play / pause | ✅ |
| seek | ✅ |
| Timestamp atual + duração visíveis | ✅ |
| Criar evento temporal | ✅ |
| Click no evento → navega para o timestamp correto | ✅ |
| Coletar frame atual via FFmpeg | ✅ |
| Coletar frame de evento | ✅ |
| PNG do frame abre fora do SICRO | ✅ |
| Sidecar JSON gerado | ✅ |
| Storyboard exibe os frames coletados | ✅ |
| Fechar e reabrir → vídeo, eventos e storyboard persistem | ✅ |
| Não-regressão — Laudo / Dossiê / Croqui / Importador | ✅ |

### 14.4 Princípio do laboratório Python honrado

O laboratório Python (`SICRO_VIDEO_LAB_RELATORIO.md` §6) decidiu
**separar player visual de verdade técnica**. O Spike F confirma essa
decisão em runtime:

- **Player visual** = HTMLVideoElement com `convertFileSrc`. Suficiente
  para reproduzir, navegar e localizar momentos de interesse no MP4
  real do usuário.
- **Verdade técnica** = ffprobe (metadados) + ffmpeg (frame extraction).
  Os frames coletados são bytes vindos do arquivo original, não
  screenshots da interface — exatamente como o laboratório
  estabeleceu.
- **`media_hash`** vincula eventos, exports e storyboard à evidência;
  paths podem mudar, o hash não.
- **`frame_index_is_estimated`** é sempre marcado como `true` quando o
  cálculo deriva de `ts × fps`, evitando interpretações ingênuas
  (especialmente para VFR).

### 14.5 Limitações remanescentes (registradas para fases futuras)

Confirmadas como aceitáveis para o fechamento deste spike e detalhadas
na §9 deste relatório:

- **Codec exótico** em AVI/MKV pode falhar no WebView (HTMLVideoElement
  exibe `MediaError.code` com hint sobre codec).
- **Frame-step** é aproximação de 1/30s (sem `requestVideoFrameCallback`
  por ora) — para análise quadro-a-quadro fina, marca evento e usa
  coleta via ffmpeg.
- **`frame_index_is_estimated` sempre `true`** — cálculo PTS-anchored
  real é spike próprio.
- **Keyframe-snap delta** do `-ss` fast seek surfaceado no sidecar e no
  card do Storyboard.
- **FFmpeg/ffprobe não bundlados** — detectados via PATH.
- **`evidence_items` ainda não recebe frames coletados** — pendência
  alinhada à do Croqui (`exports` polimórfico).
- **Vídeo copiado para o workspace** (não referenciado) — tradeoff
  integridade vs. espaço.

### 14.6 Recomendação de próximo passo

Em ordem de prioridade institucional:

1. **MVP — Video Operacional** sobre este motor: indexação completa
   frame ↔ PTS, accurate-seek opcional, edição de descrição em
   formulário dedicado, drag-to-resize na régua, atalhos completos,
   `requestVideoFrameCallback` quando disponível.
2. **Spike — Inserir storyboard no laudo**: consumir
   `VideoStoryboardFrame` → node TipTap `storyboard` (que já existe no
   Document Engine), vinculando ao `media_hash` e ao
   `evidence_item`.
3. **Spike — `exports` polimórfico**: continuar a pendência registrada
   no Croqui — aceitar `frame_png` de vídeo e PNG de croqui na mesma
   tabela.
4. **Spike — Player nativo sidecar** para vídeos cujo codec o WebView
   recusa (manter HTMLVideoElement como default; sidecar `mpv` ou
   similar como fallback).
5. **Spike — Bundling FFmpeg**: empacotar binários redistribuíveis com
   o instalador Tauri.
6. **Spike — Pagination Engine** (pendência herdada do MVP 2).

### 14.7 Decisão final

✅ **Spike F aprovado e fechado.** Pronto para commit + merge na `main`
+ tag `v0.8.0-spike-f-video-engine`. Próximo MVP/spike começa quando
você der o sinal.

---

## Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-25 | 1.0 | Spike F implementado: migration 007 (5 tabelas) + módulo `video/` Rust (probe + frame_export) + 10 Tauri commands + módulo Video frontend completo com HTMLVideoElement, Timeline pericial, Event panel CRUD, Metadata panel ffprobe, Storyboard panel. Princípio honrado: player visual ≠ verdade técnica. ffprobe / ffmpeg detectados via PATH. PNG coletado via ffmpeg, sidecar JSON ao lado, delta de keyframe-snap surfaceado. `pnpm typecheck`, `pnpm build`, `pnpm test` (24/24), `cargo check`, `cargo test` (**39/39** com 5 testes novos do módulo video) todos verdes. Pendente: validação manual com vídeo real. |
| 2026-05-25 | 1.1 | **Aprovação em runtime com vídeo real.** Usuário validou cada fluxo do pipeline pericial: registrar/abrir/reproduzir vídeo, criar evento, navegar via timeline, coletar frame atual e frame de evento via FFmpeg (PNG + sidecar JSON abriram fora do SICRO), exibir storyboard, persistir após fechar/reabrir o app. Laudo/Dossiê/Croqui/Importador sem regressão. Limitações registradas em §14.5. Spike fechado: commit `feat: validate video engine spike`, merge `--no-ff` na `main`, tag anotada `v0.8.0-spike-f-video-engine`. |
