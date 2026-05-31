# Road Engine 2.0 — Plano de Redesign

**Data:** 2026-05-25
**Status:** plano técnico para validação. **Sem código novo no SICRO 2.0
nesta etapa.** Aguardando aprovação para iniciar Fase A.

**Pré-requisito atendido:** `ROAD_ENGINE_1_PYTHON_AUDIT.md` aprovado.

---

## 1. Resumo executivo

### Por que o motor atual falhou

O Road Engine atual (`RoadNode` em `CanvasStage.tsx`, MVP 9 R3 →
R5) modela a via como um `Konva.Line` com `strokeWidth` igual à
largura da pista e `tension` para suavizar. Esse modelo é
fundamentalmente um **stroke grosso de uma centerline** —
preserva o centro reto e suaviza apenas a aparência visual, não
a geometria. Em curvas fechadas e junções, isso quebra:

- bordas internas atravessam áreas indevidas;
- rotatórias viram polígonos serrilhados;
- marcações brancas/amarelas perdem clipping nas junções;
- a forma final não acompanha o asfalto.

Tentamos remendar (junction polygon circular, clipping por
circles, ângulo controlado, oversize de patches) — sem resolver
o problema na raiz.

### Por que o Python 1.0 desenhava melhor

Auditoria do `SICRO 1.0 Python` (`desenho/spline_via.py` +
`ui/editor_croqui.py:_desenhar_vias_multipass`) revelou **quatro
diferenças fundamentais:**

1. **Polígono ribbon, não stroke.** A via é uma cubic Bezier
   amostrada densamente, com cada amostra recebendo um offset
   perpendicular de `largura/2`. Esquerda + direita reversa = um
   polígono fechado. O Tkinter desenha esse polígono com
   `smooth=True`, dando um asfalto contínuo e curvo de verdade.
2. **Mascaramento geométrico real.** Para decidir se uma marcação
   é desenhada num ponto, o Python calcula a distância desse
   ponto ao centerline de **toda outra via** próxima. Se a
   distância for menor que a meia-largura dela, o ponto está
   "dentro" da outra via — não desenha. O nosso clipping
   atual usa **círculos** nas interseções, o que é uma
   aproximação grosseira.
3. **Rotatória é primitiva geométrica.** Centro + raio + largura
   + duas elipses concêntricas. O Konva atual aproxima rotatória
   como polyline fechada — gera serrilhamento.
4. **OSM → Bezier 4-pontos.** Cada way OSM é reduzido a 4 pontos
   de controle (A, B + C1, C2 derivados das tangentes inicial e
   final + comprimento do arco / 3). O nosso conversor atual
   preserva todos os nós OSM, herdando o trêmulo do dado bruto.

### Direção nova

Construir um **Road Engine 2.0** que:

- modela cada via como `RoadMesh` (centerline + ribbon + edges +
  marcações + máscaras), calculado a partir do `SicroRoadObject`;
- Konva apenas **renderiza o mesh pronto** — não calcula
  geometria;
- adota multi-pass global (calçadas → asfalto → junction masks →
  bordas → marcações → divisórias → crosswalks) em vez de render
  per-object;
- adiciona primitiva `Roundabout` dedicada (não polyline);
- OSM adapter 2.0 produz Bezier 4-pontos.

### O que será substituído

- `RoadNode` (componente Konva atual) → `RoadMeshNode` renderer
  multi-pass.
- `clipPolylineAgainstCircles` → `clipMarkingsByJunctions`
  (distância geométrica a outros centerlines).
- `osmDatasetToRoadsFit` (preserva todos os nós) →
  `osmAdapter.convertOsmToBezierRoads` (4-point Bezier).
- `junctionPolygon` parallelogram → `RoadJunctionMask` derivado
  da malha real.

### O que será preservado

- **Schema `.sicrocroqui` v0.3** continua válido. Croquis antigos
  abrem sem mudança.
- **`SicroRoadObject`** continua existindo. Recebe campos
  opcionais aditivos (`bezier?`, `is_roundabout?`, etc.).
- **`makeRoad`, `ROAD_STYLES`** continuam — o road-v2 lê dos
  mesmos presets.
- **Importar Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem,
  Home, Importador** — não tocados.
- **Toolbar e fluxo do perito** — botões e modais permanecem;
  só o que vai para a tela muda.

---

## 2. Princípio central

> A via deixa de ser renderizada como `Konva.Line(stroke)` grosso.
>
> A via passa a ser **calculada como geometria própria** num
> módulo independente de UI:
>
> - centerline (lista densa de pontos amostrada da Bezier ou da
>   polyline original);
> - borda esquerda + borda direita (offset perpendicular);
> - polígono de asfalto (left + right.reverse → ring fechado);
> - segmentos de marcação central + lane dividers + crosswalks;
> - junction masks (zonas geométricas de conflito com outras
>   vias);
> - rotatórias (objeto separado com cx, cy, r, width).
>
> **Konva passa a apenas renderizar o mesh calculado.** A
> camada de render não conhece Bezier, offset, tangente ou OSM
> — só recebe polígonos e polylines prontos.

---

## 3. Arquitetura proposta

Novo módulo, isolado em pasta própria, framework-agnostic
(nenhum import do `react-konva` em arquivos que não sejam o
adapter de renderer):

