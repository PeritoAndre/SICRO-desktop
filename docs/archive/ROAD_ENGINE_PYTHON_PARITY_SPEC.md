# Road Engine — Python Parity Spec (v3)

**Data:** 2026-05-26
**Status:** Especificação para aprovação. **Nenhum código produzido ainda.** Aguardando autorização para implementar.
**Versão de schema-alvo:** `.sicrocroqui` v0.4 (aditivo + coercer com perda de algumas customizações visuais — declarado).
**Branch:** `mvp/osm-road-import` (mesmo branch das fases anteriores; sem commit/merge/tag até autorização).
**Referências:**
- `ROAD_ENGINE_1_PYTHON_AUDIT.md` (auditoria do código Python).
- `ROAD_RENDER_TECH_SPIKE.md` (spike Konva vs SVG — empate; Konva mantido).
- Código Python real em `C:\Users\perit\OneDrive\Documentos\SICRO\` (5 arquivos-chave).
- Lab funcional em `src/modules/croqui/spikes/road-render-lab/` (8 campos via, 6 rotatória).

---

## 0. Premissa

> "Konva pode ficar. O motor precisa ser simplificado."

Decisão validada empiricamente pelo spike: SVG e Konva produzem resultados visuais iguais com o mesmo modelo simplificado. Logo, **o renderer não é o problema** — é o modelo de dados e o pipeline de processamento.

A Fase H reescreve o motor de via inspirado no SICRO 1.0 Python, mantendo:
- Konva como engine de renderização.
- Tauri + SQLite como backend.
- React + TypeScript como front.
- Estrutura de pastas + tooling atuais.

E **trocando**:
- Modelo de dados (~25 campos → 8/6 campos).
- Pipeline de render (9 passes complexos → 4 passes simples).
- Detector de junção (topológico via `junctionPatches` X/T/Y → boolean clipping per-polyline `clipPolylineAgainstPolygons`).
- Unidades (largura em pixels → largura em metros).
- Schema (v0.3 → v0.4 com coerção).

---

## 1. Novo modelo simplificado de via — `SicroRoadObject_v3`

### 1.1 Campos

```typescript
interface SicroRoadObject_v3 {
  // --- Sistema (4 campos) ---
  id: string;                    // UUID v4
  kind: "road";                  // discriminator
  layer_id: string;              // "layer_objects" default
  category: "vias";              // para Layer Panel

  // --- Geometria — Bezier 4-point em mundo (metros) (8 campos) ---
  ax: number;                    // âncora inicial X
  ay: number;                    // âncora inicial Y
  bx: number;                    // âncora final X
  by: number;                    // âncora final Y
  cx1: number;                   // controle 1 X
  cy1: number;                   // controle 1 Y
  cx2: number;                   // controle 2 X
  cy2: number;                   // controle 2 Y

  // --- Aparência (4 campos) ---
  largura_m: number;             // metros (não pixels)
  superficie: "asfalto" | "calcada" | "terra";
  mao_dupla: boolean;            // true → eixo central tracejado
  marcacao: "amarela" | "branca" | "nenhuma";

  // --- Estado da UI (3 campos) ---
  visible: boolean;
  locked: boolean;
  label: string | null;          // nome humano (Av. Manoel Torrinha)

  // --- Metadados opacos (1 campo) ---
  metadata_json: string | null;  // OSM tags, source, audit
}
```

**Total: 20 campos**, sendo 4 sistema, 8 geometria, 4 aparência, 3 UI, 1 metadados.

### 1.2 O que foi **eliminado** vs `SicroRoadObject_v2` (atual)

| Campo v2 | Razão da remoção |
|---|---|
| `subtype` (`spline / osm_way / intersection`) | Único valor relevante seria `osm_way` → vai pro `metadata_json.source`. |
| `points` (polyline flat) | Substituído por Bezier 4-point explícito (ax, ay, cx1, cy1, cx2, cy2, bx, by). |
| `direction` (`one_way / two_way / unknown`) | Equivalente a `mao_dupla` invertido. OSM `oneway` vai pro `metadata_json`. |
| `road_style` (`urban / avenue / highway / dirt / parking / custom`) | Não afeta geometria nem cor (Python tira tudo de `superficie`). Substituído implicitamente por `superficie` + `largura_m` + `marcacao`. |
| `lane_count` | Python não tem. Se quiser 4 faixas, aumenta `largura_m`. Lane dividers viram opcional futuro se necessário. |
| `lane_width` | Idem — derivado de `largura_m`. |
| `markings.center_line` (`solid / dashed / double_solid / solid_dashed / none`) | Python só tem tracejado. Substituído por `marcacao: amarela / branca / nenhuma` + `mao_dupla` para decidir se desenha. |
| `markings.edge_line` (boolean) | Sempre `true` para asfalto (Python sempre desenha). Não há razão pra esconder borda. |
| `markings.lane_dividers` (boolean) | Removido. Volta como feature opcional se perito pedir. |
| `markings.color` (`auto / white / yellow`) | Substituído por `marcacao`. |
| `markings.crosswalk_start / crosswalk_end` | Não eram usados — Python não tem. Faixa de pedestre vira `SicroMarkerObject` separado (já existe). |
| `curb.enabled / width / color` | Calçada é AUTOMÁTICA quando `superficie === "asfalto"` (Python `superficies.py` calcada_auto). Hardcoded 2m + cor `#7C7460`. |
| `surface.fill / texture` | Cor hardcoded por `superficie`. Sem textura ainda (Python tem padrão "granulado" mas não usa no multipass). |
| `spline_tension` | Sem efeito — Bezier 4-point já define a curva. |
| `smoothing.mode / tension / preserve_corners` | Removido. Renderer aplica Catmull-Rom tension=0.5 sempre (igual Python `smooth=True`). |
| `closed_path` | Removido. Se rotatória, usa `SicroRoundaboutObject`. Não há caso onde via fechada manual faça sentido. |
| `bezier` (campo opcional v3 introduzido na Fase G.3) | Não é mais opcional — é o caminho ÚNICO. Os 4 control points são primeira classe. |

