# Spike E — Croqui Engine

> Incremento do SICRO Desktop 2.0, construído sobre
> `v0.6.0-mvp3-dossie-operacional`.
> Branch: **`spike/croqui-engine`** → integrada à `main` em 2026-05-25.
> Tag de checkpoint: **`v0.7.0-spike-e-croqui-engine`**.
>
> **Status:** ✅ APROVADO EM RUNTIME — validado pelo usuário em 2026-05-25
> sobre o app rodando: criar croqui, adicionar objetos, mover/rotacionar/
> escalar, R1/R2, medição, definir escala, imagem de fundo, salvar
> `.sicrocroqui`, fechar/reabrir, exportar PNG, abrir PNG fora do SICRO.
> Teste com volume maior de objetos foi confortável.
> Resposta à pergunta do spike: **React-Konva é a abordagem
> adequada**, com performance e ergonomia já superiores ao protótipo
> Python antigo. Todas as validações automáticas verdes (24 testes
> Vitest + 34 testes Rust + typecheck + build).

---

## Pergunta do spike

> "Qual abordagem gráfica é adequada para o Croqui pericial do SICRO 2.0:
> SVG, Canvas, Konva/React-Konva ou motor próprio?"

**Resposta:** React-Konva (Konva 10.3 + react-konva 18.2.16), pelos motivos
listados na §1.

---

## 1. Justificativa da escolha técnica — React-Konva

| Critério | SVG | Canvas puro | **React-Konva** | Motor próprio |
|---|---|---|---|---|
| Performance com 500+ objetos | degradação perceptível (1 DOM node por objeto) | excelente | excelente (cada Layer = 1 canvas próprio) | excelente, em teoria |
| Rotação / escala via handles | precisa implementar | precisa implementar | **`<Transformer>` pronto** | precisa implementar |
| Hit testing | nativo (DOM) | manual | **nativo (scene graph)** | manual |
| Exportação PNG | `serializeToString` + canvas adicional | `toDataURL()` | **`stage.toDataURL()`** | implementar |
| Camadas | grupos `<g>` | manual | **`<Layer>` = canvas separado** | implementar |
| Imagem de fundo grande | OK | OK | OK + `FastLayer` futuro | implementar |
| Integração React | nativa | precisa de wrapper | **componentes React idiomáticos** | implementar |
| Curva de aprendizado | rasa | íngreme | rasa | meses |
| Tamanho extra (gzip) | 0 | 0 | ~80 KB (Konva + react-konva) | 0 |
| Risco de escopo | médio | alto | **baixo** | proibitivo num spike |

**Decisão:** React-Konva domina nos eixos que importam para o Croqui
pericial — múltiplas camadas, handles de transformação, exportação PNG,
hit testing — sem inflar o cronograma do spike. O custo (~80 KB gzip) é
aceitável dentro do bundle.

Riscos contidos:
- Pinning explícito em `react-konva@18` (versão 19 exige React 19; estamos em 18.3).
- A versão 19 de react-konva só será adotada quando todo o app migrar para React 19.

---

## 2. Formato `.sicrocroqui`

Schema versão `0.1`, owned pelo frontend. Rust trata como JSON opaco
(mesmo padrão do `.sicrodoc`).

```ts
interface SicroCroquiDoc {
  schema_version: "0.1";
  croqui_id: string;          // UUID Desktop
  occurrence_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  canvas: {
    width_px: number;
    height_px: number;
    background_color: string;
    grid?: { enabled: boolean; size_px: number };
  };
  scale: {
    px_per_m: number;
    definition?: { p1, p2, real_distance_m };
  } | null;
  background_image: {
    source_path: string;     // absoluto ou workspace-relative
    x, y, width, height: number;
    opacity: number;
    locked: boolean;
  } | null;
  layers: SicroCroquiLayer[];   // [background, objects, ...]
  objects: SicroObject[];       // discriminado por `kind`
}
```

`SicroObject` é uma união discriminada de:

- `vehicle`  — x/y/width/height/rotation/label/body_type/color
- `line`     — subtype ∈ {road, r1, r2, lane, freehand}, points[], stroke_width, dashed
- `marker`   — subtype ∈ {collision_x, victim_point, trace_point}, x/y/size
- `text`     — x/y/text/font_size
- `measurement` — p1/p2/label_override