```
src/modules/croqui/engine/road-v2/
├── types.ts             — tipos puros (RoadMesh, RoadRibbon, ...).
├── geometry.ts          — helpers geométricos (offset, distância,
│                          AABB, perpendicular, normalização).
├── bezier.ts            — cubic Bezier (sample, tangentAt,
│                          hermite-to-bezier convert).
├── ribbon.ts            — ribbon polygon = faixa_para_canvas
│                          (port direto do Python).
├── junctions.ts         — pre-compute centerlines + AABB;
│                          clipMarkingsByJunctions = _segs/_em_outra.
├── roundabout.ts        — primitiva Roundabout + mesh dedicado.
├── markings.ts          — center line + lane dividers + crosswalks
│                          (samples + dash pattern).
├── osmAdapter.ts        — OSM way → Bezier 4-pontos.
├── rendererAdapter.ts   — converte RoadMesh para coisas que o
│                          Konva entende (sem importar Konva
│                          aqui — devolve lista de "shape descs"
│                          que o RoadMeshNode renderiza).
├── debug.ts             — overlay de debug (centerline, edges,
│                          masks, AABB) — opt-in.
├── index.ts             — barril público.
└── __tests__/
    ├── bezier.test.ts
    ├── ribbon.test.ts
    ├── junctions.test.ts
    ├── roundabout.test.ts
    ├── osmAdapter.test.ts
    └── fixtures/        — fixtures sintéticas (rua reta, curva
                            fechada, rotatória, OSM Macapá-like).
```

### Responsabilidade resumida por arquivo

- **types.ts** — só tipos. Nenhuma lógica. Visível por todos.
- **geometry.ts** — helpers puros (`distSq`, `perpendicular`,
  `aabbOf`, `pointInAabb`, `pointToSegmentDist`).
- **bezier.ts** — `sampleCubicBezier(A, C1, C2, B, N)`,
  `tangentAt(samples, idx)`, `arcLength(samples)`,
  `hermiteToBezier({A, B, tanA, tanB, arc})`.
- **ribbon.ts** — `buildRibbonPolygon(centerline, halfWidth)`:
  para cada sample, computa normal perpendicular, gera vértices
  esquerdo e direito, concat → polígono fechado.
- **junctions.ts** — `buildContext(roads)`: pré-computa
  centerlines + meia-largura + AABB de cada via. Exporta
  `clipMarkingsByJunctions(marking_samples, road_id, context)`:
  devolve os "runs" da marcação que NÃO caem dentro de outra via.
- **roundabout.ts** — `RoundaboutMesh` (anel externo + ilha
  interna + borda + entradas conectáveis).
- **markings.ts** — produz `RoadMarkingSegment[]` para center,
  lanes, crosswalks; consome as runs vindas de `junctions.ts`.
- **osmAdapter.ts** — `convertOsmToBezierRoads(ways, nodes,
  centre, options)`: cada way → SicroRoadObject com `bezier:
  {cx1, cy1, cx2, cy2}` + label/direction/lane_count;
  `junction=roundabout` ou ring fechado → Roundabout dedicada.
- **rendererAdapter.ts** — recebe `RoadMesh[]`, devolve "shape
  descriptors" prontos para Konva. Não importa Konva (mantém
  testabilidade pura). O RoadMeshNode component em
  `editor/CanvasStage.tsx` mapeia descriptors → JSX `<Line />`,
  `<Circle />`, `<Path />`.
- **debug.ts** — `buildDebugOverlay(mesh): DebugShape[]`. Toggle
  via `editor.debug.showRoadMesh`.
- **index.ts** — re-exporta API pública.

---

## 4. Tipos principais

```ts
/** Ponto 2D em coords-mundo do croqui (pixels do canvas atual). */
export interface Pt { x: number; y: number; }

/**
 * Centerline pronta para virar ribbon. Sempre densa (>= 24 amostras
 * para Bezier; pode ser igual à polyline original para roads sem
 * `bezier`).
 */
export interface RoadCenterline {
  /** N pontos amostrados ao longo da via. */
  samples: Pt[];
  /** Comprimento total acumulado (pixels). */
  length_px: number;
  /** Bounding box AABB (para fast-reject no junction clip). */
  aabb: { min_x: number; min_y: number; max_x: number; max_y: number };
  /** Tangente unitária por sample (mesmo índice que `samples`). */
  tangents: Pt[];
}

/**
 * Polígono ribbon = pista de asfalto. Sequência fechada de vértices
 * (esquerda → direita reversa). `Konva.Line` desenha com
 * `closed=true, fill=cor`.
 */
export interface RoadRibbon {
  vertices: Pt[];          // M = 2N vértices (N de cada lado).
  half_width_px: number;   // usado por máscara / debug.
}

/** Polyline aberta da borda (esquerda ou direita). */
export interface RoadEdge {
  samples: Pt[];           // antes do clipping.
  side: "left" | "right";
}

/**
 * Um run de marcação central / lane divider que sobreviveu ao
 * clipping. Já em coords-mundo. O renderer concatena em
 * `Konva.Line(points=flat(samples))` com a cor / dash desejada.
 */
export interface RoadMarkingSegment {
  samples: Pt[];
  kind: "center" | "lane" | "crosswalk";
  /** "white" | "yellow" — cor final já resolvida (após auto/override). */
  color: string;
  /** Dash pattern em pixels. `null` = sólido. */
  dash: [number, number] | null;
  /** Stroke width final, em pixels. */
  width: number;
}

/** Zona de conflito com outra via (debug / mask). */
export interface RoadJunctionMask {
  other_road_id: string;
  /** Sub-segmentos da minha centerline que caem dentro da outra. */
  inside_ranges: Array<{ start_idx: number; end_idx: number }>;
}

/**
 * Resultado completo do build de UMA via. O RoadMeshNode consome
 * esta estrutura e desenha. Não há "Konva" aqui.
 */
export interface RoadMesh {
  road_id: string;
  centerline: RoadCenterline;
  ribbon: RoadRibbon;
  /** Calçada / curb opcional — polygon ao redor do ribbon. */
  curb_ribbon?: RoadRibbon;
  edges: { left: RoadEdge; right: RoadEdge };
  /** Bordas após clipping contra outras vias. */
  edge_segments: { left: RoadMarkingSegment[]; right: RoadMarkingSegment[] };
  /** Center line após clipping. */
  center_segments: RoadMarkingSegment[];
  /** Lane dividers após clipping. */
  lane_segments: RoadMarkingSegment[];
  crosswalks: RoadMarkingSegment[];
  /** Lista de máscaras aplicadas (para debug). */
  junction_masks: RoadJunctionMask[];
  /** `true` se for caminho fechado (rotatória / retorno). */
  is_closed: boolean;
  /** Cores resolvidas. */
  asphalt_color: string;
  curb_color: string;
  /** AABB do ribbon (para selection / hit-test). */
  aabb: RoadCenterline["aabb"];
  /** Warnings da construção (debug). */
  warnings: string[];
}

/** Contexto que `buildRoadMesh` precisa para clipping. */
export interface RoadBuildContext {
  /** Todas as vias do doc, em forma normalizada. */
  roads: Array<{
    road_id: string;
    centerline: RoadCenterline;
    half_width_px: number;
    is_closed: boolean;
  }>;
  /** Roundabouts (pré-computados — máscara é disco). */
  roundabouts: Array<{
    roundabout_id: string;
    cx: number;
    cy: number;
    r_outer_px: number;
  }>;
}

/** Opções de geração do mesh. */
export interface RoadBuildOptions {
  /** Amostras por via (24 → ribbon vísivel suficiente, 48 → liso). */
  samples_per_road: number;
  /** Mostrar centerline/edges/masks no overlay debug. */
  debug: boolean;
}

/** Rotatória — primitiva separada. */
export interface RoundaboutMesh {
  roundabout_id: string;
  cx: number;
  cy: number;
  r: number;
  width: number;
  asphalt_color: string;
  curb_color: string;
  /** Anel externo (calçada) — radial offset = `r + width/2 + curb_w`. */
  curb_radius?: number;
  /** Ilha verde central — sempre `r - width/2`. */
  inner_radius: number;
  /** Borda externa (polyline circular) já clipada contra entradas. */
  outer_border: RoadMarkingSegment;
  /** Borda interna (polyline circular ao redor da ilha verde). */
  inner_border: RoadMarkingSegment;
  /** Metadados (OSM `junction=roundabout` etc.). */
  metadata_json?: string;
}
```