### 1.3 Comparação visual com Python

| Aspecto | Python `_via_spline` | SicroRoadObject_v3 |
|---|---|---|
| Anchors + controls | x, y, x2, y2, cx1, cy1, cx2, cy2 | ax, ay, bx, by, cx1, cy1, cx2, cy2 ✓ |
| Largura | `largura: 7.0` (metros) | `largura_m: 7.0` ✓ |
| Superfície | `superficie: "asfalto"` | `superficie: "asfalto"` ✓ |
| Mão dupla | `mao_dupla: True` | `mao_dupla: true` ✓ |
| Marcação | `marcacao: "amarela"` | `marcacao: "amarela"` ✓ |
| Calçada | `calcada: True, calcada_larg: 2.0` | Implícito (asfalto → 2m auto) |

**Paridade**: 1:1 entre Python e v3, exceto que v3 elimina `calcada/calcada_larg` (implícitos no renderer).

---

## 2. Novo modelo simplificado de rotatória — `SicroRoundaboutObject_v3`

### 2.1 Campos

```typescript
interface SicroRoundaboutObject_v3 {
  // --- Sistema (4 campos) ---
  id: string;
  kind: "roundabout";
  layer_id: string;
  category: "vias";

  // --- Geometria — mundo (metros) (4 campos) ---
  cx: number;                    // centro X
  cy: number;                    // centro Y
  r_m: number;                   // raio externo do anel (metros)
  largura_m: number;             // espessura do anel (metros)

  // --- Estado da UI (3 campos) ---
  visible: boolean;
  locked: boolean;
  label: string | null;

  // --- Metadados opacos (1 campo) ---
  metadata_json: string | null;
}
```

**Total: 12 campos**.

### 2.2 O que foi **eliminado** vs `SicroRoundaboutObject_v2`

| Campo v2 | Razão |
|---|---|
| `surface.fill` | Asfalto hardcoded `#1C1C1C`. |
| `inner_color` | Verde canteiro hardcoded `#3A6535`. |
| `border_color` | Branco hardcoded `#FFFFFF`. |
| `curb` (enabled, width, color) | Calçada externa AUTOMÁTICA: 2m de `#7C7460`. |
| `lane_count` | Não afeta nada visualmente. Removido. |
| `lane_width` | Idem. |

### 2.3 Paridade Python

| Python `_rotatoria` | SicroRoundaboutObject_v3 |
|---|---|
| cx, cy | cx, cy ✓ |
| r: 30.0 (metros) | r_m: 30 ✓ |
| largura: 8.0 (metros) | largura_m: 8 ✓ |
| superficie: "asfalto" | (sempre asfalto, hardcoded) |

---

## 3. Largura em metros, não em pixels

### 3.1 Motivação

Atualmente `SicroRoadObject.width` é **pixels** no canvas. Isso amarra a via à resolução de renderização e quebra quando o usuário muda zoom, calibra escala, ou exporta em outra resolução.

Python usa **metros** + `zoom` (px/m). O renderer multiplica na hora do desenho. Resultado: a via tem tamanho FÍSICO real, o desenho é só uma rasterização naquele zoom.

### 3.2 Escala do documento

O `SicroCroquiDoc` já tem `scale: SicroCroquiScale` (definida em `schema.ts`):

```typescript
interface SicroCroquiScale {
  definition: "manual" | "auto" | null;
  px_per_m: number | null;
  // ...
}
```

Quando `px_per_m` está definido, o renderer usa. Quando é null, usa um **default visual** (sugestão: `10 px/m`) e marca o documento como "escala indefinida — calibrar para medições precisas".

### 3.3 Impacto no renderer

Em vez de:
```ts
// v2:
<Line points={points} strokeWidth={road.width} ... />
```

Vira:
```ts
// v3:
const pxPerM = doc.scale.px_per_m ?? 10;
const widthPx = road.largura_m * pxPerM;
// usa widthPx no Konva.Line
```

### 3.4 Impacto nas medidas

A ferramenta "Cota / medida" do croqui já tem suporte a escala. v3 não muda nada disso — apenas garante que TODA via tem largura física real, calibrada pela escala do documento.

---

## 4. Renderer multipass simples — `RoadRendererV3`

### 4.1 Estrutura — réplica do `_desenhar_vias_multipass` Python

**4 passes em ordem fixa** sobre TODAS as vias + rotatórias do documento. Sem detector topológico, sem patches, sem flares.

### 4.2 Pass 1 — Calçadas