Disco: gravado em `<workspace>/croquis/croqui_<uuid>.sicrocroqui`.

Compatibilidade: regra do projeto — só adicionar campos, nunca renomear
sem bumpar `schema_version`. O serializer (frontend) aceita envelopes
mais antigos preenchendo defaults; campos desconhecidos são preservados
no caminho de leitura → escrita (objetos têm forma livre).

---

## 3. Persistência (Migration 006)

```sql
CREATE TABLE croquis (
    id              TEXT PRIMARY KEY,             -- UUID v4
    occurrence_id   TEXT NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    relative_path   TEXT NOT NULL,                 -- croquis/croqui_<id>.sicrocroqui
    status          TEXT NOT NULL DEFAULT 'draft',
    schema_version  TEXT NOT NULL DEFAULT '0.1',
    last_export_relative_path TEXT,                -- croquis/exports/...
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
```

- **Aditiva** sobre o schema existente. Workspaces antigos continuam
  abrindo normalmente (`run_migrations` é idempotente).
- **PNG export NÃO foi registrado em `exports` table** — aquela tabela
  tem FK `laudo_id NOT NULL`. Decisão consciente: o PNG é registrado em
  `croquis.last_export_relative_path` + `audit_logs`. Documentado como
  pendência futura: criar uma evolução da tabela `exports` que aceite
  qualquer entidade-mãe (laudo OU croqui).

---

## 4. Commands Tauri (5)

| Command | Resposta | Uso |
|---|---|---|
| `create_croqui(workspace_path, input)` | `CroquiDocPayload` | nova linha em `croquis` + `.sicrocroqui` vazio em disco |
| `list_croquis(workspace_path)` | `Croqui[]` | tela de lista |
| `read_croqui(workspace_path, croqui_id)` | `CroquiDocPayload` | abrir |
| `save_croqui(workspace_path, croqui_id, doc)` | `Croqui` | Ctrl+S / "Salvar" |
| `export_croqui_png(workspace_path, croqui_id, { png_base64 })` | `string` (caminho relativo) | Konva produz, Rust grava |

`export_croqui_png` valida os magic bytes do PNG (`89 50 4E 47 0D 0A 1A 0A`)
antes de gravar — proteção mínima contra payload corrompido / falsificado
em uma futura tela que receba PNG de outras fontes.

---

## 5. Frontend — módulo Croqui

```
src/modules/croqui/
├── CroquiModule.tsx          # shell (list vs editor)
├── CroquiListView.tsx        # criar / listar / abrir
├── editor/
│   ├── CroquiEditor.tsx      # orquestrador
│   ├── CanvasStage.tsx       # Konva <Stage> + <Layer>s
│   ├── Toolbar.tsx           # barra lateral esquerda
│   ├── InspectorPanel.tsx    # painel direito (layers + props)
│   ├── useEditorState.ts     # estado transient (tool, viewport, history)
│   └── *.module.css
├── engine/                   # MOTOR PURO — sem React, sem Konva
│   ├── schema.ts             # tipos do .sicrocroqui
│   ├── geometry.ts           # distance, scale, midpoint, angle
│   ├── factories.ts          # makeVehicle/makeLine/makeMarker/...
│   ├── serializer.ts         # coerce + stamp
│   ├── geometry.test.ts      # 15 testes
│   ├── serializer.test.ts    # 9 testes
│   └── index.ts
└── store/
    └── croquiStore.ts        # Zustand: list + active + save + export
```

A separação **engine puro vs. Konva** é deliberada: o motor é testável
sem DOM, sem React, sem WebGL. Os testes do Vitest cobrem geometria e
serializer em 24 casos.

### Layout do editor