---

## 5. Portabilidade do Python

| Conceito Python (origem) | Equivalente TS road-v2 (destino) | Prioridade | Risco | Observações |
|---|---|---|---|---|
| `bezier_pontos(ax, ay, cx1, cy1, cx2, cy2, bx, by, n)` (`spline_via.py:20`) | `bezier.ts:sampleCubicBezier(A, C1, C2, B, n)` | **CRÍTICA** | baixo | math idêntica |
| `nova_spline(ax, ay, bx, by, larg)` (`spline_via.py:39`) | `osmAdapter.ts:hermiteToBezier` + `makeRoad` | **CRÍTICA** | baixo | replica controles a 1/3 |
| `bordas_canvas(el, n=30)` (`spline_via.py:92`) | `ribbon.ts:buildEdges(centerline, halfWidth)` | **CRÍTICA** | baixo | offset com perpendicular |
| `faixa_para_canvas(el, n=28)` (`spline_via.py:154`) | `ribbon.ts:buildRibbonPolygon(centerline, halfWidth)` | **CRÍTICA** | baixo | left + right.reverse |
| `faixa_offset(el, extra_m, n=28)` (`spline_via.py:122`) | `ribbon.ts:buildCurbRibbon(centerline, halfWidth, extra)` | alta | baixo | mesma matemática + extra |
| Tkinter `create_polygon(... smooth=True)` | `Konva.Line(closed=true, fill=cor, strokeWidth=0)` sobre samples DENSOS | **CRÍTICA** | médio | Konva não tem `smooth=True`; compensamos amostrando mais (N=48-64) |
| `_em_outra(wx, wy, meu_vi)` (`editor_croqui.py:2851`) | `junctions.ts:isPointInsideOtherRoad(pt, ownId, ctx)` | **CRÍTICA** | médio | distância ao segmento + AABB prefilter |
| `_segs(pts_flat, meu_vi)` (`editor_croqui.py:2868`) | `junctions.ts:clipPolylineToOutside(polyline, ownId, ctx)` | **CRÍTICA** | médio | divide em runs |
| `_segs_circ(circ_flat)` (`editor_croqui.py:2885`) | `junctions.ts:clipCircularBorder(samples, ctx)` | alta | médio | usado por bordas de rotatória |
| `_desenhar_vias_multipass` (`editor_croqui.py:2810`) | `rendererAdapter.ts` + `RoadMeshNode` com passes globais | **CRÍTICA** | médio | reordenar render em CanvasStage |
| `_rotatoria_da_way(v, lat, lon, raio_cena)` (`osm_via.py:230`) | `osmAdapter.ts:wayToRoundabout(way, nodes, ctx)` | alta | baixo | centroide + raio médio |
| `_pontos_para_spline(pts, larg, ...)` (`osm_via.py:169`) | `osmAdapter.ts:polylineToBezier(metric_points, ...)` | **CRÍTICA** | baixo | hermite→bezier; controles em arc/3 |
| `_projetar(lat, lon, lat0, lon0)` (`osm_via.py:60` / `osm_nucleo.py`) | já temos em `engine/coordinates.ts:bboxFromCenterRadius` + projeção métrica em `osm.ts` | já portado | nenhum | reutilizar |
| `_clipar_no_raio(pts, raio)` (`osm_via.py:87`) | `osmAdapter.ts:clipPolylineToRadius(metric_points, r)` | alta | baixo | port direto |
| Tangente inicial / final (`osm_via.py:198-208`) | `bezier.ts:fitTangents(samples)` | **CRÍTICA** | baixo | já parte do hermite-to-bezier |
| Dict-based "elementos" (Python) | NÃO portar | — | — | mantemos `SicroRoadObject` |
| `via_elementos.py` (renderer rectangle antigo) | NÃO portar | — | — | path legado do Python |

---

## 6. RoadMesh pipeline