Para cada `SicroRoadObject_v3` com `superficie === "asfalto"`:
1. Samplea Bezier em 48 pontos (mundo, metros) — `sampleBezier(road, 48)`.
2. Constrói polígono offset `(largura_m/2 + 2) * px_per_m` — `buildRibbonOffset(samples, halfWidth, 2.0)`.
3. Renderiza: `<Konva.Line points={flatten} closed tension=0.5 fill="#7C7460" />`.

Para cada `SicroRoundaboutObject_v3`:
1. `<Konva.Circle cx cy radius={(r_m + largura_m/2 + 2) * px_per_m} fill="#7C7460" />`.

### 4.3 Pass 2 — Asfalto

Para cada `SicroRoadObject_v3`:
1. Samplea Bezier 48 pontos.
2. Polígono offset `(largura_m/2) * px_per_m`.
3. Renderiza: `<Konva.Line points closed tension=0.5 fill={cor_por_superficie} />`.

Cor por `superficie`:
- `asfalto` → `#1C1C1C`.
- `calcada` → `#7C7460`.
- `terra` → `#9C7A4E`.

Para cada `SicroRoundaboutObject_v3`:
1. `<Konva.Circle radius={(r_m + largura_m/2) * px_per_m} fill="#1C1C1C" />` — asfalto do anel.
2. `<Konva.Circle radius={(r_m - largura_m/2) * px_per_m} fill="#3A6535" />` — ilha verde.

### 4.4 Pass 3 — Marcações (bordas + eixo central)

Para cada `SicroRoadObject_v3`:
1. Samplea Bezier 48 pontos.
2. Calcula bordas left/right via `buildEdges(samples, largura_m/2)`.
3. **Constrói lista de obstáculos**:
   - Polígonos de TODAS as outras vias (asfalto offset).
   - Discos de TODAS as rotatórias (raio externo).
4. **Clipa** cada borda via `clipPolylineAgainstPolygons(borda, obstaculos)` → lista de sub-polilinhas.
5. Renderiza cada sub-polilinha: `<Konva.Line points stroke="#FFFFFF" strokeWidth={2} lineCap="butt" />`.

6. Se `mao_dupla === true` E `marcacao !== "nenhuma"`:
   - Clipa centerline (= samples) via mesmo `clipPolylineAgainstPolygons`.
   - Renderiza cada sub-polilinha: `<Konva.Line stroke={cor_marcacao} strokeWidth={2} dash=[12, 8] lineCap="butt" />`.

Cor por `marcacao`:
- `amarela` → `#F5C518`.
- `branca` → `#FFFFFF`.

Para cada `SicroRoundaboutObject_v3`:
1. `<Konva.Circle radius={(r_m + largura_m/2) * px_per_m} stroke="#FFFFFF" strokeWidth={2} />` — borda externa.
2. `<Konva.Circle radius={(r_m - largura_m/2) * px_per_m} stroke="#FFFFFF" strokeWidth={2} />` — borda interna.

### 4.5 Pass 4 — Handles (apenas via selecionada)

Para a via selecionada:
1. Linha tracejada A↔C1, B↔C2 (azul claro `#6080C0`).
2. Círculo A (raio 7px tela, fill `#4A80FF`, stroke `#1a1a1a` 2px) — âncora inicial.
3. Círculo B (idem) — âncora final.
4. Círculo C1 (raio 5px tela, fill `#4F72E0`) — controle 1.
5. Círculo C2 (idem) — controle 2.

Para a rotatória selecionada:
1. Círculo centro (raio 7px, fill `#4A80FF`) — centro arrastável.
2. Círculo borda externa (raio `(r_m) * px_per_m`, sem fill, stroke tracejado azul) — handle de redimensionamento.

### 4.6 O que NÃO existe no v3

- Detector de junção (`network.ts / detectJunctions`).
- Patches X/T/Y (`junctionPatches.ts`).
- Flares (`roundaboutNode.ts / roundaboutEntries.ts`).
- Gaps angulares (`roundaboutPath.ts`).
- Loop removal (`ribbonRobust.ts`).
- Smoothing modes (`centerline.ts`).
- Context clipping (`junctions.ts`).
- `RoadNetworkLayerV2` (substituído por `RoadRendererV3`).

Todos esses módulos do `road-v2/` ficam **deprecated** ao final da Fase H. Nada deletado durante a migração — só removido depois que v3 estiver aprovado em produção.

---

## 5. Clipping/máscara estilo Python — `clipPolylineAgainstPolygons`

### 5.1 Já implementado no spike

A função existe em `src/modules/croqui/spikes/road-render-lab/clipping.ts`. Será movida para `src/modules/croqui/engine/road-v3/clipping.ts` na H.2.

### 5.2 Algoritmo (resumo)

Para cada ponto P da polilinha:
1. Checa se P está dentro de algum polígono obstáculo (ray casting `pointInPolygon`).
2. Para cada segmento (P_i, P_{i+1}):
   - ambos fora → segmento OK, adiciona ao trecho atual.
   - ambos dentro → pula. Se há trecho aberto, fecha.
   - cruza fronteira → calcula ponto exato de crossing via busca binária (30 iter ≈ 1e-9 precisão).
3. Trechos contínuos formam sub-polilinhas (corta quando entra no obstáculo).

### 5.3 Performance