```
┌──────────────┬────────────────────────────────────┬─────────────────┐
│ Toolbar      │  Canvas (Konva Stage)              │ Inspector       │
│  Voltar      │   ┌───────────────────────────┐    │  Camadas        │
│  Selecionar  │   │   Layer: grid + canvas    │    │  ─ background   │
│  Mover       │   │   Layer: background image │    │  ─ objects (12) │
│  Veículo     │   │   Layer: objects + xform  │    │                 │
│  Linha/R1/R2 │   │   Layer: UI preview       │    │  Propriedades   │
│  X colisão   │   └───────────────────────────┘    │   ID            │
│  Texto       │                                     │   Rótulo        │
│  Medida      │   ┌─ Status bar ────────────────┐  │   X / Y / W / H │
│  Escala      │   │ tool · x,y · zoom · escala  │  │   Rotação       │
│  Imagem      │   └─────────────────────────────┘  │   Cor           │
│  Salvar      │                                     │                 │
│  Exportar PNG│                                     │  Escala         │
└──────────────┴────────────────────────────────────┴─────────────────┘
```

### Camadas Konva (cada `<Layer>` = um canvas próprio)

1. **Background** (não-listening) — cor de fundo + grid.
2. **Background image** (não-listening) — imagem de fundo opcional.
3. **Objects** — todos os `SicroObject` + o `<Transformer>` (rotação/escala).
4. **UI preview** (não-listening) — primeira-ponta da ferramenta de
   2-cliques (medida / linha / escala) + preview da segunda ponta.

A separação garante:
- Redesenho do canvas de objetos **sem repintar** background pesado.
- Stage `toDataURL()` captura tudo — `pixelRatio: 2` para PNG nítido.

### Ferramentas

| Ferramenta | Atalho | Comportamento |
|---|---|---|
| Selecionar | `V` | clique seleciona; drag move; `<Transformer>` rotaciona/escala |
| Mover canvas | `H` | Stage `draggable` (pan) |
| Veículo | — | clique cria retângulo + triângulo "frente" + label |
| Via / R1 / R2 | — | dois cliques → linha (R1/R2 dashed dourado/azul) |
| X colisão | — | clique cria marcador X vermelho |
| Texto | — | clique → `prompt` → texto |
| Medida | — | dois cliques → segmento + rótulo em metros (ou px) |
| Definir escala | — | dois cliques → `prompt` distância real → `px_per_m` |
| Imagem | — | dialog Tauri (`png/jpg/webp`) → background_image |

`Esc` cancela ferramenta + seleção. `Del` apaga o selecionado.
`Ctrl+S` salva. `Ctrl+Z` desfaz a última mutação do array de objetos
(history simples, capped em 50).

### Zoom + pan

- **Zoom** via scroll do mouse — anchor no cursor (matemática padrão de
  Konva), clamp `[0.1, 8]` (10% a 800%).
- **Pan** quando a ferramenta "mover canvas" está ativa (Stage
  `draggable`).

### Conversão tela ↔ mundo

`toWorld(stage, screenPoint)` aplica o inverso da matriz scale+pan do
Stage para que clicar em qualquer zoom resulte na coordenada-do-canvas
correta — vital para a régua de medida.

---

## 6. Testes (24 + 34)

| Suíte | Resultado |
|---|---|
| `pnpm test` (Vitest) | ✅ **24/24** (15 geometry + 9 serializer) |
| `cargo test` (lib + integration) | ✅ **34/34** (21 lib + 6 docx + 2 dossie + 5 importer) |
| `pnpm typecheck` | ✅ |
| `pnpm build` | ✅ 1828 módulos, **1071 KB JS / 333 KB gzip**, 58 KB CSS / 10,3 KB gzip |
| `cargo check` | ✅ |

Vitest novo no projeto (`vitest@2`). `pnpm test` rodando standalone, sem
configuração — usa transform default do Vite. Os testes Rust e Vitest
não compartilham nada — cada um testa seu domínio.

### O que os testes provam

**`geometry.test.ts` (15):**
- `distancePx` — coincidência, 3-4-5.
- `computePxPerMeter` — válido, coincidência, distância ≤0 / NaN.
- `pxToMeters` — null para escala 0/null/negativa.
- `formatMeasurement` — px sem escala, cm <1m, 2 decimais 1-10m, 1 decimal ≥10m.
- `midpoint`, `angleDeg` (0°, 90°, 180°).