```
                  ┌─ SicroCroquiDoc.objects[]  (entrada)
                  │
              ┌───┴───────────────────────────────┐
              │ Para cada road / roundabout       │
              └───┬───────────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │ normalizeRoadInput│  • Detecta is_bezier vs polyline.
        │  (osmAdapter +    │  • Resolve road_style → preset.
        │   types)          │  • Resolve markings.color.
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │ buildCenterline   │  • Bezier roads: sampleCubicBezier(A,C1,C2,B,N=48).
        │  (bezier.ts)      │  • Polyline roads: Catmull-Rom resample para N.
        │                   │  • Devolve RoadCenterline (samples, tangents, AABB).
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │ buildRibbon       │  • offset esquerdo + offset direito por sample.
        │  (ribbon.ts)      │  • left + right.reverse → polígono fechado.
        │                   │  • também produz RoadEdge[] esquerda/direita.
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │ buildContext      │  • Pré-computa centerlines + AABBs de TODAS as
        │  (junctions.ts)   │    vias / rotatórias do doc. Cache por frame.
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────────────────┐
        │ clipMarkingsByJunctions       │  • Para cada sample da centerline,
        │  (junctions.ts)               │    borda esquerda, borda direita,
        │                               │    lane divider, marcação central:
        │                               │    se cai dentro de outra via → drop.
        │                               │  • Saída: lista de runs.
        └─────────┬─────────────────────┘
                  │
        ┌─────────▼─────────┐
        │ buildMarkings     │  • Aplica cor / dash conforme markings + style.
        │  (markings.ts)    │  • Produz RoadMarkingSegment[] por kind.
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │  RoadMesh         │  ← saída final, framework-agnostic
        └─────────┬─────────┘
                  │
                  ▼ (apenas no React)
        ┌──────────────────┐
        │ RoadMeshNode     │  • Mapeia RoadMesh → JSX Konva.Line + Konva.Group.
        │  (CanvasStage)   │  • Multi-pass GLOBAL (todas as vias antes do
        │                  │    próximo pass — ordem garantida).
        └──────────────────┘
```

**Pontos críticos do pipeline:**

- **Cache por frame.** `buildContext` é caro (O(N)) — calcular uma
  vez por re-render do CanvasStage, não uma vez por via.
- **Pipeline puro.** Cada etapa consome o input e devolve output
  imutável. Facilita testes unitários.
- **RoadMesh é serializável (JSON).** Útil para debug + futuro
  cache em disco.

---

## 7. Render multipass

Hoje o `CanvasStage` renderiza cada `RoadObject` isoladamente
dentro do seu próprio `<Group>`, então a ordem é determinada pela
posição na lista `doc.objects`. Para que o mascaramento funcione,
**todas as calçadas precisam ser desenhadas antes de qualquer
asfalto**, e **todos os asfaltos antes de qualquer marcação**.

### Passos do novo renderer

```
Layer "fundo" (existe hoje)
  Pass 0: canvas background color + grid

Layer "imagem de fundo" (existe hoje)
  Pass 1: background image (drone, foto do dossiê)

Layer "vias" (NOVO — substitui o atual layer de objects para roads)
  Pass 2: calçadas/curbs       — para cada road com curb.enabled:
                                 Konva.Line(closed, fill=curb.color)
                                 sobre curb_ribbon.vertices.
                                 Roundabouts: outer ring.
  Pass 3: asfalto              — para cada road:
                                 Konva.Line(closed, fill=asphalt) sobre
                                 ribbon.vertices.
                                 Roundabouts: outer disc.
  Pass 4: junction masks       — opcional. Quando um par de roads
                                 atravessa o mesmo ponto e ambos
                                 desenham asfalto, o asfalto já cobre
                                 o conflito (porque é polygon fill).
                                 Mas aqui podemos pintar uma
                                 sobreposição extra fina se a cor de
                                 asfalto for diferente.
  Pass 5: ilha verde rotatória — Konva.Circle dentro do anel.
  Pass 6: bordas externas      — para cada road, edge_segments.left
                                 + edge_segments.right (já clipadas).
                                 Cor branca. Konva.Line(stroke=...,
                                 strokeWidth=2).
                                 Roundabouts: outer_border + inner_border.
  Pass 7: marcações centrais   — para cada road, center_segments.
                                 Cor amarela/branca conforme
                                 markings.color resolvida.
                                 Dash pattern conforme center_line style.
  Pass 8: lane dividers        — só onde lane_count > 1.
  Pass 9: crosswalks           — listras perpendiculares.

Layer "objetos" (existe hoje — vehicle, marker, text, measurement)
  Pass 10: objetos periciais

Layer "ui transitoria"
  Pass 11: selection handles + transformer
  Pass 12: debug overlay (centerline, edges, mask zones)
```

### Por que multi-pass global é superior

- **Mascaramento correto.** As bordas e marcações de via A
  desenhadas DEPOIS do asfalto de via B garantem que a borda de A
  não "vaze" no asfalto de B. Quando o renderer é per-object, A
  pode ser desenhada inteira antes de B existir — perdemos a
  ordem.
- **Conflitos resolvidos por geometria, não por z-index.** Não
  precisamos hackear `zIndex` ou re-ordenar `doc.objects`.
- **Equivalente ao Python.** O `_desenhar_vias_multipass` faz
  exatamente isso. Replicar a estratégia replica o resultado.

### Como implementar no react-konva

Cada Pass vira um `<Group>` distinto no `Layer "vias"`. Dentro
de cada `<Group>`, mapeamos por `doc.objects.filter(isRoad)` e
emitimos as shapes do mesh para esse pass. A ordem dos `<Group>`
no JSX define a ordem de pintura.

---

## 8. Rotatória

### Schema

Nova `kind` no `SicroObjectKind`:

```ts
kind: "roundabout"
```

Schema do objeto (aditivo — `roundabout` é um novo membro do
union `SicroObject`):

```ts
interface SicroRoundaboutObject extends SicroObjectBase {
  kind: "roundabout";
  cx: number;
  cy: number;
  r: number;                // raio do centro do anel
  width: number;            // largura do anel (pavimento)
  curb?: RoadCurb;          // mesmo tipo de RoadObject
  surface: RoadSurface;
  /** Cor da borda branca (default white). */
  border_color?: string;
  /** Cor da ilha central (default verde forte). */
  inner_color?: string;
  /** Opcional — fragmentos de entrada que se conectam. */
  entries?: Array<{
    /** Road id que se conecta. */
    road_id: string;
    /** Ângulo de chegada em graus (0 = leste, 90 = norte). */
    azimuth_deg: number;
  }>;
  metadata_json?: string;
}
```