Complexidade: O(N × M × P) onde:
- N = pontos da marcação (48).
- M = polígonos obstáculo (vias adjacentes — tipicamente 5-15).
- P = pontos por polígono obstáculo (~96 = 48 left + 48 right).

Para um croqui de 30 vias: 48 × 15 × 96 × 30 vias = **2 milhões de operações pointInPolygon por frame**. Aceitável em JS para draw síncrono em ~10 fps de interação.

### 5.4 Otimização — AABB pre-filter

Antes de rodar `pointInPolygon`, calcular AABB de cada obstáculo. Se o AABB do segmento da marcação NÃO toca o AABB do obstáculo, pula sem testar pontos. Reduz para ~O(N × M_relevantes × P) com M_relevantes tipicamente 1-3 por segmento.

Já existe `intersectAabb` em `road-v2/geometry.ts` — reutilizável.

### 5.5 Por que isso substitui junctions topológicas

A G.3 quebrou porque `RoadNetworkLayerV2` precisa de shared nodes para detectar junções (X/T/Y). Quando uma via era reduzida a 2 pontos via Bezier 4-point + clip, os endpoints novos não casavam com node_ids OSM → junctions perdidas → malha fragmentada.

**Clipping per-polyline não precisa de shared nodes.** Cada via é independente. Onde duas vias se cruzam, suas marcações se cortam mutuamente — independente de "ser uma junção X ou T". Boolean clipping resolve TUDO geometricamente.

---

## 6. OSM usando o mesmo motor das vias manuais

### 6.1 Princípio

**O motor v3 é único.** Não há "renderer manual" e "renderer OSM" separados. Vias importadas do OSM e vias criadas manualmente são INDISTINGUÍVEIS no `SicroRoadObject_v3`, exceto por `metadata_json.source = "osm"` (audit trail).

### 6.2 Pipeline OSM v3

```
OsmDataset (lat/lon, ways, tags)
  ↓
projetar lat/lon → metros locais (cos-corrected)
  ↓
detectar rotatórias (junction=roundabout OU geometria circular)
  ↓
para cada way regular:
  ├ Hermite → Bezier 4-point (polylineToBezier4Points existente)
  ├ se desvio máximo dos pontos internos > 2m → SPLIT recursivo
  │  (gera N Bezier 4-point conectados; cada um é uma SicroRoadObject_v3)
  └ classificar:
     ├ largura_m = _LARG_CLASSE[highway] (tabela Python)
     │   primary: 10.5, secondary: 9.0, tertiary: 7.5,
     │   residential: 6.0, ..., footway: 2.0
     ├ superficie = mapeamento highway → asfalto/calcada/terra
     │   footway/path → calcada; track → terra; resto → asfalto
     ├ mao_dupla = !tem oneway=yes
     ├ marcacao = arteriais → amarela; residenciais → branca
     └ label = name OR ref OR null
  ↓
para cada rotatória OSM:
  ├ centroide + raio médio (em metros)
  ├ largura_m = 7.0 (default) ou calculado de vias conectadas
  └ SicroRoundaboutObject_v3 { cx, cy, r_m, largura_m }
  ↓
emitir { roads: SicroRoadObject_v3[], roundabouts: SicroRoundaboutObject_v3[] }
```

### 6.3 Split recursivo da Hermite

Quando a polyline OSM original tem >= 4 pontos:
1. Calcula Hermite 4-point sobre [p_0, ..., p_n].
2. Para cada ponto interno p_i (i ∈ [1, n-1]):
   - Calcula a posição na curva Bezier no parâmetro t_i correspondente ao comprimento parcial.
   - Mede distância |p_i - curva(t_i)|.
3. Se max distância > 2m:
   - Divide a polyline em duas metades [p_0..p_mid] e [p_mid..p_n].
   - Roda Hermite em cada metade recursivamente.
4. Resultado: árvore de Bezier 4-point cujas folhas têm erro < 2m.

Cada folha vira UM `SicroRoadObject_v3`. Endpoints adjacentes são compartilhados (último de um = primeiro do próximo) → continuidade visual perfeita.

### 6.4 Sem clip por raio

A G.3 falhou porque `clipPolylineToRadius` criou endpoints novos que não casavam com node_ids OSM, fragmentando a malha.

Em v3, **não há clip por raio.** Cada way OSM mantém seu comprimento original. O renderer aplica fit uniforme baseado no bbox total dos objetos (igual ao adapter atual).

Se uma way OSM tem 800m de comprimento e o raio "selecionado" foi 25m, a way INTEIRA é importada. O usuário pode deletar as vias muito longas se quiser, ou usar a ferramenta "recortar" (futura) para cortar manualmente.

### 6.5 Sem regressão de topologia

Como o renderer v3 não depende de junction detection topológica (boolean clipping resolve), **endpoints clipados ou Hermite-fitted não causam problema**. A malha é sempre coerente porque o clipping é geométrico, não estrutural.

---

## 7. Edição manual com handles Bezier 4-point

### 7.1 Ferramenta "Criar via"

Toolbar → seção Via → botão "Via reta". Estado da ferramenta: `tool: "create_road"`.