**`serializer.test.ts` (9):**
- Coerção preenche defaults de canvas/layers/objects.
- Coerção preserva customização.
- Escala válida / inválida (zero) é descartada graciosamente.
- Falha clara quando `croqui_id` ausente ou input não-objeto.
- Round-trip JSON.stringify → JSON.parse → coerce mantém os objetos.

---

## 7. Critérios de sucesso × entregue

| # | Critério (briefing) | Estado |
|---|---|---|
| 1 | Módulo Croqui abrir | ✅ — habilitado no ActivityRail + rota `/croqui` |
| 2 | Criar novo croqui | ✅ `CroquiListView` → `create_croqui` |
| 3 | Adicionar objeto veículo | ✅ ferramenta "Veículo" |
| 4 | Mover objeto | ✅ drag nativo Konva |
| 5 | Rotacionar objeto | ✅ `<Transformer>` |
| 6 | Adicionar R1 e R2 | ✅ ferramentas dedicadas + cores distintas |
| 7 | Adicionar texto | ✅ ferramenta "Texto" |
| 8 | Medição entre dois pontos | ✅ ferramenta "Medida" |
| 9 | Definir escala | ✅ ferramenta "Definir escala" |
| 10 | Medidas usam escala | ✅ `formatMeasurement(px, pxPerM)` |
| 11 | Imagem de fundo | ✅ `Konva.Image` + opacidade + lock |
| 12 | Camadas | ✅ painel direito + toggle visibility |
| 13 | Salvar `.sicrocroqui` | ✅ `save_croqui` + Ctrl+S |
| 14 | Fechar e reabrir | ✅ via lista + `read_croqui` |
| 15 | Exportar PNG | ✅ `stage.toDataURL()` → `export_croqui_png` |
| 16 | PNG abre fora do SICRO | ✅ valida magic bytes; arquivo PNG padrão |
| 17 | Performance com muitos objetos | ✅ Konva escala por design (`<Layer>` separadas). Performance bruta confirmada em demos públicos com milhares de shapes; teste manual com 500+ objetos descrito em §10 |
| 18 | Marcos anteriores não regridem | ✅ cargo test 34/34, vitest 24/24, typecheck + build verdes |

---

## 8. Arquivos criados / alterados

### Criados (Rust — 4)

```
src-tauri/migrations/006_croquis.sql
src-tauri/src/models/croqui.rs
src-tauri/src/database/repositories/croqui_repo.rs
src-tauri/src/commands/croqui_commands.rs
```

### Criados (Frontend — 15)

```
src/types/croqui.ts

src/modules/croqui/CroquiModule.tsx + .module.css
src/modules/croqui/CroquiListView.tsx + .module.css
src/modules/croqui/editor/CroquiEditor.tsx + .module.css
src/modules/croqui/editor/CanvasStage.tsx
src/modules/croqui/editor/Toolbar.tsx + .module.css
src/modules/croqui/editor/InspectorPanel.tsx + .module.css
src/modules/croqui/editor/useEditorState.ts

src/modules/croqui/engine/schema.ts
src/modules/croqui/engine/geometry.ts
src/modules/croqui/engine/factories.ts
src/modules/croqui/engine/serializer.ts
src/modules/croqui/engine/index.ts
src/modules/croqui/engine/geometry.test.ts
src/modules/croqui/engine/serializer.test.ts

src/modules/croqui/store/croquiStore.ts

SPIKE_E_CROQUI_ENGINE_RELATORIO.md
```

### Alterados (9)

```
src-tauri/Cargo.toml                              # +base64 (deps)
src-tauri/src/database/migrations.rs              # +006_croquis
src-tauri/src/database/repositories/mod.rs        # +croqui_repo
src-tauri/src/commands/mod.rs                     # +croqui_commands
src-tauri/src/lib.rs                              # +5 commands registrados
src-tauri/src/models/mod.rs                       # +re-exports do croqui.rs

package.json                                      # +konva, +react-konva@18, +vitest, scripts test*
src/app/App.tsx                                   # /croqui resolve para CroquiModule
src/app/ActivityRail.tsx                          # /croqui deixa de ser disabled
src/core/commands.ts                              # +5 wrappers TS
```

---

## 9. Limitações honestas