### Detecção

- `way.tags.junction === "roundabout"` → roundabout.
- `way.node_refs[0] === way.node_refs[N-1]` (ring fechado) e
  geometria aproximadamente circular (raio médio com desvio < 20%)
  → roundabout.
- Caso ambíguo (anel não-circular) → fica como `road` com
  `closed_path: true`.

### Mesh + render

`roundabout.ts:buildRoundaboutMesh(obj, ctx) → RoundaboutMesh`:

- `inner_radius = r - width/2`
- `outer_radius = r + width/2`
- `curb_radius = outer_radius + curb.width` (se curb enabled)
- `outer_border`: 72 amostras `(cx + cos(θ)·outer_radius, cy +
  sin(θ)·outer_radius)`, clipadas contra ways que conectam
  (entries) — `_segs_circ`.
- `inner_border`: 72 amostras no raio interno, sem clipping.

Render (passes 2/3/5/6):

- Pass 2 (curb): `Konva.Circle` com raio `curb_radius`, fill
  curb.color.
- Pass 3 (asfalto): `Konva.Circle` raio `outer_radius`, fill
  asphalt.
- Pass 5 (ilha): `Konva.Circle` raio `inner_radius`, fill verde.
- Pass 6 (borda externa): `Konva.Line(samples)` em outer_border
  (já clipada).
- Pass 6 (borda interna): `Konva.Line(samples)` em inner_border.
- **Sem centerline**, **sem marcações**, **sem lane dividers**.

### Conexões com entradas

`entries[]` carrega `road_id + azimuth_deg`. Não precisamos render
seta — apenas marca metadado para que `clipCircularBorder` saiba
onde fazer "buraco" na borda externa.

---

## 9. OSM Adapter 2.0

### Pipeline

```
OSM way (lon/lat polyline) + tags
  │
  ▼ projeção métrica local (cos(lat) corrigida)
  │
  ▼ clipPolylineToRadius (port de _clipar_no_raio)
  │
  ▼ fitMetricToCanvas (escala uniforme + centralizar) — já temos
  │
  ▼ polylineToBezier (port de _pontos_para_spline):
       A = pts[0], B = pts[-1]
       arc_length = soma dos segmentos
       tan_A = unit(pts[1] - pts[0])
       tan_B = unit(pts[-1] - pts[-2])
       sc = arc_length / 3
       C1 = A + tan_A · sc
       C2 = B - tan_B · sc
  │
  ▼ SicroRoadObject {
       kind: "road",
       points: [Ax, Ay, Bx, By],        // SÓ ÂNCORAS
       bezier: { cx1, cy1, cx2, cy2 },  // CONTROLES (campo NOVO)
       road_style: highway → preset,
       lane_count: lanes || preset.lane_count,
       direction: oneway → "one_way" | "two_way",
       label: name || ref,
       subtype: "osm_way",
       metadata_json: { source: "osm", osm_id, raw_tags, ... },
    }
  │
  ▼ buildCenterline → sampleCubicBezier (no novo road-v2)
  │
  ▼ RoadMesh
```

### Por que não preservar todos os nós OSM

O OSM mapeia ruas urbanas com 5-30 nós por quarteirão. Esses nós
servem ao roteamento (cada esquina precisa de um nó) e à
representação topológica, **não** à estética da forma. Quando
amostramos a centerline preservando todos os nós:

- pequenos desvios de mapeamento aparecem como ondulações;
- esquinas urbanas viram zigzags sutis;
- as bordas offset herdam os zigzags amplificados pela meia-largura;
- o ribbon polygon mostra dentes e protuberâncias.

A redução para 4 pontos Bezier (A, B, C1, C2) faz com que **a
forma final** seja uma curva matemática suave — o que o usuário
deseja para um croqui técnico (não um mapa exato).

Para ways realmente curvas (rotatórias, curvas longas), uma
única Bezier pode não capturar toda a curvatura. Estratégia
opcional:

- Se `arc_length > limiar` e o way tem `> 6 nós` com curvatura
  significativa, **dividir** em 2 ou 3 Bezier consecutivas que
  compartilham endpoints e tangentes (mantém continuidade C1).

Decisão MVP: **uma Bezier por way**. Se a validação visual com o
local do usuário mostrar perda de detalhe importante, adicionar
split em rodada futura.

---

## 10. Comparação visual esperada

Cenários que **devem** ficar visualmente melhores após Road
Engine 2.0:

| Caso | Hoje (R5) | Esperado (v2) |
|---|---|---|
| Rua reta | ok | ok (sem regressão) |
| Curva suave | stroke distorce, edge pode atravessar | ribbon polygon suave; bordas paralelas |
| Curva fechada | bordas internas atravessam, distorção | ribbon segue a Bezier; curvas mantêm forma |
| Cruzamento X (perpendicular) | junction polygon paralelogramo + clip circular | asfalto cobre conflito por preenchimento; bordas clipam por geometria real |
| Cruzamento T | igual cruzamento X | bordas da via "tronco" não atravessam pista da via "perpendicular" |
| Entroncamento Y | junction polygon ruim em ângulos rasos | mask geométrico por distância ao centerline — funciona em qualquer ângulo |
| Rotatória | polyline fechada com tension, polígono serrilhado | dois Konva.Circle concêntricos → círculo real |
| Rotatória com entradas | bordas das entradas atravessam o anel | `_segs_circ` clipa o anel onde as entradas chegam |
| OSM do local do usuário | ondulações + linhas atravessando | 4-point Bezier limpa + mask geométrico |
| Via OSM = via manual visualmente | já está paritário desde R3 | continua paritário — mesma pipeline |

---