Fluxo:
1. Usuário clica no canvas → primeira posição (mundo, metros). Anchor A.
2. Usuário move o mouse → preview de uma linha tracejada de A até a posição atual.
3. Usuário clica → segunda posição. Anchor B.
4. Cria `SicroRoadObject_v3` com:
   - A = primeiro clique, B = segundo clique.
   - C1 = A + (B - A) / 3 (1/3 do caminho).
   - C2 = A + 2 × (B - A) / 3 (2/3 do caminho).
   - largura_m = 7.0 (default urban).
   - superficie = "asfalto", mao_dupla = true, marcacao = "amarela".
5. Ferramenta volta para `tool: "select"`. Via fica selecionada.

### 7.2 Ferramenta "Criar rotatória"

Toolbar → seção Via → botão "Rotatória".

Fluxo:
1. Usuário clica → centro da rotatória.
2. Usuário arrasta → preview do raio.
3. Solta → cria `SicroRoundaboutObject_v3` com r_m = distância arrastada, largura_m = max(4, r_m / 4).

### 7.3 Edição de via selecionada

Quando uma via está selecionada, Pass 4 desenha 4 handles:
- **A, B** (círculos grandes, azul accent) — âncoras.
- **C1, C2** (círculos menores, azul claro) — controles.
- Linhas tracejadas A↔C1, B↔C2 — guia visual.

**Drag de A:**
- Δx, Δy = new - old.
- Aplica também em C1 (move junto). Mantém a "curvatura" relativa.

**Drag de B:**
- Aplica também em C2.

**Drag de C1 ou C2:**
- Move só o controle. Curvatura muda.

### 7.4 Edição de rotatória selecionada

Pass 4 desenha:
- Círculo no centro (centro arrastável).
- Anel tracejado fino no raio externo (handle de redimensionamento — arrastar muda r_m).

### 7.5 Inspector Panel v3

#### Para via:
- `largura_m` — slider 2–30 m.
- `superficie` — dropdown asfalto / calçada / terra.
- `mao_dupla` — checkbox.
- `marcacao` — dropdown amarela / branca / nenhuma. (Disabled se `mao_dupla = false` e `superficie === "calcada"`.)
- `label` — input texto.
- Coords A, B, C1, C2 — read-only display (4 linhas).

#### Para rotatória:
- `r_m` — slider 5–50 m.
- `largura_m` — slider 4–15 m, max(r_m - 1).
- `label` — input texto.
- Coords centro — read-only.

Sem dropdown de `smoothing`, sem `lane_count`, sem cor de borda, sem cor da ilha. Tudo hardcoded.

### 7.6 Templates de via

Templates atuais (`croqui/engine/templates.ts`):
- Avenida c/ canteiro
- Curva L
- Curva R
- Cruzamento X
- Cruzamento T
- Cruzamento Y
- Faixa de pedestre

**Cada template** vira uma função que retorna `SicroRoadObject_v3[]` + opcionalmente `SicroRoundaboutObject_v3[]`. Sem mudança de UX — o usuário escolhe template, clica no canvas, e os objetos são criados.

A H.7 traduz cada template existente para o novo modelo. Templates que dependem de campos eliminados (lane_count, double_solid markings) viram versões equivalentes simples (largura maior em vez de lane_count, marcação amarela em vez de double_solid).

---

## 8. Migração dos objetos atuais — schema v0.3 → v0.4

### 8.1 Princípio

A migração é **automática + irreversível por padrão, com backup opcional**:

- Ao abrir um documento `.sicrocroqui` v0.3, o coercer detecta a versão e oferece migração para v0.4.
- Backup automático em `<doc_path>.bak-v0.3` antes da conversão.
- Usuário pode optar por **não migrar** — o documento permanece em v0.3 e abre no road-v2 (preservado durante a transição).

### 8.2 `coerceRoadObject_v3`

Para cada `SicroRoadObject_v2` (ou v1):

#### Geometria
- Se tem `bezier` field (v2 introduzido na G.3): usa diretamente como C1/C2. A = points[0..1], B = points[N-2..N-1].
- Se NÃO tem `bezier`: roda `polylineToBezier4Points` em coords mundo. Se resultado tem erro grande (> 5m de desvio), tenta split (gerar 2 vias v3 conectadas em cadeia).

#### Largura
- `width` (pixels) → `largura_m`:
  - Se `doc.scale.px_per_m` está definido: `largura_m = width / scale.px_per_m`.
  - Senão: `largura_m = width / 10` (default 10 px/m). Documento ganha warning "escala não calibrada".

#### Superfície
- `road_style === "urban" / "avenue" / "highway" / "custom"` → `superficie = "asfalto"`.
- `road_style === "parking"` → `superficie = "asfalto"` (parking lots viram asfalto, perdem distinção visual).
- `road_style === "dirt"` → `superficie = "terra"`.

#### Mão dupla
- `direction === "two_way"` → `mao_dupla = true`.
- `direction === "one_way"` → `mao_dupla = false`.
- `direction === "unknown"` → `mao_dupla = true` (default seguro).

#### Marcação
- `markings.color === "yellow"` → `marcacao = "amarela"`.
- `markings.color === "white"` → `marcacao = "branca"`.
- `markings.color === "auto"`:
  - Se `road_style === "highway" || "avenue"` → "amarela".
  - Senão → "branca".
- `markings.center_line === "none"` → `marcacao = "nenhuma"`.