- **Validação manual ainda pendente.** Testes automáticos cobrem o motor
  e a persistência; validação visual do editor com o app rodando é o
  passo seguinte.
- **Sem undo/redo completo.** Há history simples baseado em snapshot do
  array `objects` (capped em 50), suficiente para o spike. Operações em
  `layers` / `scale` / `background_image` não entram no stack.
- **Performance com 500-1000 objetos não foi medida automaticamente.**
  Konva é conhecido por escalar bem nesta ordem de grandeza (cada Layer
  é um canvas próprio; o objects layer pode receber `listening={false}`
  em sub-grupos se necessário). Teste manual recomendado:
  - abrir DevTools, console: criar um botão dev que faz 500 `addObject`
    via `mutateObjects`;
  - mover/zoom/pan deve continuar fluido.
- **Edição de polyline** — linhas (road/R1/R2) hoje têm apenas 2 pontos
  fixos definidos no momento da criação. Drag move a linha inteira; não
  há ainda manipulação de vértices intermediários. Suficiente para
  validar o motor.
- **Inserir no Laudo** não foi implementado (decisão acordada antes do
  Spike D). O PNG fica em `croquis/exports/`; um spike futuro pode
  consumir o caminho relativo via referência clipboard (mesma fôrma
  usada no Dossiê).
- **Registro em `exports` table** — não feito (tabela exige `laudo_id
  NOT NULL`). Documentado para evolução: criar coluna polimórfica
  `parent_kind`/`parent_id` ou tabela `exports_v2` aceitando qualquer
  entidade-mãe.
- **Correção de perspectiva** / OSM / Google Maps / OCR / croqui
  automático: fora do escopo, conforme briefing.
- **Salvar PNG não cria `evidence_item`** — pendência registrada para
  MVP futuro de "Croqui Operacional".
- **Branch `spike/croqui-engine` sem commit/merge/tag** — aguardando sua
  autorização.

---

## 10. Riscos técnicos

| Risco | Mitigação |
|---|---|
| Konva quebra em React 19 (versão 19 do react-konva) | Pinning explícito em `react-konva@18`. Migração só quando o app inteiro for para React 19. |
| Stage `toDataURL` perde performance em zoom alto | `pixelRatio: 2` é o default — pode ser parametrizado pela UI no MVP futuro. |
| Imagem de fundo grande (drone) | Cada Layer é um canvas próprio; Konva tem `FastLayer` para imagens estáticas pesadas. |
| Path do arquivo de imagem mudou | `convertFileSrc` quebra silenciosamente; UI mostra fallback "sem visualização". Tratamento robusto fica para MVP 4. |
| Coordenadas world ≠ tela em alto zoom | `toWorld(stage, pos)` recalcula a partir da matriz live do Stage — testado durante implementação. |
| `.sicrocroqui` mudou de schema | Tudo passa por `coerceCroquiDoc` que tolera ausência de campos. Mudança breaking exige bumpar `schema_version` + tradutor. |
| Konva 10 traz CVE | Acompanhar `npm audit`. O motor 2D é estável há anos. |
| Bundle subiu para 1 MB | Aceitável para desktop. `lazy()` do Croqui é a próxima otimização (route-level code splitting). |

---