## 11. Estratégia de migração

### Princípios

1. **Schema `.sicrocroqui` v0.3 continua válido.** Croquis
   salvos antes do v2 abrem normalmente.
2. **Adições são opcionais e aditivas.** `bezier?` em
   `SicroRoadObject`; novo `kind: "roundabout"`; novo `entries?`
   em rotatória.
3. **`SicroRoadObject` permanece como é.** A v2 lê dele e
   constrói `RoadMesh` em runtime.
4. **Feature flag.** Adicionar
   `view_settings.road_engine_version?: "v1" | "v2"`.
   - Default v2 para docs novos.
   - Docs antigos: detectar se contêm `bezier` ou
     `kind: "roundabout"` → v2; senão v1 default.
   - Toolbar tem toggle visível para switch v1↔v2 enquanto
     houver paralelo (a validação visual final remove o v1).

### Plano de coexistência v1 ↔ v2

Durante as fases A-G, **as duas pipelines coexistem**. O
`CanvasStage` decide qual usar via flag. Permite:

- Comparar v1 e v2 lado-a-lado no mesmo croqui.
- Reverter rapidamente se v2 introduzir regressão.
- Validação visual incremental.

Após Fase I (aprovação), v1 é removido em uma rodada de cleanup
(deixar comentado por mais uma rodada, depois deletar).

### Compat com croquis antigos

Roads salvos como polyline N-pontos (sem `bezier`) → v2 trata
como centerline polyline (sem refit) e gera ribbon a partir
dela. Visual fica IGUAL ao stroke atual em retas; ligeiramente
melhor em curvas suaves; pior em curvas muito fechadas (porque
o stroke escondia a self-intersection — o polygon revela).

Estratégia de "upgrade" opcional: botão "Atualizar via para
Bezier" no Inspector — converte polyline para 4-point Bezier
via `polylineToBezier`. Não-destrutivo (preserva polyline em
metadata para rollback).

---

## 12. Plano de implementação em fases

Cada fase é pequena, validável independentemente, e termina com
testes + critério de sucesso explícito. **Nenhuma fase quebra
módulos não relacionados.**

### Fase A — Tipos + geometry core

**Objetivo:** estrutura de tipos + helpers geométricos puros,
sem nenhuma integração no Konva.

**Arquivos:**
- `road-v2/types.ts`
- `road-v2/geometry.ts`
- `road-v2/__tests__/geometry.test.ts`

**Conteúdo:**
- Todos os tipos do §4 deste plano.
- `perpendicular(tan: Pt): Pt`
- `unitVector(a: Pt, b: Pt): Pt`
- `pointToSegmentDist(p: Pt, a: Pt, b: Pt): number`
- `aabbOfSamples(samples: Pt[]): AABB`
- `intersectAabb(a: AABB, b: AABB): boolean`

**Testes:** perpendicular roda 90°; distance to segment com
casos (ponto antes/no/depois do segmento); AABB sanity.

**Critério de sucesso:** typecheck verde; ≥ 15 testes verdes;
nenhum arquivo de UI tocado.

---

### Fase B — Bezier + ribbon polygon

**Objetivo:** geometria Bezier + ribbon polygon (port do Python).

**Arquivos:**
- `road-v2/bezier.ts`
- `road-v2/ribbon.ts`
- `road-v2/__tests__/bezier.test.ts`
- `road-v2/__tests__/ribbon.test.ts`

**Conteúdo:**
- `sampleCubicBezier(A, C1, C2, B, n): Pt[]`
- `tangentAt(samples, idx): Pt`
- `arcLength(samples): number`
- `hermiteToBezier({A, B, tanA, tanB, arc_length}): { C1, C2 }`
- `buildRibbonPolygon(centerline, half_width): RoadRibbon`
- `buildEdges(centerline, half_width): { left, right }`

**Testes:**
- Bezier reta (A→B com C1, C2 a 1/3 e 2/3) preserva linearidade.
- Bezier curva produz amostras numa curva suave (verificar
  smoothness via diferenças finitas).
- Ribbon de centerline reta = retângulo.
- Ribbon de centerline curva preserva meia-largura em cada
  sample (medida de cada vértice ao centerline correspondente).
- Self-intersection NÃO detectada para curvas suaves
  (`tension ≤ 0.5`).
- Edges são paralelas à centerline (offset constante).

**Critério de sucesso:** ≥ 12 testes; ribbon de 100 pontos
roda em < 1 ms; sem dependência de Konva ou React.

---

### Fase C — RoadMeshNode (renderer da via única)

**Objetivo:** desenhar UMA road usando o ribbon polygon, sem
multi-pass nem mask. Apenas substituir o stroke atual por
polygon fill para CADA via isoladamente.

**Arquivos:**
- `road-v2/rendererAdapter.ts`
- `editor/RoadMeshNode.tsx` (novo)
- alterações pequenas em `CanvasStage.tsx`
- `road-v2/__tests__/rendererAdapter.test.ts`

**Conteúdo:**
- `buildMeshFromRoad(obj: SicroRoadObject, ctx?): RoadMesh`
  (sem clipping ainda — `ctx` opcional).
- `RoadMeshNode` recebe `mesh`, renderiza:
  - `Konva.Line` closed polygon (asfalto)
  - `Konva.Line` para cada edge (sem clipping)
  - `Konva.Line` para center marking (sem clipping)
- Feature flag `road_engine_version` decide quando usar
  RoadMeshNode vs RoadNode.

**Testes:**
- buildMeshFromRoad de SicroRoadObject reto → mesh com
  retângulo.
- Snapshot do mesh para uma via-padrão.

**Critério de sucesso:** alternando o flag, o usuário vê
diferença visual (stroke vs polygon) mas o app continua
funcionando. Sem regressão em testes anteriores.

---

### Fase D — Substituir renderer de roads no CanvasStage

**Objetivo:** ativar v2 como default e fazer todas as roads
usarem o RoadMeshNode quando o flag estiver "v2".