#### Descarte
- `lane_count`, `lane_width`, `smoothing.*`, `markings.lane_dividers`, `markings.edge_line`, `markings.crosswalk_*`, `curb.*`, `surface.texture`, `spline_tension`, `closed_path` → **descartados silenciosamente**.
- `subtype` → para `metadata_json.original_subtype` (audit).

### 8.3 `coerceRoundaboutObject_v3`

Para cada `SicroRoundaboutObject_v2`:

- `cx, cy` → mantém em coordenadas atuais. Se doc estava em pixels, converte via `doc.scale.px_per_m` (igual via).
- `r` (pixels) → `r_m`.
- `width` (pixels) → `largura_m`.
- Descartados: `inner_color`, `border_color`, `surface.*`, `curb.*`, `lane_count`, `lane_width`.

### 8.4 Warning honesto

Ao final da migração, console:

```
[Migração v0.3 → v0.4] Documento "Croqui XYZ" migrado.
  Vias: 12 (todas migradas).
  Rotatórias: 1 (migrada).
  Customizações visuais descartadas:
    - Via "Av. ABC": cor de borda manual #abcdef → padrão branco.
    - Rotatória "Central": cor da ilha #foo → verde padrão.
    - Via "Rua DEF": lane_count = 4 → considere ajustar largura_m para 14m.
  Backup salvo em: /path/to/doc.sicrocroqui.bak-v0.3
```

### 8.5 Testes de migração

H.4 inclui testes de coerção cobrindo:
- via v2 com bezier field → v3 idêntica.
- via v2 com polyline simples → v3 com Hermite 4-point.
- via v2 com polyline complexa → v3 split em 2-3 vias.
- via v2 com width=80 e doc.scale.px_per_m=10 → v3 com largura_m=8.
- via v2 com width=80 e sem scale → v3 com largura_m=8 + warning.
- via v2 com road_style="dirt" → v3 com superficie="terra".
- via v2 com markings.color="yellow" → v3 com marcacao="amarela".
- rotatória v2 com r=200 e scale=10 → v3 com r_m=20.

---

## 9. Riscos

### 9.1 Migração pode perder customizações importantes

**Risco:** Croquis antigos com cores personalizadas (ex: borda colorida, ilha cor diferente) perdem essas customizações.

**Mitigação:**
- Backup automático antes de migrar (`doc.sicrocroqui.bak-v0.3`).
- Warning visível com lista de customizações descartadas.
- Opção "não migrar" — doc permanece em v0.3 + road-v2 (preservado).

### 9.2 Performance do `clipPolylineAgainstPolygons` em croquis densos

**Risco:** Com 30+ vias, o clipping cruzado é O(N²) — ~2M operações por frame de render.

**Mitigação:**
- AABB pre-filter antes do `pointInPolygon`.
- Memoização dos polígonos de obstáculo entre frames (Konva re-render só toca os shapes que mudaram).
- Se ficar lento: cache de polilinhas clipadas em useMemo por (road.id, doc.objects fingerprint).

### 9.3 Hermite 4-point com erro alto em vias super-curvas

**Risco:** Polilinha OSM de uma via residencial muito sinuosa pode ter desvio > 2m da Bezier 4-point → uma curva visualmente diferente do real.

**Mitigação:**
- Split recursivo (§6.3): se erro > 2m, divide em 2 Bezier conectados. Repete até erro aceitável.
- Documentar limitação: vias com mais de 4-5 splits indicam OSM data sub-ótima — usuário pode editar manualmente.

### 9.4 Tempo total estimado pode estourar

**Risco:** Implementação completa em 11-14 dias úteis pode estourar para 20+ dias.

**Mitigação:**
- Cada fase H.1 a H.8 é isolada — pode pausar entre fases sem quebrar nada.
- Feature flag `road_engine_version: "v3"` permite manter v2 funcionando enquanto v3 amadurece.
- Testes unitários cobrindo o core (clipping, Bezier, migration) → confiança em mudanças incrementais.

### 9.5 Templates de via existentes vão precisar adaptar

**Risco:** Templates como "avenida com canteiro central" usam `lane_count`, `markings.double_solid`. v3 não tem.

**Mitigação:**
- H.7 dedicada a portar templates. Cada template ganha versão v3 equivalente:
  - "Avenida c/ canteiro" → 2 vias paralelas com gap = 4m, mão_dupla=false em cada.
  - "Double solid" → `marcacao = "amarela" + mao_dupla = true + largura_m = 14m` (mais larga = parece avenida).
- Templates v2 são preservados — usuário escolhe v2 ou v3.

### 9.6 Vias antigas em produção (perito já tem croquis em uso)

**Risco:** Peritos podem ter dezenas de croquis salvos em produção. Migração automática pode estragar.

**Mitigação:**
- Default: não migra. Mostra dialog "Este croqui está em v0.3 (motor v2). Deseja atualizar para v0.4 (motor v3, com visual melhorado)? Sim / Não / Sempre / Nunca".
- Preferência salva por usuário.
- Backup sempre antes de migrar.

### 9.7 Konva pode ter limitações que o spike não capturou

**Risco:** O spike testou 6 fixtures simples. Em produção, croquis reais podem ter padrões patológicos (10+ vias paralelas, retornos apertados, vias muito longas) que o Konva render lente ou erra.