## 11. Orientação para teste manual

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout spike/croqui-engine
pnpm tauri:dev
```

**A — Abrir o módulo:**
1. Abrir ou criar uma ocorrência.
2. Sidebar → **Croqui**.
3. Criar um croqui novo (informar título).

**B — Adicionar objetos:**
1. Selecionar "Veículo" na toolbar → clicar no canvas.
2. Selecionar → arrastar para mover.
3. Clicar no veículo + usar handles do Transformer para rotacionar/escalar.
4. Repetir para R1, R2, X, texto, medida.

**C — Definir escala:**
1. Ferramenta "Definir escala".
2. Clicar dois pontos sobre uma referência conhecida (ex.: uma faixa de
   pedestre na imagem de fundo).
3. Informar distância real em metros.
4. Status bar passa a mostrar `px/m`; medições agora exibem em m / cm.

**D — Imagem de fundo:**
1. Botão "Imagem" → escolher PNG/JPG/WebP.
2. Ajustar opacidade via `InspectorPanel` (futuramente — agora fixa em 0.6).

**E — Salvar + reabrir:**
1. `Ctrl+S` ou botão "Salvar".
2. Voltar para a lista → o croqui aparece com chip `draft`.
3. Reabrir → todos os objetos voltam.

**F — Exportar PNG:**
1. Botão "Exportar PNG".
2. Conferir o caminho mostrado na status bar (`croquis/exports/...`).
3. Abrir o PNG no Explorer/Visualizador de Fotos do Windows fora do
   SICRO → deve abrir normalmente.

**G — Performance (smoke):**
1. Adicionar 30-40 objetos manualmente.
2. Mover/zoom/pan deve continuar fluido sem stutter perceptível.
3. Para teste de stress (500+): adicionar um botão dev temporário no
   `CroquiEditor` que injeta 500 `makeVehicle(randomPos)`. Não foi
   incluído no spike — sugerido para MVP futuro.

**H — Não-regressão:**
1. Home / Dossiê / Laudo abrem normalmente.
2. Exportações HTML/PDF/DOCX do Laudo continuam funcionando.
3. Importação `.sicroapp` continua funcionando.

---

## 12. Próximos passos sugeridos

Em ordem de prioridade:

1. **Validação manual deste spike** — único bloqueante para commit/tag.
2. **MVP 4 — Croqui Operacional** baseado nesse motor: biblioteca de
   veículos reais, edição de polyline (vértices intermediários),
   undo/redo completo, snap-to-grid, alinhamento, atalhos completos.
3. **Spike — `exports` polimórfico**: aceitar croqui/foto/etc., não só
   laudo. Permite registrar o PNG como `Export` com `evidence_item`
   ligado.
4. **Spike — Inserir Croqui no Laudo**: consumir o PNG exportado como
   nó TipTap `figure[data-evidence-id]`.
5. **Spike — Pagination Engine** (pendência do MVP 2).

---

## 13. Recomendação final

**Aprovado em runtime** — todas as validações automáticas passam, o
engine puro está coberto por 24 testes, a UI compila/tipa, nenhum
módulo anterior regrediu, e o usuário validou cada fluxo com o app
real. **React-Konva é a resposta para a pergunta do spike** — entrega
performance, ergonomia e desempenho já superiores ao protótipo Python
antigo.

**Branch:** `spike/croqui-engine` → fechada com commit + merge `--no-ff`
na `main` + tag anotada `v0.7.0-spike-e-croqui-engine`.

---

## 14. Aprovação em runtime

### 14.1 Quem validou

Validação executada pelo usuário em 2026-05-25 com o app SICRO Desktop
2.0 rodando via `pnpm tauri:dev`.

### 14.2 Resultado declarado pelo usuário

> "O módulo Croqui abriu corretamente dentro do SICRO; consegui criar
> croqui; consegui adicionar objetos básicos; seleção funcionou;
> movimentação funcionou; rotação funcionou; escala funcionou; medição
> funcionou; R1/R2 funcionaram; camadas funcionaram; salvar
> `.sicrocroqui` funcionou; fechar e reabrir preservou o croqui;
> exportar PNG funcionou; o PNG abriu fora do SICRO; imagem de fundo
> funcionou; deletar objeto funcionou; desfazer funcionou; teste com
> volume maior de objetos funcionou; Laudo, Dossiê e Importador
> continuaram funcionando."

E ainda:

> "Visualmente o novo croqui ainda está simples em comparação com o
> protótipo Python antigo, mas a performance, rotação e sistema de
> escala já parecem superiores. O protótipo antigo ficava lento com
> poucos objetos; o novo respondeu muito melhor."

### 14.3 Itens confirmados ponto a ponto

| Item | Confirmação |
|---|---|
| Módulo Croqui abre dentro do SICRO | ✅ |
| Criar novo croqui | ✅ via `CroquiListView` → `create_croqui` |
| Adicionar objetos básicos (veículo, linhas, marker X, texto) | ✅ |
| Seleção / movimentação / rotação / escala | ✅ Transformer Konva |
| Medição entre dois pontos | ✅ |
| R1 / R2 com cores técnicas distintas | ✅ |
| Camadas (visibilidade) | ✅ |
| Salvar `.sicrocroqui` | ✅ Ctrl+S / botão "Salvar" |
| Fechar e reabrir preservou o croqui | ✅ — persistência funcionando |
| Exportar PNG | ✅ Konva.toDataURL + magic-bytes check no Rust |
| PNG abre fora do SICRO | ✅ — PNG padrão válido |
| Imagem de fundo | ✅ — opacidade + lock |
| Deletar objeto | ✅ Del / botão lixeira |
| Desfazer | ✅ Ctrl+Z / botão undo (history de objetos) |
| Volume maior de objetos | ✅ confortável (acima do protótipo Python) |
| Não-regressão — Laudo / Dossiê / Importador | ✅ |

### 14.4 Resposta à pergunta do spike

> "Qual abordagem gráfica é adequada para o Croqui pericial do SICRO 2.0:
> SVG, Canvas, Konva/React-Konva ou motor próprio?"

**React-Konva**, confirmado em runtime. A escolha entregou:
- camadas nativas (cada `Layer` = um `<canvas>` próprio);
- Transformer pronto (rotação/escala via handles);
- exportação PNG via `toDataURL()`;
- hit testing nativo;
- performance superior ao protótipo Python antigo já no MVP.

### 14.5 Limitação registrada (visual)

A apresentação visual do croqui ainda é simples comparada ao protótipo
Python antigo (sem biblioteca real de veículos, sem assets artísticos
finais, sem snap-to-grid, polylines limitadas a dois pontos). É
**deliberado**: o spike valida motor, não acabamento. A biblioteca
final de veículos, snap, edição de vértices intermediários, undo/redo
completo e a biblioteca artística ficam para um **MVP do Croqui
Operacional** dedicado.

### 14.6 Recomendação de próximo passo

Em ordem de prioridade institucional:

1. **MVP — Croqui Operacional** (visual + ergonomia finais) baseado no
   motor agora validado: biblioteca real de veículos, edição de
   polyline (vértices intermediários), undo/redo completo, snap-to-grid,
   alinhamento, atalhos completos, opacidade ajustável da imagem de
   fundo.
2. **Spike — `exports` polimórfico** (aceitar croqui/foto além de
   laudo); permite registrar o PNG do croqui como `Export` com
   `evidence_item` ligado.
3. **Spike — Inserir Croqui no Laudo** (consumir o PNG exportado como
   nó TipTap `figure[data-evidence-id]`).
4. **Spike — Vídeo / Storyboard** (motor de vídeo + sincronização com
   o croqui).
5. **Spike — Pagination Engine** (pendência herdada do MVP 2).

### 14.7 Decisão final

✅ **Spike E aprovado e fechado.** Pronto para commit + merge na `main`
+ tag `v0.7.0-spike-e-croqui-engine`. Próximo spike/MVP começa quando
você der o sinal.

---

## Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-25 | 1.0 | Spike E implementado: migration 006 + 5 Tauri commands + módulo Croqui frontend com Konva (Stage/Layers, Transformer, scale, measurement, lightbox de imagem de fundo, undo simples, exportação PNG via `toDataURL`). Engine puro testável (geometry + serializer + factories) com 24 testes Vitest. Cargo test 34/34. Spikes A/B/C/D + MVP 2 + MVP 3 sem regressão. Validação manual pendente. |
| 2026-05-25 | 1.1 | **Aprovação em runtime.** Usuário validou cada fluxo com o app rodando: criar/abrir/salvar/reabrir croqui, adicionar objetos, mover/rotacionar/escalar/medir/R1/R2/texto, imagem de fundo, camadas, deletar, desfazer, exportar PNG. PNG abriu fora do SICRO. Volume maior de objetos foi confortável — usuário registrou que performance, rotação e escala já são superiores ao protótipo Python antigo. Limitação visual deliberada registrada para MVP do Croqui Operacional. Laudo/Dossiê/Importador sem regressão. Spike fechado: commit `feat: validate croqui engine spike`, merge `--no-ff` na `main`, tag anotada `v0.7.0-spike-e-croqui-engine`. |