**Arquivos:**
- `editor/CanvasStage.tsx` (deletar RoadNode call quando v2;
  manter v1 atrás do flag).

**Conteúdo:**
- Bifurcação clara no render: `road_engine_version === "v2"
  ? <RoadMeshNode> : <RoadNode>`.
- Toolbar ganha botão "Engine: v1 / v2" (debug; remover na
  Fase I).

**Testes:**
- Vitest snapshot da árvore Konva (mock react-konva) com flag
  v1 vs v2.
- Outros 272 testes continuam verdes.

**Critério de sucesso:** flag funciona; v2 renderiza vias retas e
levemente curvas BEM; templates antigos continuam usáveis.

---

### Fase E — Rotatória primitiva

**Objetivo:** novo `kind: "roundabout"` no schema + renderer
dedicado.

**Arquivos:**
- `engine/schema.ts` (aditivo: SicroRoundaboutObject + kind union)
- `engine/serializer.ts` (coercer)
- `road-v2/roundabout.ts`
- `editor/CanvasStage.tsx` (case "roundabout")
- `road-v2/__tests__/roundabout.test.ts`
- `engine/serializer.test.ts` (round-trip da nova kind)

**Conteúdo:**
- buildRoundaboutMesh (`cx, cy, r, width` → 2 círculos + bordas).
- Render: 4 passes dedicados (curb / asphalt / island / borders).
- Inspector ganha aba quando selecionada.

**Testes:**
- Mesh roundabout com r=30, width=8 produz inner_radius=26,
  outer_radius=34.
- Coercer round-trips a rotatória.
- Roundabout legacy (criada antes do v2) ainda como road com
  `closed_path: true` continua funcionando.

**Critério de sucesso:** rotatória "redonda de verdade" no
canvas; teste de paridade entre v1 (closed road) e v2
(roundabout primitive).

---

### Fase F — Junction masks

**Objetivo:** mascaramento geométrico de bordas + marcações
contra outras vias. Port de `_segs` + `_em_outra`.

**Arquivos:**
- `road-v2/junctions.ts`
- alteração em `road-v2/rendererAdapter.ts` para receber
  `RoadBuildContext`
- alteração em `editor/CanvasStage.tsx` para pré-computar
  contexto e passar para todas as `RoadMeshNode`
- `road-v2/__tests__/junctions.test.ts`

**Conteúdo:**
- `buildContext(roads, roundabouts): RoadBuildContext`
- `isPointInsideOtherRoad(pt, ownId, ctx): boolean`
- `clipPolylineToOutside(polyline, ownId, ctx): RoadMarkingSegment[]`
- AABB prefilter para performance.

**Testes:**
- Cruzamento X: marcação central da via A é interrompida no
  encontro com via B.
- Cruzamento T: idem.
- Y junction: idem para ângulos rasos.
- Roads paralelas que não se cruzam: marcações inteiras
  preservadas.

**Critério de sucesso:** cruzamentos do template "via_pro_cruzamento_x" e
"via_pro_cruzamento_t" ficam visualmente próximos do Python 1.0.

---

### Fase G — OSM Adapter 2.0

**Objetivo:** OSM → 4-point Bezier (via `polylineToBezier` =
`_pontos_para_spline`). Detectar `junction=roundabout` e produzir
`SicroRoundaboutObject` em vez de polyline fechada.

**Arquivos:**
- `road-v2/osmAdapter.ts`
- alteração em `OsmImportModal.tsx` para chamar o novo adapter
- `road-v2/__tests__/osmAdapter.test.ts`

**Conteúdo:**
- `convertOsmToBezierRoads(ways, nodes, centre, options): {
   roads: SicroRoadObject[]; roundabouts: SicroRoundaboutObject[] }`
- Cada way → 1 Bezier 4-pontos (A, B, C1, C2).
- `junction=roundabout` → SicroRoundaboutObject.
- Mantém metadata OSM como antes.

**Testes:**
- Way OSM reto (5 nós) → Bezier com C1, C2 perto da reta.
- Way OSM curvo (10 nós) → Bezier que aproxima a curva.
- Way `junction=roundabout` → SicroRoundaboutObject (não road).
- Fixture do local do usuário: comparação visual contra Python
  1.0.

**Critério de sucesso:** OSM do local reprovado pelo usuário
agora renderiza visualmente comparável ao SICRO 1.0 Python.

---

### Fase H — Debug mode

**Objetivo:** overlay opcional para diagnosticar problemas
visuais futuros.

**Arquivos:**
- `road-v2/debug.ts`
- alteração em `editor/CanvasStage.tsx` para incluir overlay
  quando `editor.debug.showRoadMesh === true`

**Conteúdo:**
- Desenha centerline (linha azul), edges (linhas verdes),
  junction masks (zonas vermelhas semi-transparentes), AABBs
  (retângulos cinzas), warnings.
- Toggle no menu de debug do croqui.

**Critério de sucesso:** com o debug ligado, dá para apontar
exatamente onde está o problema visual de qualquer cenário.

---

### Fase I — Testes finais + validação

**Objetivo:** teste de paridade visual + remoção do v1 fallback.

**Arquivos:**
- `road-v2/__tests__/parity.test.ts`
- limpar feature flag (manter como comentário deprecated)
- `editor/CanvasStage.tsx` (remover branch v1)
- `MVP10_OSM_IMPORT_RELATORIO.md` (seção final)

**Conteúdo:**
- Teste de paridade: 2 SicroRoadObject idênticos (manual vs
  OSM-importado) devem produzir RoadMesh idêntico (módulo
  campos voláteis).
- Validação visual final pelo usuário no local reprovado.
- Remoção do v1 (RoadNode antigo).

**Critério de sucesso:** validação visual aprovada pelo usuário.

---

## 13. Testes automatizados

Inventário mínimo de testes (a serem distribuídos pelas fases):