**Mitigação:**
- H.8 inclui validação visual em produção com casos reais antes de remover v2.
- v2 fica como fallback até v3 estar comprovado em 10+ croquis reais.

---

## 10. Plano de implementação — 8 fases

### H.1 — Schema v0.4 + tipos v3 (1-2 dias)

**O que faz:**
- Adicionar `SicroRoadObject_v3` em `schema.ts`.
- Adicionar `SicroRoundaboutObject_v3` em `schema.ts`.
- `SicroObject_v3` discriminated union: SicroRoadObject_v3 | SicroRoundaboutObject_v3 | (objetos v2 não-road continuam).
- `SicroCroquiDoc_v4` com `schema_version: "0.4"` + `road_engine_version: "v3"`.
- Atualizar `SicroCroquiScale.px_per_m` para ser obrigatório (default 10 quando ausente).

**Não toca em:**
- v1, v2 (continuam exportados).
- Coercer atual (`coerceCroquiDoc` continua aceitando v0.3).

**Testes:** tipos compilam, schema serializa.

### H.2 — Renderer v3 production-grade (3-4 dias)

**O que faz:**
- Mover `src/modules/croqui/spikes/road-render-lab/konva/KonvaRoadRenderer.tsx` para `src/modules/croqui/engine/road-v3/RoadRendererV3.tsx`.
- Mover `clipping.ts`, `geometry.ts`, `model.ts` correspondentes.
- Adaptar para receber `SicroRoadObject_v3[]` + `SicroRoundaboutObject_v3[]` (em vez do modelo do lab).
- Adicionar AABB pre-filter no clipping.
- Memoização de meshes via `useMemo`.
- Suportar seleção (`selectedId`) + drag de handles.

**Não toca em:**
- CanvasStage atual.
- road-v2 (continua exportado).

**Testes:** renderer renderiza fixtures (mover testes do spike), AABB filter funciona, drag de handle atualiza objeto.

### H.3 — Feature flag v3 + isolamento (1 dia)

**O que faz:**
- `road_engine_version: "v1" | "v2" | "v3"`.
- `CanvasStage` adiciona branch para v3:
  ```
  doc.road_engine_version === "v3"
    ? <RoadRendererV3 ... />
    : doc.road_engine_version === "v2"
    ? <RoadNetworkLayerV2 ... />
    : <RoadNode v1 ... />
  ```
- Documentos novos default `"v3"`.
- Documentos antigos continuam no motor que escolheram.

**Não toca em:** v1, v2, modal OSM (ainda).

**Testes:** documento v3 renderiza com v3; documento v2 ainda renderiza com v2.

### H.4 — Migration coerciva v0.3 → v0.4 (2 dias)

**O que faz:**
- `coerceCroquiDoc_v4`: detecta v0.3 e oferece migração.
- `coerceRoadObject_v3` + `coerceRoundaboutObject_v3` conforme §8.
- Backup automático antes de migrar (`fs.writeFile(.bak-v0.3)`).
- Warning no console com customizações descartadas.
- Dialog UI: "Migrar este documento?" com Sim/Não/Sempre/Nunca.

**Testes:** todos os casos de §8.5.

### H.5 — Adapter OSM v3 (1-2 dias)

**O que faz:**
- Criar `src/modules/croqui/engine/road-v3/osmAdapter_v3.ts`.
- Pipeline conforme §6:
  - projeção métrica local.
  - detecção rotatória ANTES de fit.
  - Hermite 4-point com split recursivo se erro > 2m.
  - sem clip por raio.
  - largura por `_LARG_CLASSE`.
  - marcação por highway.
- Modal OsmImportModal usa o novo adapter (substituindo `convertOsmDatasetToSicroObjects` atual).
- `handleOsmImportConfirm` no `CroquiEditor` aceita objetos v3.

**Não toca em:** road-v2 (continua compatível com v2 docs).

**Testes:** fixture Macapá em v3 produz malha contínua, rotatória conectada, sem fragmentação.

### H.6 — Ferramenta "Criar via" v3 + Inspector v3 (2 dias)

**O que faz:**
- Toolbar adiciona ferramentas v3: "Via reta", "Rotatória".
- Handlers em `CroquiEditor` para criar `SicroRoadObject_v3` e `SicroRoundaboutObject_v3`.
- Drag de handles A/B (move junto C1/C2) e C1/C2 (livre).
- Inspector mostra campos simplificados conforme §7.5 quando objeto v3 selecionado.
- Inspector v2 continua funcionando para objetos v2 (compat).

**Testes:** criar via reta → 4 handles aparecem; drag de A move A+C1; inspector salva alterações.

### H.7 — Templates v3 (1 dia)

**O que faz:**
- Cada template em `templates.ts` ganha versão v3:
  - `templateCurvaL_v3()`, `templateCruzamentoX_v3()`, etc.
- Templates retornam `{ roads: SicroRoadObject_v3[], roundabouts: SicroRoundaboutObject_v3[] }`.
- Modal "Modelos" mostra ambos (v2 + v3) com label "(motor v3)" nos novos.
- Quando documento é v3, só mostra templates v3.

**Testes:** cada template v3 cria objetos válidos; modelos visualmente parecidos com v2.

### H.8 — Validação visual + cleanup (2-3 dias)

**O que faz:**
1. Importar OSM Macapá no MESMO local reprovado. Validar visualmente.
2. Criar 3-5 vias manuais. Validar drag de handles, inspector, save.
3. Salvar → fechar → reabrir. Validar persistência.
4. Exportar PNG técnico + limpo. Validar export.
5. Abrir documento antigo v0.3 → migrar → validar.
6. Quando aprovado pelo perito:
   - Remover `road-v1/` totalmente.
   - Marcar `road-v2/` como deprecated com warning em runtime.
   - Atualizar relatório com §28 "Fase H — Python Parity completa".

**Critério de fechamento:** perito aprova visualmente a importação OSM Macapá + uma via manual criada + edição de handles + export PNG.

### Estimativa total

| Fase | Dias úteis |
|---|---:|
| H.1 — Schema + tipos | 1-2 |
| H.2 — Renderer v3 | 3-4 |
| H.3 — Feature flag | 1 |
| H.4 — Migration | 2 |
| H.5 — OSM adapter v3 | 1-2 |
| H.6 — Ferramentas + Inspector | 2 |
| H.7 — Templates | 1 |
| H.8 — Validação + cleanup | 2-3 |
| **Total** | **13-17 dias úteis** |

Cauteloso. Pode estourar para 20+ dias se aparecerem patológicos no path.

---

## Apêndice A — Decisões rejeitadas e por quê

| Decisão considerada | Por que foi rejeitada |
|---|---|
| Trocar Konva por SVG | Spike comparativo provou empate visual. Custo de migração não compensa. |
| Trocar Konva por PixiJS | Croqui tem 10-50 objetos sem animação — PixiJS é overkill. |
| Manter `lane_count` + `markings.lane_dividers` | Python não tem. Aumentar `largura_m` faz o mesmo visual. Volta como opcional só se perito pedir. |
| Manter `closed_path` para vias fechadas manuais | Não há caso real de via fechada manual fora de rotatória. Se aparecer, retorno como discussão. |
| Manter clip por raio na importação OSM | Causou regressão grave na G.3 (endpoints clipados não casam com node_ids). Em v3 não é necessário — boolean clipping resolve sem precisar de shared nodes. |
| Manter junction detection topológica (X/T/Y) | Substituído por boolean clipping (mais simples, mais resiliente). |
| Permitir `markings.color` customizado por via | Hardcoded amarela/branca conforme `marcacao` enum. Customização perdida na migração. |
| Suportar `surface.texture` (granulado) | Python não usa no multipass. Pode entrar em fase futura. |
| Suportar smoothing.mode configurável | Tkinter `smooth=True` é um modo só. Sem necessidade real de múltiplos modos. |

---

## Apêndice B — Glossário

- **Hermite → Bezier 4-point**: técnica de Python `_pontos_para_spline` para reduzir uma polyline a 4 pontos Cubic Bezier (anchors + controls a 1/3 do arco ao longo das tangentes nos endpoints).
- **Boolean clipping per-polyline**: algoritmo de `clipPolylineAgainstPolygons` que recorta uma polilinha onde encontra polígonos obstáculo. Geometricamente exato, não depende de detecção topológica.
- **`_LARG_CLASSE`**: tabela do Python (`osm_via.py:38-53`) com largura física por classe OSM em metros.
- **Smoothing Konva `tension=0.5`**: equivalente direto do Tkinter `smooth=True` — Catmull-Rom com tensão 0.5.
- **AABB pre-filter**: otimização de clipping que descarta obstáculos cujo bounding box não toca o segmento sendo testado.
- **Split recursivo Hermite**: técnica para quando 4 pontos Bezier não capturam fielmente uma polyline curva — divide em sub-curvas até erro < threshold.
- **Schema v0.4**: nova versão do `.sicrocroqui` com `road_engine_version: "v3"` + objetos `SicroRoadObject_v3` / `SicroRoundaboutObject_v3`.

---

## Aprovação

Esta especificação está **aguardando aprovação ponto a ponto** antes de qualquer código.

**Pontos para você aprovar / rejeitar / pedir ajuste:**

1. **Campos do `SicroRoadObject_v3`** (§1): aceita os 20 campos? Algum deveria voltar (lane_count, smoothing.mode)?
2. **Campos do `SicroRoundaboutObject_v3`** (§2): aceita os 12 campos? Algum customizable que quer manter (inner_color, border_color)?
3. **Largura em metros** (§3): aceita a quebra de unidade? Documentos antigos sem scale calibrada caem no default 10 px/m + warning — OK?
4. **4 passes do renderer** (§4): aceita o pipeline simplificado? Falta algum pass crítico?
5. **Boolean clipping per-polyline** (§5): aceita substituir junction patches por isso?
6. **OSM sem clip por raio + Hermite split recursivo** (§6): aceita?
7. **Edição com handles A/B (move C1/C2 junto)** (§7): aceita esse modelo de drag? Ou quer todos os handles livres?
8. **Migration com backup + warnings** (§8): aceita o trade-off de perder algumas customizações visuais?
9. **Riscos** (§9): algum risco crítico que faltou avaliar?
10. **Plano em 8 fases × 13-17 dias úteis** (§10): aceita essa ordem? Quer juntar/separar fases?

Se aprovado integral, prossigo para H.1. Se algum ponto precisa ajuste, refaço a spec antes de codar.

**Nada de código até sua aprovação.**