| Test | Tipo | Fase |
|---|---|---|
| `perpendicular(tan)` rotates 90° | unit | A |
| `pointToSegmentDist` casos canônicos (3) | unit | A |
| `aabbOfSamples` cases | unit | A |
| `sampleCubicBezier` reto = linha reta | unit | B |
| `sampleCubicBezier` curva = smooth (1st-deriv estável) | unit | B |
| `tangentAt` casos | unit | B |
| `hermiteToBezier` round-trip | unit | B |
| `buildRibbonPolygon` reta = retângulo | unit | B |
| `buildRibbonPolygon` curva preserva half-width | unit | B |
| `buildEdges` paralelas à centerline | unit | B |
| `buildRibbonPolygon` sem self-intersection em curva suave | unit | B |
| `buildMeshFromRoad` polyline → mesh | unit | C |
| `buildMeshFromRoad` bezier → mesh | unit | C |
| Snapshot do RoadMeshNode (mocked Konva) | snapshot | C |
| Render bifurcation v1 vs v2 (flag) | integration | D |
| `buildRoundaboutMesh(cx, cy, r, w)` | unit | E |
| Coercer aceita `kind: "roundabout"` | unit | E |
| Coercer ignora roundabout malformada | unit | E |
| Round-trip roundabout serializer | unit | E |
| `isPointInsideOtherRoad` casos (in/out/aabb miss) | unit | F |
| `clipPolylineToOutside` divide em N runs | unit | F |
| Cruzamento X: marcação central da via A interrompida | unit | F |
| Cruzamento T: bordas da tronco não atravessam pista | unit | F |
| `polylineToBezier` reto → Bezier-quase-reta | unit | G |
| `polylineToBezier` curvo → Bezier suave | unit | G |
| `convertOsmToBezierRoads` produz roads + roundabouts | unit | G |
| Fixture OSM Macapá-like: snapshot do mesh | regression | G |
| Debug overlay: shape descriptors corretos | unit | H |
| **Paridade visual:** manual road ≅ OSM road | integration | I |
| Outros 272 testes existentes | regressão | todos |

**Total esperado:** 272 (hoje) → ~310 após Fase I.

---

## 14. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **Self-intersection em curvas muito fechadas** | média | alto (asfalto vira mancha) | (1) Limitar tension Bezier máx 0.6; (2) Detectar pré-render (`detectSelfIntersection(ribbon): boolean`) e dropar a curva ou warning para o perito; (3) Em Fase G, split em multiple Beziers se OSM tiver curvatura alta |
| **Performance: AABB prefilter insuficiente em 100+ roads** | baixa | médio | (1) Spatial hashing (grid 50×50 px); (2) Cache do contexto por frame; (3) Render apenas vias visíveis no viewport (clip do Konva já cobre) |
| **Excesso de pontos em ribbon** | baixa | médio | N=48 amostras → 96 vértices polygon. Para 50 roads = 4800 vértices total. Konva lida bem com isso. |
| **Diferença OSM preview no Leaflet ≠ render final** | alta (já existe) | médio | (1) Aviso visual no modal (já implementado MVP 10 R5); (2) Spike futuro: preview Konva miniatura |
| **Compat com croquis antigos (polyline N-pontos)** | média | alto | (1) v2 aceita ambos os modos (bezier OU polyline); (2) Polyline trata como centerline; ribbon ainda funciona; (3) Botão "Atualizar para Bezier" no Inspector como upgrade opcional não-destrutivo |
| **Konva não tem `smooth=True` equivalente** | confirmado | médio | Compensar com N=48 amostras (vs N=24 do Python). Densidade dobrada esconde os cantos da polyline |
| **Mask geométrico mais lento que circular** | baixa | baixo | AABB prefilter + early-exit. Python roda confortável com 50 vias; nossa máquina é mais rápida |
| **Multi-pass exige refactor do CanvasStage** | confirmado | médio | (1) Implementar incrementalmente atrás do flag v1/v2; (2) Cada pass vira um Group separado; (3) Manter v1 path como rollback em paralelo |
| **Roundabout legacy (closed_path) coexistindo com nova primitive** | média | baixo | Migração não-destrutiva no Inspector + flag de versão; ambos visíveis no mesmo croqui sem conflito |

---

## 15. Critério de aprovação do plano

O plano será considerado aprovado se:

- [x] **Explica claramente por que o Python era melhor.** §1 +
  tabela §11 (audit) + §5 (port mapping).
- [x] **Propõe substituição real do stroke-based rendering.** §2
  declarado explicitamente; §6 pipeline; §7 multi-pass.
- [x] **Preserva arquitetura SICRO 2.0.** §11 estratégia de
  migração; `SicroRoadObject` mantido; schema v0.3 mantido.
- [x] **Permite OSM bonito.** §9 OSM Adapter 2.0 com 4-point
  Bezier; teste de paridade na Fase I.
- [x] **Permite rotatória aceitável.** §8 rotatória como
  primitiva; render com `Konva.Circle` real, não polyline.
- [x] **Implementável em fases.** §12 com 9 fases pequenas
  (A-I), cada uma com objetivo / arquivos / testes / critério
  de sucesso.

### O que falta para aprovação

A leitura humana deste documento, com perguntas / objeções /
ajustes. Estou disponível para iterar antes de começar a Fase A.

---

## Observações operacionais

- **Sem código novo** no SICRO 2.0 ainda. Este é o plano técnico.
- **Sem commit, merge, tag.** Nem este arquivo (vai junto com
  `ROAD_ENGINE_1_PYTHON_AUDIT.md` na próxima rodada de commit, se
  aprovada).
- **Tempo estimado por fase:** A (1h), B (2h), C (2h), D (1h),
  E (2h), F (3h), G (2h), H (1h), I (2h) → total ~16h. Pode
  esticar conforme casos visuais aparecem.
- **Validações automáticas continuam no estado da Round 5 do
  MVP 10:** `pnpm typecheck` ✅, `pnpm vitest run` (272) ✅,
  `pnpm build` ✅, `cargo check` ✅, `cargo test --lib` (88) ✅.

---

**Aguardando aprovação deste plano antes de iniciar a Fase A.**
