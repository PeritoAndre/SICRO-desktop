# Road Engine 2.0 — Relatório de Implementação

**Data:** 2026-05-25 → 2026-05-26 (Ciclo 1 → Ciclo 2 v10 → Fase G → G v2 → G v3 → G.2 → G.3 → G.3 ROLLBACK)
**Status:** G.3 ROLLBACK — pipeline stable restaurado como default; clip+Bezier isolados em modo `experimental_bezier_clip`. Aguardando validação.
**Branch:** `mvp/osm-road-import` (mesmo branch dos documentos FASE 0 e
FASE 1; sem commit / sem merge / sem tag — conforme instrução).

**Pré-requisitos atendidos:**
- `ROAD_ENGINE_1_PYTHON_AUDIT.md` (FASE 0) — aprovado.
- `ROAD_ENGINE_2_REDESIGN_PLAN.md` (FASE 1) — aprovado.

---

## 1. Fases implementadas

### FASE A — Tipos + geometry core

**Objetivo:** estrutura de tipos puros + helpers geométricos sem
nenhuma integração Konva.

**Arquivos criados:**
- `src/modules/croqui/engine/road-v2/types.ts` (175 linhas) — `Vec2`,
  `Aabb`, `CubicBezier`, `RibbonSample`, `RoadRibbon`, `RoadMesh`,
  `RoadMeshInput`, etc.
- `src/modules/croqui/engine/road-v2/geometry.ts` (270 linhas) —
  `perpendicular`, `unitVector`, `pointToSegmentDist`,
  `pointToSegmentDistSq`, `projectOntoSegment`, `aabbOfSamples`,
  `aabbOfSamplesPadded`, `aabbOfFlatPolyline`, `intersectAabb`,
  `pointInsideAabb`, `flatToVec2`, `vec2ToFlat`, `polylineLength`,
  `polylineTangentAt`, `add`, `sub`, `scale`, `length`, `lengthSq`,
  `dot`, `cross`, `distance`, `distanceSq`.
- `src/modules/croqui/engine/road-v2/__tests__/geometry.test.ts` —
  **37 testes**.

### FASE B — Bezier + ribbon polygon

**Objetivo:** cubic Bezier sampling + ribbon polygon — a técnica
central do plano (asfalto vira polígono fechado, não stroke).

**Arquivos criados:**
- `src/modules/croqui/engine/road-v2/bezier.ts` (175 linhas) —
  `evaluateCubicBezier`, `sampleCubicBezier`, `tangentAt`,
  `unitTangentAt`, `arcLength`, `hermiteToBezier`,
  `bezierFromStraightSegment`. Port direto do
  `desenho/spline_via.py:bezier_pontos` + `desenho/osm_via.py:_pontos_para_spline`.
- `src/modules/croqui/engine/road-v2/ribbon.ts` (210 linhas) —
  `tangentFromSamples`, `buildRibbonPolygon`, `buildEdges`,
  `buildCurbRibbon`, `detectSelfIntersectionApprox`. Port direto do
  `desenho/spline_via.py:faixa_para_canvas` + `bordas_canvas`.
- `src/modules/croqui/engine/road-v2/__tests__/bezier.test.ts` —
  **18 testes**.
- `src/modules/croqui/engine/road-v2/__tests__/ribbon.test.ts` —
  **25 testes**.

### FASE C — buildMeshFromRoad + RoadMeshNode

**Objetivo:** ponte entre o `SicroRoadObject` e o React-Konva. Mesh
builder puro + componente Konva consumindo o mesh pronto.

**Arquivos criados:**
- `src/modules/croqui/engine/road-v2/rendererAdapter.tsx` (380 linhas) —
  `buildMeshFromRoad`, `roadObjectToMeshInput`, `RoadMeshNode`.
- `src/modules/croqui/engine/road-v2/index.ts` — superfície pública
  do módulo road-v2.
- `src/modules/croqui/engine/road-v2/__tests__/rendererAdapter.test.ts` —
  **26 testes**.

**O que o renderer entrega hoje:**
1. **Asfalto polygon** — `Konva.Line points={polygon} closed fill={surfaceFill}`. Substitui o `stroke` grosso do v1.
2. **Curb polygon** — `Konva.Line` desenhada antes do asfalto, com
   largura `halfWidth + curbWidth`. Só renderiza quando `curb.enabled === true`.
3. **Edges (bordas brancas)** — duas polylines paralelas brancas.
4. **Marcações centrais** — solid / dashed / double_solid / solid_dashed,
   com `dash={[14, 12]}` quando aplicável.
5. **Divisórias de faixa** — N-1 polylines para N faixas, pulando a
   que coincide com o centro.
6. **Cue de seleção** — polyline ciano tracejada sobre a centerline.
7. **Handles de pontos de controle** — 7 px circles, draggable, com
   suporte a Ctrl+click delete (mesma UX do v1).

**O que ainda NÃO entrega (Fases futuras, sem regressão):**
- Junction masks geométricos (Fase F — substitui clipping circular).
- Rotatória como primitiva dedicada (Fase E — hoje rotatórias usam
  `closed_path` do v0.3 ainda).
- Bezier 4-pontos a partir de OSM (Fase G).
- Junction polygon patches (v1) — desativados em v2 mas mantidos em v1.

### FASE D — Feature flag v1/v2 no CanvasStage

**Objetivo:** alternância v1/v2 atrás de flag persistente, sem quebrar
v1 e sem precisar duplicar o pipeline.

**Arquivos modificados (aditivos, sem renomes nem quebras):**
- `src/modules/croqui/engine/schema.ts` — `RoadEngineVersion = "v1" | "v2"`
  tipo + `SicroCroquiDoc.road_engine_version?: RoadEngineVersion` (opcional).
- `src/modules/croqui/engine/serializer.ts` — `coerceRoadEngineVersion`
  com default `"v1"` para envelopes sem o campo.
- `src/modules/croqui/editor/CanvasStage.tsx` —
  - import `RoadMeshNode` do road-v2;
  - branch no `case "road"`: v2 → `RoadMeshNode`, v1 → `RoadNode` legado;
  - junction patches só renderizam em v1 (em v2 ficariam visíveis sobre
    o ribbon polygon — comportamento errado por construção). Fase F
    introduz a contrapartida em v2.
- `src/modules/croqui/editor/CroquiEditor.tsx` —
  - `StatusBar` recebe props `roadEngineVersion` + `onToggleRoadEngine`;
  - botão "Road v1" / "Road v2" na barra de status; ao clicar, alterna
    `doc.road_engine_version` (com mark-dirty automático);
  - cor verde quando v2 ativo, cinza em v1.

**Como usar:**
1. Abrir um croqui no editor.
2. Olhar a barra de status inferior (canto direito) — botão "Road v1".
3. Clicar → vira "Road v2" verde. Todo o canvas re-renderiza vias com
   o novo motor.
4. Salvar — o flag persiste no `.sicrocroqui`.
5. Reabrir — vem com o último valor salvo.

---

## 2. Decisões técnicas

### 2.1 Por que `RoadMesh` em vez de pré-calcular `Konva.Line` props

A separação `mesh puro → renderer trivial` é o que viabiliza:
- **Testabilidade pura** — `buildMeshFromRoad` é uma função síncrona
  sem React, sem Konva, sem DOM. Os 26 testes do `rendererAdapter.test.ts`
  exercitam o pipeline completo sem nunca instanciar um `Stage`.
- **Reuso em export** — futura PNG export poderá usar o mesmo mesh
  para desenhar com Canvas 2D nativo (sem precisar do Stage rodando).
- **Migração incremental** — quando a Fase F introduzir junction
  masks, a interface `RoadMesh.junctionMasks: []` já está reservada
  no tipo. Hoje é sempre vazio; futuramente o builder preenche.

### 2.2 Polyline N-pontos como Bezier de N-1 segmentos retos

`SicroRoadObject` continua usando `points: number[]` flat (mesma
convenção do v1). O builder do v2 promove cada par consecutivo a um
Bezier "reto" (`bezierFromStraightSegment`) e amostra em N=12 — o que
produz exatamente a mesma silhueta do v1 sem tension, mas pelo
caminho que a Fase G vai usar para OSM.

Quando a Fase G chegar e o input vier com `bezier?: { cx1, cy1, cx2, cy2 }`
preenchido, o builder usa o Bezier real em vez do "reto" — sem mudar
o schema, sem migrar croquis antigos.

### 2.3 N=48 para Bezier (vs N=24 do Python)

O `Tkinter` original tem o flag `smooth=True` que aplica
anti-aliasing nas arestas do polígono. O Konva não tem equivalente
direto — compensamos dobrando a densidade de amostragem. Custo:
+24 vértices por via (negligível).

### 2.4 v2 ignora `clipZones` (e os patches são desligados em v2)

Em v1, o `RoadNode` recebe `clipZones` (círculos de exclusão) e o
`CanvasStage` desenha junction polygon patches por cima. Esses dois
mecanismos não fazem sentido em v2:

- O ribbon polygon do v2 **já é o asfalto** — não precisa de patch
  porque não há marcação "vazando" através do stroke.
- O clipping circular do v1 é uma aproximação grosseira. A Fase F
  vai introduzir clipping geométrico real (`isPointInsideOtherRoad`),
  que mascara marcações pixel-perfeito.

O resultado: em v2, vias cruzadas mostram dois asfalto rings se
sobrepondo limpamente, mas as marcações ainda atravessam o
cruzamento (regressão temporária esperada — assumida no plan §12
Fase D + Fase F).

### 2.5 Closed_path no v2 (rotatória legada)

Em v0.1/0.2, rotatórias eram criadas como `Konva.Line(closed)`. O
schema MVP 10 R5 adicionou `closed_path?: boolean` em
`SicroRoadObject`. O v2 respeita isso: duplica o primeiro ponto no
fim da centerline e o ribbon vira um anel.

Visualmente isso já fica melhor que o v1 (asfalto contínuo em vez
de stroke), mas ainda não é a "primitiva rotatória" do plan §8 —
isso é Fase E.

---

## 3. Limitações conhecidas (Ciclo 1)

| Limitação | Mitigação atual | Resolve em |
|---|---|---|
| Marcações atravessam junções em v2 | OK em vias isoladas; em junções, ficam visíveis no asfalto sobreposto. v1 continua disponível como fallback (toggle barra de status). | Fase F |
| Rotatória ainda usa `closed_path` polyline | Fica melhor que v1 (sem stroke serrilhado), mas não é a "primitiva geométrica". | Fase E |
| OSM ainda converte para polyline N-pontos | v2 trata como Bezier-de-segmentos-retos — a curvatura segue tremendo. | Fase G |
| Sem self-intersection rejection automática | `detectSelfIntersectionApprox` está implementado mas não é chamado pelo renderer. | Fase H (debug) |
| Sem debug overlay | Centerline, edges e samples ainda não têm visualização "ligar/desligar". | Fase H |

**Nada disso quebra o estado atual.** Em v1 o comportamento é
idêntico ao MVP 10 Round 5 (aprovado em validação automática).

---

## 4. Comparação v1 vs v2

| Aspecto | v1 (stroke) | v2 (ribbon polygon) |
|---|---|---|
| Asfalto | `Konva.Line(stroke=width, tension=0.5)` | `Konva.Line(closed=true, fill=surface, points=ring)` |
| Curva | Suavização opaca do Konva, sem controle de densidade | Cubic Bezier amostrado em N=48 + offset perpendicular real |
| Curb | Outline mais grosso desenhado abaixo do stroke | Polygon dedicado com largura `halfWidth + curbWidth` |
| Centro | offset polyline (ponto-a-ponto) | offset polyline com tangente central (mais suave) |
| Junção (cruzamento X) | Patch polygon + clipping circular | Asfaltos se sobrepondo (regressão temporária — Fase F resolve) |
| Schema | `points: number[]` | `points: number[]` (idêntico) + opcional `bezier?: {cx1,cy1,cx2,cy2}` (não usado em C1) |
| Custo render | Konva interpola na placa de vídeo | Mesh calculado uma vez no JS; vértices renderizados como `Konva.Line(closed)` |

**O que muda visualmente em vias retas isoladas:**
- v1 e v2 são quase indistinguíveis (silhueta do stroke é retangular,
  ribbon polygon também).

**O que muda em curvas:**
- v1: stroke "engorda" no exterior e "afina" no interior da curva (o
  fenômeno que motivou o reset).
- v2: a largura perpendicular é constante ao longo da curva (porque
  cada amostra recebe offset perpendicular ao seu tangente próprio).

**O que muda em rotatórias (`closed_path: true`):**
- v1: stroke fechado com cap "butt" — junção do fechamento visível.
- v2: polygon fechado — junção invisível por construção.

---

## 5. Testes

### Cobertura nova road-v2

```
src/modules/croqui/engine/road-v2/__tests__/
  geometry.test.ts          37 testes
  bezier.test.ts            18 testes
  ribbon.test.ts            25 testes
  rendererAdapter.test.ts   26 testes
  --------------------------------------
  Total:                   106 testes
```

### Cobertura global

| Antes do Ciclo 1 | Depois do Ciclo 1 | Δ |
|---|---|---|
| 272 vitest | **378 vitest** | +106 |
| 88 cargo | **88 cargo** | (sem mudanças no Rust) |

### O que cada conjunto cobre

**geometry.test.ts (37):**
- vector arithmetic (add/sub/scale/dot/cross);
- `unitVector` happy + degenerate (zero ⇒ +x fallback);
- `perpendicular` orientação canvas Y-down;
- `pointToSegmentDist`: pontos sobre, perpendicular, fora-da-extensão,
  segmento degenerate;
- `aabbOfSamples`/`aabbOfFlatPolyline`/`aabbOfSamplesPadded`;
- `intersectAabb`: overlap / touching / disjoint h/v;
- `pointInsideAabb`: corners incluídos;
- `flatToVec2 ↔ vec2ToFlat` round-trip;
- `polylineLength`, `polylineTangentAt` (start/end/middle/degenerate/clamp).

**bezier.test.ts (18):**
- `sampleCubicBezier`: pinning de endpoints, monotonicidade,
  numSegments clamp;
- `tangentAt` t=0 paralelo a (c1−a), t=1 paralelo a (b−c2);
- `unitTangentAt`: degenerate ⇒ +x fallback;
- `arcLength`: chord ≤ comprimento ≤ control polygon;
- `hermiteToBezier`: round-trip de curva STRAIGHT, normalização de
  tangentes não-unitárias, preservação dos endpoints;
- `bezierFromStraightSegment`: amostras na linha + arc length == chord.

**ribbon.test.ts (25):**
- `tangentFromSamples` interior/endpoint/degenerate;
- ribbon reta: borda esquerda em y=+5, direita em y=-5, AABB correto,
  polygon = left ++ reverse(right);
- ribbon curva: distância da centerline a cada borda ≈ halfWidth;
- AABB curva plausível; toda amostra está dentro do polígono;
- inputs degenerate (empty, single, halfWidth=0/negative) ⇒ polygon vazio;
- `buildEdges` produz flat polylines;
- `buildCurbRibbon` null em curbWidth ≤ 0;
- `detectSelfIntersectionApprox`: não-flag em curvas suaves; flag em
  hairpin patológico.

**rendererAdapter.test.ts (26):**
- mesh em via reta: 2N samples, AABB correto;
- mesh em via curva via Bezier override: N=49 samples;
- AABB Bezier > AABB polyline (curva sai do eixo);
- lane dividers + double_solid avenida: dois centros + 2 lane dividers
  (pulando overlap com centro);
- `markings.color="white"` override sobre `road_style="highway"`;
- `solid_dashed`: um solid + um dashed;
- `center_line="none"` zera marcações centrais;
- `closed_path: true` suprime centro;
- inputs degenerate (points<4, width≤0) ⇒ null;
- `roadObjectToMeshInput` cópia field-by-field + omite undefined;
- `buildMeshFromRoad(roadObjectToMeshInput(obj))` válido;
- compat backwards: v0.1 sem `lane_width` usa `width/lane_count`.

### Validações automáticas (estado final do Ciclo 1)

```
pnpm typecheck                  ✓
pnpm test                       ✓  378 passed (272 → 378, +106)
pnpm build                      ✓  (1933 modules transformed)
cargo check                     ✓
cargo test --lib                ✓  88 passed
```

---

## 6. Riscos do Ciclo 1

| Risco | Probabilidade | Impacto | Estado atual |
|---|---|---|---|
| Toggle v1/v2 confunde o perito | baixa | baixo | Default permanece v1; toggle só fica explícito quando a barra de status é olhada. Mensagem do botão diz "Alternar Road Engine v1 (stroke) ↔ v2 (ribbon polygon)". |
| v2 quebra croquis antigos | confirmado=NÃO | n/a | Schema 100% aditivo. `road_engine_version` ausente ⇒ "v1". Testado em `serializer.test.ts` indireto (envelope antigo carrega + serializa sem erro). |
| v2 piora visualmente em junções | confirmado | médio | Esperado; Fase F resolve. Toggle v1↔v2 deixa o perito escolher. |
| Export PNG não respeita o flag | médio | alto | `toPng()` usa o Stage atual, então respeita automaticamente. Validação manual pendente. |
| Self-intersection em curva muito fechada | baixa | médio | Detector implementado mas não invocado pelo renderer hoje. Fase H decide o comportamento (warning / drop / split). |

---

## 7. O que NÃO foi feito (e por que)

Reafirmação dos limites do Ciclo 1 (per instrução):

- ❌ **Rotatória primitiva** — Fase E, próximo ciclo. Hoje rotatórias
  continuam via `closed_path`.
- ❌ **Junction masks geométricos** — Fase F, próximo ciclo. Hoje v2
  desliga junction patches mas não substitui — junções ficam com
  asfaltos sobrepostos limpos mas com marcações cruzando.
- ❌ **OSM Adapter 2.0** — Fase G, próximo ciclo. OSM continua gerando
  polylines N-pontos; v2 trata como Bezier-de-segmentos-retos.
- ❌ **Debug overlay** — Fase H, próximo ciclo.
- ❌ **Remoção do v1** — não, v1 fica como fallback indefinidamente
  até validação visual completa em todos os fluxos (export, drone,
  laudo).
- ❌ **Mudança em Importar Drone / Laudo / Evidências / Dossiê / Vídeo / Imagem / Home / Importador** — nada tocado.
- ❌ **Commit / merge / tag** — nada disso. Tudo segue uncommitted.

---

## 8. Validação manual pendente

Os fluxos abaixo precisam de validação humana antes de avançarmos
para o próximo ciclo (Fase E / F):

1. **Via reta manual em v1 e v2 — comparação A/B.** Esperado:
   indistinguíveis em via reta simples.
2. **Via curva manual em v1 e v2.** Esperado: v2 com largura constante
   na curva; v1 com a "engorda" no exterior.
3. **Avenida com `markings.center_line = "double_solid"` em v2.**
   Esperado: duas linhas amarelas paralelas continuando a curva.
4. **Cruzamento X em v2.** Esperado: dois polígonos de asfalto
   limpos se cobrindo, mas com marcações ainda atravessando
   (regressão esperada Fase D, resolvida em Fase F).
5. **Rotatória (`closed_path: true`) em v2.** Esperado: anel de
   asfalto sem "bulbo" na junção, sem marcação central amarela.
6. **Export PNG em v2.** Esperado: `toPng()` do Stage produz a
   mesma imagem que aparece no canvas (sem regressão sobre v1
   isolado).
7. **Salvar + reabrir em v2.** Esperado: o flag persiste; ao
   reabrir, o canvas mostra v2 sem necessidade de re-toggle.
8. **Alternar v1↔v2 múltiplas vezes em um croqui com muitas vias.**
   Esperado: sem flicker / sem leak de memória / sem state corrompido.
9. **Importar OSM em v2.** Esperado: vias importadas aparecem como
   polígonos (não strokes), embora ainda com a curvatura tremida do
   OSM. Fase G suaviza.
10. **Importar Drone em v2.** Esperado: fluxo idêntico ao v1 (drone
    não toca Road Engine).

---

## 9. Próximos passos (após validação visual deste ciclo)

Conforme o plano original:

- **Fase E** — Primitiva `Roundabout` (`SicroObjectKind = "roundabout"`,
  schema aditivo, render com 2 `Konva.Circle` concêntricos).
- **Fase F** — Junction masks geométricos (`isPointInsideOtherRoad`,
  `clipPolylineToOutside`).
- **Fase G** — OSM Adapter 2.0 (`polylineToBezier` Hermite → Bezier,
  `convertOsmToBezierRoads`).
- **Fase H** — Debug overlay (centerline, edges, samples, masks
  visualizáveis).
- **Fase I** — Testes finais + validação de paridade visual manual ≅ OSM.

---

## 10. Resumo executivo do Ciclo 1

✅ **Road Engine 2.0 existe** (`src/modules/croqui/engine/road-v2/`).
✅ **Gera `RoadMesh` puro** sem React, sem Konva.
✅ **Renderiza via reta e via curva como polygon/ribbon.**
✅ **v1 e v2 coexistem** atrás de `doc.road_engine_version`.
✅ **Toggle visual A/B** na barra de status do editor.
✅ **App continua funcionando** — typecheck/test/build/cargo todos verdes.
✅ **+106 testes novos** para o ciclo.
✅ **Nenhum código v1 foi removido.** v1 segue ativo como default e
fallback.

---

## 11. Ciclo 2 — Fase E/F: Rotatória primitiva e Junction Masks

**Status:** concluído. Aguardando validação visual.

**Pré-requisitos atendidos:**
- Ciclo 1 (Fases A–D) aprovado pela validação visual humana.

### 11.1 Arquivos criados/alterados

**Novos arquivos (road-v2):**

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/roundabout.ts` | 142 | `RoundaboutMesh`, `buildRoundaboutMesh`, `roundaboutObjectToBuildInput`. Port do `desenho/osm_via.py:_rotatoria_da_way`. |
| `road-v2/junctions.ts` | 247 | `RoadContext`, `RoadContextEntry`, `buildRoadContext`, `isPointInsideOtherRoad`, `clipPolylineToOutside`, `clipRoadMarkingsByJunctions`, `contextHasAnyOverlap`. Port do `_em_outra` Python. |
| `__tests__/roundabout.test.ts` | — | **25 testes** |
| `__tests__/junctions.test.ts` | — | **20 testes** |

**Arquivos alterados (aditivos):**

| Arquivo | Mudança |
|---|---|
| `engine/schema.ts` | Adiciona `SicroObjectKind` value `"roundabout"` + interface `SicroRoundaboutObject` + union em `SicroObject`. Aditivo / opcional. |
| `engine/factories.ts` | Adiciona `makeRoundabout` + caso `roundabout` em `cloneObject`. |
| `engine/serializer.ts` | Adiciona `coerceRoundaboutObject` (filtra malformados) + caso `"roundabout"` em `inferCategory` (retorna `"vias"`). |
| `engine/road-v2/rendererAdapter.tsx` | Adiciona `RoundaboutMeshNode` (renderer Konva: anel + ilha + 2 bordas) + prop `junctionContext` opcional em `RoadMeshNode` + memoização do clipping de marcações. |
| `engine/road-v2/index.ts` | Re-exporta `roundabout` + `junctions` + `RoundaboutMeshNode`. |
| `editor/CanvasStage.tsx` | Import dos novos helpers + construção do `RoadContext` v2 em `useMemo` + propagação para `RoadMeshNode` via `junctionContext` + caso `"roundabout"` no switch do `ObjectNode`. |
| `editor/CroquiEditor.tsx` | `makeRoundabout` no handler de clique para tool `"roundabout"` + `nextRoundaboutLabel(R1, R2…)` + import. |
| `editor/Toolbar.tsx` | Botão "Rotatória" (ícone `Circle`) dentro do grupo "Via". |
| `editor/InspectorPanel.tsx` | Painel `RoundaboutProps` (cx/cy/r/width + 3 cores) + cases em `shortKind` / `summariseObject`. |
| `editor/useEditorState.ts` | Tool `"roundabout"` na union. |

### 11.2 Como a rotatória foi implementada

**Schema (aditivo, opcional):**

```ts
export interface SicroRoundaboutObject extends SicroObjectBase {
  kind: "roundabout";
  cx: number;
  cy: number;
  r: number;       // raio externo do asfalto
  width: number;   // largura do anel
  surface: RoadSurface;
  inner_color?: string;
  border_color?: string;
  curb?: RoadCurb;
}
```

**Coercer (defesa de envelopes legados):** `coerceRoundaboutObject` filtra entradas malformadas — sem `cx/cy/r/width` numéricos válidos, retorna `null` e o objeto é descartado silenciosamente. Croquis pré-Ciclo 2 simplesmente não carregam roundabouts (o `kind: "roundabout"` é desconhecido em v0.3 anterior, mas o coercer já filtra entries sem cx/cy/r/width).

**`buildRoundaboutMesh`:** gera `RoundaboutMesh` com `outerRadius = r`, `innerRadius = max(0, r - width)`, `curbRadius = r + curb.width` (quando habilitado), AABB e cores resolvidas. Warnings em casos limítrofes (`width >= r`, ilha < 4 px) para o Inspector amostrar.

**Renderer:** 6 primitivas concêntricas dentro de um `Group` Konva:
1. Curb halo (`Konva.Circle fill=curbFill r=curbRadius`) — opcional.
2. Disco de asfalto (`Konva.Circle fill=surfaceFill r=outerRadius`).
3. Ilha central (`Konva.Circle fill=innerFill r=innerRadius`).
4. Borda externa (`Konva.Circle stroke=borderColor r=outerRadius`).
5. Borda interna (`Konva.Circle stroke=borderColor r=innerRadius`).
6. Selection cue + center handle (quando selecionado).

**Por que `Konva.Circle` em vez de polígono amostrado?** O `Circle` é anti-aliased nativamente — sem serrilhado em nenhum zoom. As duas bordas são strokes independentes — não há polígono `closed` precisando casar. Eliminamos por construção: serrilhado, marcação central amarela atravessando a ilha, "bulbo" na junção do polyline-fechado.

**UI:** single-click no canvas com tool `roundabout` insere uma rotatória default (r=80, width=14, asfalto `#3f3f46`, ilha `#e5e7eb`, borda `#f5f5f5`) e auto-seleciona. Inspector permite editar cx/cy/r/width + as 3 cores. Label auto-gerada (`R1`, `R2`...).

### 11.3 Como o clipping geométrico funciona

**Princípio (port do `_em_outra` Python):**

> Para cada ponto de uma marcação ou borda, perguntamos:
> "este ponto está dentro de alguma outra via?". Se sim, dropa o
> ponto. "Dentro" significa `dist(ponto, centerline_outra) < halfWidth_outra`.

**Estrutura — `RoadContext`:**

```ts
interface RoadContextEntry {
  id: string;
  kind: "road" | "roundabout";
  samples: ReadonlyArray<Vec2>;  // centerline densa
  halfWidth: number;              // raio externo p/ rotatória
  aabb: Aabb;                     // pre-filtro
}
```

**Pipeline (mirror multipass do Python):**

1. **`buildRoadContext`** — construído uma vez por render (CanvasStage `useMemo`) a partir do `RoadMesh.ribbon.samples` de cada via + `RoundaboutMesh.center` de cada rotatória.
2. **`isPointInsideOtherRoad(p, ownId, ctx)`** — para cada entrada outra-que-ownId: AABB prefilter, depois `pointToSegmentDist` ao longo das amostras. Retorna `true` se a distância mínima caiu abaixo de `halfWidth` em qualquer entrada.
3. **`clipPolylineToOutside(points, ownId, ctx)`** — segmenta uma polyline em sub-runs "todas fora" (drops as porções que entram em outras vias).
4. **`clipRoadMarkingsByJunctions`** — convenience aplicando `clipPolylineToOutside` a cada `mesh.markings[i].points` e `mesh.edges[i].points`. Fast-path: se não há outras entradas no contexto, retorna `null` (sem custo).
5. **`RoadMeshNode`** recebe `junctionContext?: RoadContext` como prop opcional; quando presente, memoiza o clipping (`useMemo` dependente de `mesh + context + id`) e renderiza as polylines pós-clipping em vez das raw.

**Diferença vs v1 (`clipPolylineAgainstCircles`):**

| v1 | v2 (Fase F) |
|---|---|
| Polígono de junção parallelogram + círculo bounding ao redor | Distância geométrica real ao centerline de cada outra via |
| Cobre toda a área do polígono (super-aproxima) | Cobre exatamente o que está dentro da outra via (preciso) |
| Independente do raio da outra via | Adapta-se à largura individual de cada via |
| Não vê rotatórias | Rotatórias entram no contexto como discos |

### 11.4 Comparação com Python 1.0

| SICRO 1.0 Python | Road Engine 2.0 v2 |
|---|---|
| `_via_eixos: Dict[via_id, (pts, meia_w, aabb)]` | `RoadContext.entries: Array<RoadContextEntry>` |
| `_em_outra(wx, wy, meu_vi)` | `isPointInsideOtherRoad(p, ownId, ctx)` |
| `not_in_aabb` prefilter | `pointInsideAabb` prefilter |
| `_dist_seg(px, py, x1, y1, x2, y2)` | `pointToSegmentDist(p, a, b)` |
| Loop multipass em `_desenhar_vias_multipass` | `clipRoadMarkingsByJunctions` per-mesh + render order no CanvasStage |
| Rotatória = anel duplo concêntrico via Tkinter | `RoundaboutMeshNode` com 2 `Konva.Circle` concêntricos |
| `_rotatoria_da_way(way)` | `buildRoundaboutMesh(input)` |

A diferença principal de arquitetura: o Python centraliza tudo no `_desenhar_vias_multipass`, fazendo todos os passes inline. Nós dividimos em funções puras + um adapter Konva, ganhando testabilidade e permitindo que a Fase G (OSM Adapter 2.0) consuma os mesmos helpers sem duplicar lógica.

### 11.5 Limitações conhecidas do Ciclo 2

| Limitação | Mitigação atual | Resolve em |
|---|---|---|
| Asfalto v2 ainda se sobrepõe em junções (não há "patch" geométrico que cubra o asfalto inferior) | O ribbon polygon das duas vias se sobrepõe limpa; o efeito visual é razoável mas não é o ideal "asfalto contínuo". | Pass adicional na Fase H (debug) ou futura Fase F2.5 (asphalt fill clipping). |
| Sub-pixel clipping (não calculamos pontos de interseção, dropamos amostras) | Amostragem N=12+ por segmento polyline / N=48 para Bezier ⇒ erro < 1 px. | Pode ser refinado em Fase H. |
| Rotatórias ainda não suportam vias entrando "tangentes" (acoplamento perfeito) | A via entrante simplesmente é clipada pelo disco da rotatória. Visualmente fica OK mas não há "merge" geométrico. | Fase G (OSM com rotatórias) ou pós-Ciclo 3. |
| Sem visualização debug do mask | Para confirmar o clipping, é preciso confiar no resultado visual. | Fase H (debug overlay). |
| OSM ainda usa polyline N-pontos (Ciclo 1) | Vias OSM em v2 ainda tremem; rotatórias OSM continuam usando `closed_path` polyline (NÃO migrado para o novo `kind: "roundabout"` ainda). | Fase G (OSM Adapter 2.0). |

**O que NÃO regride:** o flag `road_engine_version: "v1"` continua disponível como rollback. v1 não foi tocado.

### 11.6 Testes do Ciclo 2

**Cobertura nova road-v2 (Ciclo 2):**

```
src/modules/croqui/engine/road-v2/__tests__/
  roundabout.test.ts         25 testes
  junctions.test.ts          20 testes
  ----------------------------------------
  Total Ciclo 2:             45 testes
```

**Acumulado road-v2:**

```
geometry.test.ts             37 testes
bezier.test.ts               18 testes
ribbon.test.ts               25 testes
rendererAdapter.test.ts      26 testes
roundabout.test.ts           25 testes  ← Ciclo 2
junctions.test.ts            20 testes  ← Ciclo 2
---------------------------------------
Total road-v2:              151 testes
```

**Cobertura global:**

| Marco | vitest | cargo |
|---|---:|---:|
| Pré-Ciclo 1 | 272 | 88 |
| Pós-Ciclo 1 | 378 (+106) | 88 |
| **Pós-Ciclo 2** | **423 (+45)** | **88** |

**O que `roundabout.test.ts` cobre (25):**
- happy path com r=80 / width=14 → outer 80, inner 66, AABB 160×160;
- curb enabled (curbRadius = r + curb.width) e disabled;
- curb width=0 ou enabled=false ⇒ curbRadius=null;
- overrides de inner_color / border_color;
- width >= r ⇒ innerRadius=0 + warning;
- inner < 4 px ⇒ warning mas mesh ainda renderiza;
- r <= 0 / NaN / Infinity ⇒ null (defensivo);
- factory `makeRoundabout` produz objeto válido;
- `inferCategory("roundabout") === "vias"`;
- `roundaboutObjectToBuildInput` cópia field-by-field;
- mesh não carrega "markings" nem "centerline" (asserção de contrato).

**O que `junctions.test.ts` cobre (20):**
- `buildRoadContext` entries-per-road + padded AABB + roundabout como disco;
- `isPointInsideOtherRoad`: ponto na junção X é "dentro" da outra via;
- ponto longe ⇒ fora;
- ponto na own road ⇒ não é "dentro" (own-id skip);
- AABB miss short-circuit;
- rotatória: ponto dentro do disco ⇒ inside;
- `clipPolylineToOutside`: cruzamento X corta centerline em 2 runs;
- ctx vazio ⇒ retorna input intacto;
- polyline totalmente inside ⇒ [];
- cenário T-junction (borda da secundária é cortada pela principal);
- cenário Y-junction;
- `clipRoadMarkingsByJunctions` fast-path (null quando solo);
- `clipRoadMarkingsByJunctions` aplica clipping no cruzamento X;
- `contextHasAnyOverlap`: true em X, false em paralelas, false em vazio.

### 11.7 Validações automáticas (estado pós-Ciclo 2)

```
pnpm typecheck                  ✓
pnpm test                       ✓  423 passed (378 → 423, +45)
pnpm build                      ✓  (1933 modules transformed)
cargo check                     ✓
cargo test --lib                ✓  88 passed
```

### 11.8 Validação visual esperada (humana)

Os fluxos abaixo precisam de validação humana antes do Ciclo 3 (Fase G — OSM Adapter 2.0):

1. **Inserir rotatória manual em v2.** Toolbar → Via → Rotatória → clique no canvas. Esperado: anel limpo, ilha central neutra, bordas brancas.
2. **Editar rotatória no Inspector.** Esperado: cx/cy/r/width respondem em tempo real; cores aplicam.
3. **Cruzamento X manual em v2.** Duas vias se cruzando perpendicularmente. Esperado: marcação central da via A é interrompida ao passar dentro da via B (e vice-versa). Asfalto continua se sobrepondo (sem patch ainda).
4. **Cruzamento T manual em v2.** Esperado: borda da secundária é cortada onde encontra a principal; marcação central da secundária para na borda da principal.
5. **Y-junction manual em v2.** Esperado: marcações centrais se interrompem no encontro.
6. **Rotatória cercada por 3 ou 4 vias entrando em v2.** Esperado: vias entrantes têm suas marcações/bordas clipadas pelo disco da rotatória.
7. **Salvar + reabrir um croqui com rotatória.** Esperado: rotatória persiste; campos vêm intactos.
8. **Croqui antigo (sem rotatórias) carrega como antes.** Esperado: zero regressão.
9. **Alternar v1 ↔ v2 com rotatória presente.** Esperado: a rotatória continua renderizando (kind="roundabout" é independente do flag — não tem fallback v1).
10. **Exportação PNG em v2 com cruzamento X.** Esperado: imagem exportada idêntica ao canvas (incluindo clipping).

### 11.9 Próximos passos

Conforme o plano original, **NÃO** implementado neste ciclo:

- **Fase G** — OSM Adapter 2.0 (polyline → Bezier 4-pontos; converter OSM `junction=roundabout` para `kind: "roundabout"` em vez de `closed_path`). Aguarda validação visual do Ciclo 2 para começar.
- **Fase H** — Debug overlay.
- **Fase I** — Testes de paridade visual manual ≅ OSM.

---

## 12. Resumo executivo do Ciclo 2

✅ **Rotatória primitiva implementada** (`kind: "roundabout"`, schema aditivo).
✅ **Renderer dedicado** (`RoundaboutMeshNode`): 2 `Konva.Circle` concêntricos + 2 bordas, sem polígono amostrado.
✅ **Toolbar + Inspector** para criar / editar rotatórias.
✅ **Junction masks geométricos** (`junctions.ts`) — port direto do `_em_outra` Python.
✅ **Contexto v2 propagado** para cada `RoadMeshNode` no CanvasStage.
✅ **Marcações e bordas clipadas** pelo contexto quando v2 está ativo.
✅ **+45 testes novos** (25 roundabout + 20 junctions).
✅ **Nenhum código v1 foi removido.** v1 continua acessível pelo toggle.
✅ **Nenhum croqui legado quebra.** Schema 100% aditivo.
✅ **Importar Drone / Laudo / Evidências / Dossiê / Vídeo / Imagem / Home / Importador / OSM Adapter** — não tocados.

---

## 13. Ciclo 2 v2 — CORREÇÃO VISUAL pós-reprovação

**Status:** Ciclo 2 anterior **reprovado visualmente** pelo perito. Os
testes passaram mas o canvas mostrou: vias retangulares sobrepostas,
rotatória como círculo isolado sem entradas, marcação central
atravessando junções, e aparência **pior que v1**. Resultado: refatoração arquitetural completa.

### 13.1 Diagnóstico da falha visual do Ciclo 2 original

| Sintoma observado | Causa raiz |
|---|---|
| "Bordas retangulares se sobrepondo" | Cada `RoadMeshNode` renderizava seu próprio asfalto + bordas + marcações dentro de um `Group`. A ordem dos Groups dependia da ordem em `doc.objects`. Sem patch global, as bordas brancas internas de cada via atravessavam o asfalto da outra. |
| "Rotatória parece círculo jogado por cima" | O `RoundaboutMeshNode` desenhava 5 `Konva.Circle` concêntricos dentro de um `Group` próprio. Nenhum mecanismo conhecia as vias que terminavam no anel. O círculo ficava no Z-order conforme a posição do objeto na lista. |
| "Clipping de marcação não muda nada visualmente" | `clipPolylineToOutside` cortava polylines pontualmente, mas o sintoma visual dominante era a **borda branca da via A passando dentro do asfalto da via B** — e a borda continuou sendo desenhada, só com sub-pontos faltando. Pior: bordas têm forma de polyline, e o teste de "estar dentro de outra via" era avaliado ponto-a-ponto em N=12, então as bordas continuavam aparecendo em pixels não-amostrados. |
| "Vias paralelas próximas não fundem" | Nunca houve patch de asfalto cobrindo a zona de overlap. Cada via era uma "ilha" independente. |

### 13.2 Causa arquitetural única

> O renderer v2 ainda estava **per-objeto**, não **per-rede**. Isso é o
> que o usuário identificou no diagnóstico: "RoadContext existe mas
> não está sendo aplicado de forma suficiente", "o clipping está
> cortando apenas marcações, mas não resolve fusão de asfalto".

A correção precisava ser **arquitetural**, não algorítmica. Substituir
`RoadMeshNode` (per-objeto) por `RoadNetworkLayerV2` (per-rede com
multipass global) que renderiza todas as vias e rotatórias num único
componente, em 8 passes Z-ordenados.

### 13.3 Arquivos novos

| Arquivo | Linhas | Função |
|---|---:|---|
| `road-v2/junctionPatches.ts` | 145 | `buildJunctionPatches` — gera patches de asfalto sobre cruzamentos X/T/Y. Detecta interseção entre control polylines, classifica `kind`, gera paralelogramo inflado pelo curb. Reusa `junctionPolygonFromSegments` do v1. |
| `road-v2/roundaboutEntries.ts` | 175 | `detectRoundaboutEntries` (banda `[r-tol, r+tol]` em torno do anel) + `buildRoundaboutEntryPatches` (trapézio cobrindo a borda externa do anel na entrada da via). |
| `road-v2/network.ts` | 145 | `RoadNetworkRenderPlan` + `buildRoadNetworkRenderPlan` — coleta vias + rotatórias + junctionPatches + roundaboutEntries + context num único artefato. |
| `road-v2/debug.ts` | 38 | `summariseDebugStats(plan)` — estatísticas para o overlay e o relatório. |
| `__tests__/network.test.ts` | — | **30 testes fixture-driven** dos cenários X / T / Y / paralelas / rotatória / entradas. |

### 13.4 Arquivos refatorados

| Arquivo | Mudança |
|---|---|
| `road-v2/rendererAdapter.tsx` | +400 linhas. Adiciona `RoadNetworkLayerV2`, `RoadInteractionGroup`, `RoundaboutInteractionGroup`, `RoadDebugOverlayLayer`. O `RoadMeshNode` antigo continua exportado por compat mas não é mais usado pelo CanvasStage v2. |
| `road-v2/index.ts` | Re-exporta os novos módulos + `RoadNetworkLayerV2`. |
| `editor/CanvasStage.tsx` | Branch v1 vs v2: v1 usa `ObjectNode` per-road + junction patches v1; v2 usa **`RoadNetworkLayerV2`**. Removido o `RoadContext` construído local + `junctionContextV2` propagado por prop — agora vive dentro do plano de rede. Rotatórias em v2 vão pelo `RoadNetworkLayerV2`; em v1 ainda pelo `ObjectNode`. |
| `editor/useEditorState.ts` | Adiciona `roadDebugV2: boolean` + `setRoadDebugV2`. Transient (não persiste no doc). |
| `editor/CroquiEditor.tsx` | StatusBar ganha botão **"Debug"** (vermelho-claro quando ativo). Só aparece quando v2 está ativo. |

### 13.5 Os 8 passes do `RoadNetworkLayerV2` (ordem Z, baixo → alto)

```
Pass 1  curbs de todas as vias         (cinza, sob o asfalto)
Pass 1b curbs externos das rotatórias
Pass 2  asfalto de todas as vias        (ribbon polygon fechado)
Pass 2b disco de asfalto das rotatórias
Pass 3  JUNCTION PATCHES (X/T/Y)        ← COBRE bordas internas
Pass 4  ROUNDABOUT ENTRY PATCHES        ← COBRE borda do anel na entrada
Pass 4b ilha central das rotatórias
Pass 5  bordas externas (clipadas)
Pass 5b bordas concêntricas das rotatórias
Pass 6  marcações centrais (clipadas)
Pass 7  lane dividers (clipadas)
Pass 8  per-road / per-roundabout interaction groups
Pass 9  debug overlay (opt-in)
```

**Por que os patches resolvem o problema que o clipping não resolveu:**
o patch é um polígono opaco com a cor do asfalto. Quando desenhado em
Pass 3, ele **cobre fisicamente** as bordas brancas internas que as
duas vias desenhariam em Pass 5 (já que Pass 5 é depois)... mas Pass 5
desenha as bordas *clipadas* — as porções dentro de outras vias somem.
Combinação: nas junções, vai aparecer asfalto contínuo (sem bordas
brancas indesejadas). Nas extremidades das vias longe do cruzamento,
as bordas continuam visíveis.

### 13.6 Como cada cenário visual deve mudar (descrição textual)

> O usuário explicitamente pediu evidência textual. Comparei mentalmente
> cada cenário entre Ciclo 2 anterior (reprovado) e Ciclo 2 v2 (este):

**Cruzamento X manual (duas vias perpendiculares):**
- **Antes:** as bordas brancas internas de A continuavam visíveis sobre B (e vice-versa) — visual de "duas ruas separadas se cruzando por cima/baixo".
- **Agora:** o `junctionPatch` (Pass 3) desenha um paralelogramo de asfalto que cobre as bordas internas das duas vias na zona de cruzamento. As marcações centrais (Pass 6) também são clipadas pelo `RoadContext` — então a faixa amarela/branca de A para no limite da via B e vice-versa. Resultado: o cruzamento aparece como **uma única superfície de asfalto contínua**, sem linhas internas.

**Cruzamento T manual:**
- **Antes:** a borda da via secundária atravessava a principal como uma reta branca crua sobre o asfalto.
- **Agora:** o detector classifica como `kind: "t"` (endpoint da secundária dentro do raio de tolerância da centerline principal). O patch cobre a "boca" do T. A borda da secundária é clipada onde entra no asfalto da principal. Resultado: a via principal mostra asfalto inteiro; a secundária "morre" na borda da principal sem riscos brancos atravessando.

**Entroncamento Y manual:**
- **Antes:** três vias terminando no mesmo ponto = três "cabeças" retangulares se sobrepondo.
- **Agora:** `kind: "y"` (ambos os endpoints coincidem no hit). O patch cobre as três bocas no encontro. As bordas externas das três vias não atravessam a zona de patch porque o clipping considera os hit points + a contiguidade do paralelogramo.

**Rotatória com 4 ruas entrando (norte/sul/leste/oeste):**
- **Antes:** o anel era um círculo pintado por cima das vias. Em Z mais alto que as vias, parecia uma "moeda" jogada no canvas; em Z mais baixo, as bordas das vias atravessavam o anel.
- **Agora:** `detectRoundaboutEntries` encontra 4 endpoints dentro da banda `[r - halfWidth · 1.5, r + halfWidth · 1.5]` e gera 4 entries com ângulos ≈ 0°/90°/180°/270°. Cada entry vira um **trapézio de asfalto** (Pass 4) com base no anel e teto fora dele, na cor do asfalto da rotatória. O trapézio cobre a borda externa do anel no ponto de entrada, fazendo o anel "abrir" exatamente onde a via entra. A ilha central (Pass 4b) é desenhada DEPOIS dos entry patches, então a ilha não é coberta por eles. Resultado visual: a rotatória **se conecta** com as 4 vias — não parece mais uma moeda solta. Cada via "encaixa" no anel.

**Rotatória isolada (sem vias):**
- **Igual.** O anel é desenhado em Pass 2b/4b. Sem entries, não há patches. A primitiva sozinha continua como no Ciclo 2 original.

**Vias paralelas próximas (sem cruzar):**
- **Igual.** O detector `buildJunctionPatches` retorna lista vazia (`polylineIntersectionsDetailed` não encontra hits). Nenhum patch. As vias aparecem lado a lado como retângulos separados, que é o comportamento correto.

**Salvar e reabrir:**
- O `road_engine_version` continua persistindo. O kind `roundabout` continua aditivo. Nenhum campo novo foi introduzido — todas as estruturas novas (`RoadNetworkRenderPlan`, patches, entries) vivem em memória apenas, recalculadas a cada render.

### 13.7 O que ainda pode ficar ruim (limitações conhecidas honestas)

| Limitação | Por que ainda existe | Próximo passo |
|---|---|---|
| Borda externa da rotatória NÃO é clipada pelo contexto v2 quando a via entra obliquamente | O trapézio de entry patch cobre a região de entrada na direção radial. Se a via entra com ângulo bem oblíquo (~10° tangencial ao anel), pode sobrar um pedaço de borda fora do trapézio. | Aumentar a largura angular do trapézio em ângulos rasos, ou clipar o `Konva.Circle` do anel via `Konva.Path` com arco aberto. |
| Junctions com 3+ vias num mesmo ponto não geram um patch "estrela", só múltiplos paralelogramos | `buildJunctionPatches` opera par-a-par. Para 3 vias se encontrando no mesmo ponto, gera 3 patches sobrepondo, que pode aparecer como "manchas" se as cores forem diferentes. | Pós-processamento para unir patches próximos (convex hull dos paralelogramos sobrepostos). |
| Vias muito curtas (< 1 segmento de control polyline) podem não acionar `polylineIntersectionsDetailed` | Algoritmo depende de pelo menos 2 pontos de controle (1 segmento). | Já filtrado: `if (ri.points.length < 4) continue`. |
| Patch não é deformado para "seguir" a curvatura da via — assume tangente do segmento que cruza | Para o caso comum (cruzamentos no meio de trechos retos), funciona. Em curvas fechadas com cruzamento, o patch pode não casar perfeitamente. | Refinamento futuro: amostrar tangente da Bezier no hit point em vez do segmento polyline. |
| Self-intersection da via em curva muito fechada não é tratado | `detectSelfIntersectionApprox` existe mas não é chamado. | Fase H futura. |

**Não regrediu nada do que o Ciclo 1 já entregava** — via reta, curva, exportação PNG, alternância v1↔v2, todos continuam OK.

### 13.8 Debug Road v2 (Fase F4)

Modo debug ativado pelo botão "Debug" na StatusBar (só aparece em v2). Quando ligado, sobrepõe:

- **Centerlines** das vias em azul (`#2563eb`).
- **Bordas esquerda/direita** em verde (`#16a34a`).
- **Junction patches** preenchidos com vermelho 25% e contornados em vermelho sólido.
- **Pontos de interseção** como pequenos círculos pretos no centro de cada patch.
- **Roundabout entry patches** em magenta 25% (`#d946ef`).
- **Pontos de entrada detectados** como círculos laranja (`#f59e0b`) com contorno preto.

**Como o perito usa isso para diagnóstico visual:**
- Se um cruzamento parece ruim → liga Debug → vê se aparece o ponto preto (interseção detectada) + o paralelogramo vermelho (patch gerado). Se não aparece, é problema de detecção; se aparece, é problema de tamanho/forma do patch.
- Se uma rotatória parece isolada → liga Debug → conta os círculos laranjas no anel. 4 ruas entrando ⇒ 4 círculos esperados. Se faltam, é tolerância ruim; se aparecem mas o visual continua quebrado, é problema de patch shape.

### 13.9 Testes fixture (Fase F5)

`network.test.ts` (**30 testes**) executa cada cenário visual como código:

| Cenário | Asserts | Passa |
|---|---|:---:|
| Cruzamento X | 1 patch, kind="x", centro próximo de (200,200), área plausível, dois roads envolvidos | ✓ |
| Cruzamento T | 1 patch, kind="t", endpoint da secundária no centerline da principal | ✓ |
| Entroncamento Y | 1 patch, kind="y", endpoints coincidentes | ✓ |
| Vias paralelas | 0 patches (no false positive) | ✓ |
| Rotatória isolada | 1 mesh, 0 patches, 0 entries | ✓ |
| Rotatória com 4 entradas | 4 entries, 4 entry patches, ângulos cobrindo > 180°, kind="roundabout_entry" | ✓ |
| Via longe da rotatória | 0 entries | ✓ |
| Tolerance band | endpoint exatamente no anel detectado; dentro de 5px detectado; longe não detectado; no centro não detectado | ✓ |
| Patch dedup | 1 patch único para um cruzamento X | ✓ |
| Entry patch polygon | 4 vértices distintos, área > 0 | ✓ |

### 13.10 Validações automáticas (estado pós-correção)

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 423 | **453** (+30) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 13.11 O que NÃO foi feito (proteções respeitadas)

- ❌ **Não implementei Fase G (OSM Adapter 2.0)** — conforme instrução explícita.
- ❌ **Não mexi em OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador.**
- ❌ **Não removi v1.** O fallback v1 continua acessível pelo toggle.
- ❌ **Não removi `RoadMeshNode` (singular).** Continua exportado por compat; é dead code no CanvasStage mas pode ser reusado por código externo (ex: futura PNG export via Canvas2D nativo).
- ❌ **Não fiz commit / merge / tag.**

### 13.12 Validação visual humana esperada (os 10 cenários do briefing)

Os cenários que **eu não consigo verificar por mim mesmo** (só você consegue olhar a tela):

1. ✅ Road v2 ativo e responsivo (StatusBar mostra "Road v2" verde)
2. 🟡 Cruzamento X manual — deve parecer cruzamento, não duas ruas sobrepostas
3. 🟡 Cruzamento T manual — secundária "morre" na borda da principal
4. 🟡 Entroncamento Y manual — três bocas se encontrando em asfalto contínuo
5. 🟡 Rotatória manual — anel com bordas concêntricas limpas
6. 🟡 Rotatória com 4 ruas entrando — vias se "encaixam" no anel
7. ✅ Alternância Debug Road v2 — botão vermelho-claro aparece quando v2 ativo, oculto em v1
8. 🟡 Debug mostra junction patches em vermelho transparente
9. 🟡 Debug mostra entradas de rotatória como círculos laranja
10. 🟡 Exportar PNG em v2 — `toPng()` continua funcionando (não há regressão do Stage)

**Se o resultado visual ainda não estiver satisfatório**, as direções alternativas que tenho prontas para discutir antes de continuar:

- **Plano A** (incremental): aumentar largura angular dos trapézios em entradas de rotatória em ângulos obliquos; juntar junction patches sobrepostos.
- **Plano B** (substituir Konva.Circle por Konva.Path com arco aberto): permite que a borda externa do anel literalmente DESAPAREÇA no setor angular de cada entrada, sem precisar de patch trapezoidal cobrindo.
- **Plano C** (mais ambicioso): adicionar pass de "asphalt mask polygon" que une asfalto de todas as vias + rotatórias num único polígono (Konva.Group com `globalCompositeOperation`), produzindo uma rede viária verdadeiramente contínua. Requer pesquisa sobre suporte do Konva a operações de polígono booleano.

**Não vou pular para OSM antes de você aprovar visualmente o manual.**

### 13.13 Resumo executivo do Ciclo 2 v2

✅ **Falha visual diagnosticada** como problema arquitetural (per-objeto vs per-rede), não algorítmico.
✅ **`RoadNetworkLayerV2`** refatora o renderer para multipass global (8 passes).
✅ **Junction patches X/T/Y** (`buildJunctionPatches`) cobrem bordas internas nos cruzamentos.
✅ **Roundabout entries** (`detectRoundaboutEntries` + `buildRoundaboutEntryPatches`) conectam vias ao anel.
✅ **Debug overlay** (`RoadDebugOverlayLayer`) revela centerlines, edges, patches e entries.
✅ **30 testes fixture** dos cenários visuais X / T / Y / paralelas / rotatória / 4 entradas / tolerance band.
✅ **Limitações conhecidas honestas** no §13.7 — não escondi nada.
✅ **Planos A/B/C de fallback** prontos se o visual ainda não convencer.

---

## 14. Correção da rotatória — arcos abertos nas entradas (Plano B)

**Status:** Ciclo 2 v2 aprovado parcialmente (X/T/Y melhoraram). Rotatória reprovada — o anel continuava parecendo um `Konva.Circle` solto. Plano B do §13.12 implementado.

### 14.1 Problema visual observado

Captura do perito mostrava:
- A rotatória ainda parecia um círculo fechado por cima das vias.
- As ruas "atravessavam" o conjunto sem realmente entrar no anel.
- A borda externa branca do anel continuava 360° fechada — sem aberturas nos acessos.
- Os entry patches trapezoidais cobriam um pouco da costura, mas não conseguiam mascarar a sensação de "moeda colada".

### 14.2 Por que Konva.Circle fechado era insuficiente

A borda externa do anel era desenhada como:

```tsx
<Circle x={cx} y={cy} radius={r} stroke="#f5f5f5" strokeWidth={2} />
```

Esse stroke é **uma única primitiva de 360°**. O entry patch trapezoidal (Pass 4) podia até cobrir o asfalto no setor de entrada, mas não conseguia "apagar" o stroke branco da borda — Konva renderiza o stroke em cima do fill. Resultado visual: anel sempre fechado, mesmo quando havia 4 trapézios desenhados sob ele.

A correção precisava ser **na geometria do stroke**, não em mais camadas de cover-up: substituir o stroke contínuo por **N polylines de arco**, com gaps angulares calculados nos pontos de entrada.

### 14.3 Como os gaps angulares são calculados

Para cada `RoundaboutEntry` detectada:

```
center_rad = entry.angle_deg × π / 180        # convertido para radianos
half_width_rad = asin(min(1, halfWidth_road / r))   # mesma fórmula
                                                     # do trapézio
                                                     # do roundaboutEntries
start_rad = normalize(center_rad - half_width_rad)
end_rad   = normalize(center_rad + half_width_rad)
```

A meia-largura angular `asin(halfWidth/r)` é deliberadamente a **mesma fórmula** que produz o trapézio de entrada (`buildRoundaboutEntryPatches`). Isso garante que o trapézio cobre EXATAMENTE o setor angular onde o stroke da borda foi removido — sem sub-coverage (faixa branca sobrando) nem over-coverage (trapézio invadindo a parte intacta do anel).

Para `halfWidth ≥ r` (degenerate: via mais larga que o raio), o `min(1, ·)` clamp em π/2 (gap de 180°). Essencialmente a rotatória "abre" pela metade — caso raríssimo mas defensivo.

### 14.4 Como as entradas são detectadas

A detecção já existia (`detectRoundaboutEntries`, §11.3 + §13.4) e não mudou. Critério: endpoint de uma via (start ou end) está dentro da banda angular `[r - halfWidth · 1.5, r + halfWidth · 1.5]` em torno do centro da rotatória. Tolerância 1.5× para acomodar pontas levemente fora do anel exato.

### 14.5 Como a borda externa é segmentada

`buildRoundaboutBorderSegments(cx, cy, r, gaps)`:

1. Se `gaps.length === 0` → retorna `[]` (renderer cai no fallback `Konva.Circle stroke` para rotatórias isoladas).
2. Ordena gaps por `angle_center_rad` ascendente.
3. Para cada par consecutivo `(gap_i, gap_{i+1})`:
   - O arco a desenhar é `[gap_i.end_rad, gap_{i+1}.start_rad]`.
   - Se `to < from` (wrap-around no último → primeiro), soma `2π` ao `to`.
   - Amostra o arco com `sampleArc(cx, cy, r, from, to, density=20)` → polyline densa.
4. Gaps muito sobrepostos produzem arcos degenerados (`to - from ≤ 0`); filtrados silenciosamente.

Resultado: 4 entradas a 0°/90°/180°/270° produzem **4 polylines de ~π/2 - 2·θ_half radianos cada**, com ~20+ samples por arco. Renderer desenha cada arco como `<Konva.Line points={vec2ToFlat(arc)} stroke=... />`.

Visualmente, a borda externa **literalmente desaparece** nos setores das entradas. O olho percebe a abertura — não é mais uma moeda solta.

### 14.6 Arquivos

**Novo:**

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/roundaboutPath.ts` | 240 | `RoundaboutGap`, `RoundaboutRingMesh`, `angleIntervalForEntry`, `buildRoundaboutGaps`, `sampleArc`, `buildRoundaboutBorderSegments`, `sampleInnerBorder`, `buildRoundaboutRingMesh`. |
| `__tests__/roundaboutPath.test.ts` | — | **32 testes** dos cenários do briefing. |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `road-v2/network.ts` | Adiciona `roundaboutRingMeshes: RoundaboutRingMesh[]` ao `RoadNetworkRenderPlan`. Constrói um ring mesh por rotatória (agrupando entries por roundabout_id). |
| `road-v2/rendererAdapter.tsx` | Pass 5b refatorado: quando `ring.outer_border_segments.length > 0`, renderiza N `Konva.Line` (arcos polilinha) em vez do `Konva.Circle stroke`. Quando 0 segments, fallback para `Konva.Circle`. Debug overlay ganha "fatias verdes claras" nos gaps. |
| `road-v2/index.ts` | Re-exporta `roundaboutPath`. |
| `road-v2/debug.ts` | `RoadDebugStats` ganha `roundaboutGapCount` e `roundaboutOuterArcCount`. |

### 14.7 Cenário visual esperado (descrição mental)

**Antes (Ciclo 2 v2):**
- Rotatória isolada: anel + ilha. OK.
- Rotatória com 1 via entrando: trapézio de entrada visível, mas anel continua fechado por cima.
- Rotatória com 4 vias entrando: 4 trapézios sobrepondo asfalto, anel continua fechado, parece "moeda colada com 4 reentrâncias coloridas".

**Agora (Ciclo 2 v3 / Plano B):**
- Rotatória isolada: anel + ilha. **Igual** (fallback Konva.Circle).
- Rotatória com 1 via entrando: borda externa "abre" no setor da entrada (`asin(halfWidth/r)` ≈ 19° para halfWidth=20, r=60); trapézio preenche o setor com asfalto contínuo; ilha central intacta. **Visualmente: a via se "encaixa" no anel.**
- Rotatória com 4 vias entrando: 4 setores abertos, 4 trapézios cobrindo, 4 arcos visíveis (um entre cada par adjacente de entradas). A ilha central permanece como círculo branco contínuo. **Visualmente: uma rotatória de verdade com 4 acessos, não um disco solto.**

### 14.8 Limitações conhecidas

| Limitação | Impacto | Trabalho futuro |
|---|---|---|
| Gaps que se sobrepõem fortemente (entradas a < 2·θ_half radianos uma da outra) | O arco entre elas é degenerate; é dropado silenciosamente. Visualmente: parece uma "abertura grande". | Aceitável para o caso de uso (rotatórias normais têm entradas bem espaçadas). |
| Borda externa AGORA tem stroke `lineCap="round"` para suavizar a quina do gap | O arco termina com cap arredondado de raio = strokeWidth/2 = 1 px. Pode aparecer um "ponto" sutil onde o gap começa. Visualmente imperceptível na maioria dos zooms. | Cosmético — substituir por `lineCap="butt"` se causar artefato. |
| Ilha central continua `Konva.Circle` contínuo | Por design — a ilha NUNCA tem aberturas, então é mais eficiente desenhar como circle. | Sem mudança planejada. |
| Asfalto do disco continua `Konva.Circle` (fill preenchido) | O disco é o fundo; tirar o stroke já basta para abrir visualmente. | Sem mudança planejada. |
| Trapézio do entry patch usa a mesma fórmula `asin(halfWidth/r)` que o gap angular | Casa exatamente — não há sub/over-coverage. | OK. |
| Gaps angulares > π (180°) não são esperados | A clamp em π/2 do `asin(min(1, ·))` previne, mas em casos extremos (halfWidth > r) o anel "abre pela metade". | Aceitável, defensivo. |

### 14.9 Testes

**`roundaboutPath.test.ts` (32 testes):**

- **`angleIntervalForEntry`** (4): halfWidth/r = 0.5 → asin(0.5); halfWidth ≥ r → π/2 clamp; r ≤ 0 → 0; halfWidth = 0 → 0.
- **`sampleArc`** (5): quarter circle ≥ 5 samples; todas amostras no raio; primeiro/último nos endpoints; arco não-positivo → []; density aumenta sample count.
- **`buildRoundaboutGaps`** (4): 0 entries → []; 1 entry centrado em ângulo certo + half-width correto; 4 entries espaçados π/2; normalização [-90° → 270°].
- **`buildRoundaboutBorderSegments`** (5): 0 gaps → []; 1 gap → 1 segmento wrap; 4 gaps → 4 segmentos; pontos no raio; gaps sobrepostos sem crash.
- **`sampleInnerBorder`** (2): círculo completo + raio < 1 → [].
- **`buildRoundaboutRingMesh`** (4): isolada / 1 entry / 4 entries / inner contínuo.
- **End-to-end via `buildRoadNetworkRenderPlan`** (5): 4 ruas → 4 gaps + 4 arcs + 4 patches; isolada → 0/0; sem rotatórias → []; oblíqua → gap centrado em π/4; via longe → 0 gaps; via atravessando o centro sem endpoint no anel → 0 gaps.
- **Stats consistency** (1): `roundaboutGapCount === roundaboutEntryCount`.
- **Round-trip** (1): `detectRoundaboutEntries.length === buildRoundaboutGaps.length`.

### 14.10 Validações automáticas

```
pnpm typecheck                  ✓
pnpm test                       ✓  485 passed (453 → 485, +32)
pnpm build                      ✓  (1933 modules)
cargo check                     ✓
cargo test --lib                ✓  88 passed
```

### 14.11 Debug Road v2 atualizado

Quando "Debug" está ligado em v2, o overlay agora mostra adicionalmente:

- **Setores angulares dos gaps** como "fatias de pizza" verde claro (`rgba(34, 197, 94, 0.18)`) com contorno tracejado verde escuro (`#16a34a`). Cada gap aparece como um setor radial do centro da rotatória até o anel externo, no intervalo `[start_rad, end_rad]`.

Como o perito usa: olhe uma rotatória → ligue Debug → conte as fatias verdes. 4 ruas entrando deve mostrar 4 fatias. Se faltam, é problema de detecção de entry; se aparecem mas a borda continua fechada, é problema de renderer.

### 14.12 Validação manual esperada (10 cenários do briefing)

| # | Cenário | Esperado |
|---:|---|---|
| 1 | Road v2 ativo | StatusBar mostra "Road v2" verde + botão "Debug" presente |
| 2 | Inserir rotatória sozinha | Anel branco contínuo + ilha central; igual ao Ciclo 2 v2 (fallback) |
| 3 | Inserir 1 via entrando | Borda externa **abre** no setor da entrada; trapézio de asfalto preenche; ilha intacta |
| 4 | Inserir 4 vias entrando | 4 aberturas no anel; 4 arcos visíveis entre elas; ilha intacta |
| 5 | Ativar Debug Road v2 | 4 fatias verdes claros nos setores das entradas + 4 círculos laranja nos pontos de entrada |
| 6 | Verificar gaps no debug | Fatias verdes batem exatamente com os trapézios magenta dos entry patches |
| 7 | Verificar borda externa aberta | Os 4 arcos brancos NÃO se conectam — há espaço visual nos acessos |
| 8 | Verificar ilha central preservada | Círculo branco do centro continua fechado e nítido |
| 9 | Exportar PNG | `toPng()` continua funcionando; arcos aparecem na imagem final |
| 10 | Salvar / reabrir | O `kind: "roundabout"` persiste; ring mesh é recalculado a cada render — sem persistência |

### 14.13 Por que isso deve aprovar visualmente

A diferença geométrica é **fundamental**, não cosmética:

- Antes: stroke contínuo de 360° = "anel sempre fechado" para o olho.
- Agora: stroke segmentado em N arcos com gaps reais = "anel com aberturas" para o olho.

Não é um patch cobrindo — é a **ausência física do stroke** no setor angular. O olho não vê a borda branca porque ela não está sendo desenhada ali. Combinado com o trapézio de asfalto cobrindo o disco no mesmo setor, a via se **funde** com o anel.

Esta é exatamente a técnica do SICRO 1.0 Python (`desenho/osm_via.py:_rotatoria_da_way` desenha cada arco entre dois acessos como `create_arc` com `start` e `extent` calculados) — agora aplicada ao Konva via amostragem em polyline.

### 14.14 Restrições respeitadas

- ❌ **Fase G (OSM Adapter 2.0) NÃO implementada.** Aguarda aprovação visual deste ciclo.
- ❌ **OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador, Road v1** — todos intocados.
- ❌ **Sem commit / merge / tag.**
- ✅ **X/T/Y do Ciclo 2 v2** — preservados. Nenhum teste anterior quebrou.

### 14.15 Resumo executivo do Ciclo 2 v3

✅ **Diagnóstico aceito:** `Konva.Circle` stroke fechado era a causa visual do "anel sempre fechado".
✅ **Plano B implementado:** borda externa segmentada em N arcos de polilinha amostrados, com gaps angulares reais nas entradas.
✅ **`roundaboutPath.ts`** novo módulo puro com `angleIntervalForEntry`, `buildRoundaboutGaps`, `sampleArc`, `buildRoundaboutBorderSegments`, `buildRoundaboutRingMesh`.
✅ **Renderer Pass 5b** branch em `outer_border_segments.length > 0`: arcos polilinha; senão fallback `Konva.Circle`.
✅ **Debug overlay** ganha fatias verde-claras nos setores angulares dos gaps.
✅ **32 testes novos** (incluindo 6 cenários end-to-end via plano de rede).
✅ **485 testes totais** (453 → 485). 88 cargo verdes. Build verde. Typecheck verde.

---

## 15. Correção de curvas fechadas e retornos (Ciclo 2 v4)

**Status:** Ciclo 2 v3 aprovado pelo perito (rotatória/interseções OK). Validação visual reportou novo problema: **U-turn / curva fechada / retorno** geravam triângulos visíveis na parte superior da curva. Causa: `buildRibbonPolygon` ingênuo gera offsets perpendiculares que se cruzam quando a curvatura local é maior que halfWidth.

### 15.1 Problema visual observado

Captura do perito mostrava uma via em U (dois braços paralelos próximos conectados por curva fechada na ponta). No vértice superior da curva, apareciam **cortes triangulares coloridos** dentro do asfalto — não eram bordas brancas, eram falhas do polígono fechado.

### 15.2 Por que o ribbon ingênuo falha em curvas fechadas

`buildRibbonPolygon(samples, halfWidth)` faz:

```
for each i:
    tangent = central_difference(samples, i)
    normal = perpendicular(tangent)
    left[i]  = center + normal * halfWidth
    right[i] = center - normal * halfWidth
polygon = left ++ reverse(right)
```

Quando a curva local tem raio menor que halfWidth, o lado interno da curva (a borda no lado côncavo) **se dobra sobre si mesma**. Especificamente:

- Braço esquerdo desce: borda interna = lado direito (x = +halfWidth).
- Curva fechada: borda interna gira até virar lado oposto.
- Braço direito sobe: borda interna = lado esquerdo (x = -halfWidth).

Os pontos da "borda interna" no braço esquerdo (a 18 px à direita do centro) cruzam com os pontos da "borda interna" no braço direito (a 18 px à esquerda do centro). Resultado: o polígono `left ++ reverse(right)` tem auto-cruzamento em formato de "8" ou "borboleta", e o algoritmo de preenchimento do Konva (even-odd ou nonzero) renderiza os sub-loops como buracos triangulares.

### 15.3 Solução: loop removal nas bordas

Implementado em `ribbonRobust.ts`:

```
buildRibbonPolygonRobust(samples, halfWidth):
    raw = buildRibbonPolygon(samples, halfWidth)   # ingênuo
    leftClean  = removePolylineLoops(raw.left)     # remove auto-loops
    rightClean = removePolylineLoops(raw.right)
    polygon    = leftClean ++ reverse(rightClean)
    return { ..., problemPoints, problemIndices }   # debug
```

**Algoritmo de loop removal:**

```
removePolylineLoops(P):
    repeat until no change:
        for each pair (i, j) with j > i+1:
            if segments [P[i]→P[i+1]] and [P[j]→P[j+1]] intersect at point X:
                P = P[0..i+1] ++ [X] ++ P[j+1..]    # colapsa o loop
                break and restart
```

Resultado:
- Bordas sem auto-cruzamento.
- Polígono final simples (renderiza sem buracos).
- Endpoints preservados.
- Vértices internos colapsam ao ponto de cruzamento (visualmente: a borda "vira a esquina" em vez de fazer a borboleta).

### 15.4 Arquivos

**Novo:**

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/ribbonRobust.ts` | 200 | `segmentSegmentIntersect`, `detectPolylineLoops`, `removePolylineLoops`, `buildRibbonPolygonRobust`, `buildCurbRibbonRobust`, `RobustRibbon` (estende `RoadRibbon` com `problemIndices` + `problemPoints`). |
| `__tests__/ribbonRobust.test.ts` | — | **30 testes** dos cenários do briefing. |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `road-v2/types.ts` | `RoadMesh` ganha `problemIndices: number[]` + `problemPoints: Vec2[]` (debug only). |
| `road-v2/rendererAdapter.tsx` | `buildMeshFromRoad` troca `buildRibbonPolygon`/`buildCurbRibbon` por `buildRibbonPolygonRobust`/`buildCurbRibbonRobust`. Debug overlay ganha pontos rosa (`problemPoints`) e amarelo (`problemIndices`). Borda esquerda em verde, direita em ciano para distinguir lados. |
| `road-v2/index.ts` | Re-exporta `ribbonRobust`. |
| `road-v2/debug.ts` | `RoadDebugStats` ganha `ribbonProblemPointCount` + `ribbonTightCornerCount`. |

### 15.5 Cenário visual esperado (descrição mental)

**Antes (Ciclo 2 v3):**
- Via em U com braços paralelos próximos: triângulos coloridos visíveis na parte superior do retorno; asfalto "rasgado" por dentro.
- Curva 90° com halfWidth grande: canto interno com pequenos artefatos triangulares.
- Retorno largo (canteiro central + meia-volta): asfalto com "buraco" no formato de 8 invertido.

**Agora (Ciclo 2 v4):**
- Via em U: as bordas que se dobravam agora colapsam em uma quina nítida no vértice. O asfalto fica contínuo, sem triângulos. A curva interna tem um "corner" agudo onde antes era a borboleta — visualmente é a forma natural de uma U-turn de canteiro.
- Curva 90°: canto interno limpo, asfalto preenchido até a quina.
- Retorno largo: asfalto contínuo formando uma cabeceira em U, sem buracos.

**Debug overlay novo:**
- **Borda esquerda em verde** (`#16a34a`), **borda direita em ciano** (`#0891b2`) — separadas em cores distintas pra inspeção visual.
- **Círculos rosa** (`#ec4899`, 6 px) marcam os **pontos de auto-cruzamento** que o ribbon ingênuo teria gerado. Em vias retas: 0 círculos. Em U-turn: 1+ círculos no vértice da curva.
- **Círculos amarelos** (`#fbbf24`, 4 px) marcam **samples de curva apertada** (ângulo > 60° + raio local < halfWidth).

### 15.6 Limitações conhecidas

| Limitação | Impacto | Trabalho futuro |
|---|---|---|
| Loop removal colapsa o vértice colidente em **um único ponto** | O canto interno fica como quina aguda (pode parecer "cortado" em zoom alto). Para U-turns largos, é visualmente OK; para curvas muito apertadas pode ficar duro. | Smoothing pós-correção: substituir a quina por arco curto de fillet. Não implementado por ser cosmético. |
| Loops aninhados (curvas que dobram várias vezes) requerem múltiplas iterações do algoritmo | O loop while pode rodar até `4·N` iterações. Em croquis típicos isso é < 200 iterações, ms-scale. | Aceitável. |
| Algoritmo é O(N³) no pior caso | Em N=49 samples por ribbon, ~117k operações no pior caso = ~5ms. | Aceitável. |
| Caso patológico: TODAS as samples colapsam em 2 pontos | Ribbon vira reta degenerate. Acontece se a curva é tão fechada que o ribbon todo é "borboleta". Visualmente, melhor que renderizar um polígono quebrado. | Detectar e mostrar warning no Inspector (não implementado neste ciclo). |
| Curb robusto usa o mesmo algoritmo | Curb com self-intersection também é corrigido, mas pode ficar mais estreito que o esperado em curvas fechadas. | Aceitável — o curb visualmente fica sob o asfalto. |

### 15.7 Testes (30 novos, todos verdes)

**`ribbonRobust.test.ts`:**

- **`segmentSegmentIntersect`** (4): X-crossing yields intersection; parallel yields null; disjoint yields null; touching endpoint = null (collinear edge case OK).
- **`detectPolylineLoops`** (3): straight = 0 loops; squarish polyline = 1+ loops; doubling-back = 1+ loops.
- **`removePolylineLoops`** (4): no-loop passthrough; single loop shortened + endpoints preserved + loop-free output; multiple loops fully resolved; one-big-loop collapsed to clean polyline.
- **Straight ribbon regression** (2): robust polygon == ingenuous polygon (sub-pixel); problemIndices/problemPoints empty.
- **Soft curve** (2): inner/outer borders loop-free; problemPoints empty.
- **U-turn realístico** (5): naive ribbon has self-intersections; robust has none; problemPoints populated; polygon closed; AABB plausible.
- **90° elbow** (2): robust ribbon loop-free; AABB cobre ambos braços do L.
- **Retorno largo (closed-ish loop)** (2): robust loop-free; ingênuo evidencia o problema.
- **buildCurbRibbonRobust** (2): null on curbWidth ≤ 0; wider robust ribbon than asphalt.
- **Degenerate inputs** (3): empty/single/zero-halfWidth.
- **Regression** (1): via reta via mesh builder produz 0 problem points.

**Estatísticas globais:**

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 485 | **515** (+30) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 15.8 Validação manual esperada

Cenários para o perito verificar visualmente:

| # | Cenário | Esperado |
|---:|---|---|
| 1 | Road v2 ativo | StatusBar mostra "Road v2" verde |
| 2 | Inserir via reta | Idêntico ao Ciclo 2 v3 — sem regressão |
| 3 | Inserir curva suave | Asfalto contínuo, sem triângulos |
| 4 | Inserir U-turn (2 cliques opostos + curva apertada na ponta) | Asfalto contínuo no vértice — **sem triângulos coloridos** |
| 5 | Inserir cruzamento X | Junction patch funcional (preservado do Ciclo 2 v2) |
| 6 | Inserir rotatória com entradas | Arcos abertos + entry patches (preservado do Ciclo 2 v3) |
| 7 | Ativar Debug Road v2 | Borda esquerda **verde**, borda direita **ciano**, pontos rosa nos vértices de cruzamento original, pontos amarelos nas samples de curva apertada |
| 8 | Olhar uma via reta no debug | 0 pontos rosa, 0 pontos amarelos |
| 9 | Olhar a U-turn no debug | 1+ pontos rosa **no vértice da curva** + alguns pontos amarelos |
| 10 | Exportar PNG da U-turn | Asfalto contínuo, sem artefatos |
| 11 | Salvar / reabrir | Mesh recalculado, sem persistência adicional |

### 15.9 Por que isso deve aprovar visualmente

O problema **não era percepção, era geometria**: o polígono enviado ao Konva era literalmente uma borboleta com auto-cruzamento, e o algoritmo de fill renderiza as regiões cruzadas como buracos. Não havia como "cobrir" isso com mais patches — a única correção era **enviar um polígono simples ao Konva**.

O loop removal:
- não muda o `SicroRoadObject` (puro pós-processamento na hora do render);
- não regride vias retas / curvas suaves (não há loops para remover);
- mantém os endpoints da centerline (a via continua começando/terminando onde o perito definiu);
- colapsa o vértice da borboleta em uma quina única — visualmente, a borda "vira a esquina".

Esta é a mesma técnica usada por bibliotecas de offset curves (Clipper, JTS, Shapely) para vias estreitas — só que simplificada para o caso de uma única polyline em vez do union completo.

### 15.10 Restrições respeitadas

- ❌ **Fase G (OSM Adapter 2.0) NÃO implementada.** Aguarda aprovação do Ciclo 2 v4.
- ❌ **OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador, Road v1** — todos intocados.
- ❌ **Sem commit / merge / tag.**
- ✅ **Junction patches X/T/Y do Ciclo 2 v2** — preservados.
- ✅ **Rotatória com arcos abertos do Ciclo 2 v3** — preservada.
- ✅ **Schema 100% aditivo** — `problemIndices` e `problemPoints` em runtime, não persistem no `.sicrocroqui`.

### 15.11 Resumo executivo do Ciclo 2 v4

✅ **Diagnóstico:** `buildRibbonPolygon` gerava polígono auto-cruzante em curvas fechadas; Konva renderiza auto-cruzamento como buracos.
✅ **Solução:** loop removal — varrer pares de segmentos da borda, achar cruzamentos, colapsar o sub-loop no ponto de cruzamento. Bordas simples → polígono simples → render limpo.
✅ **`ribbonRobust.ts`** novo módulo puro: `segmentSegmentIntersect`, `detectPolylineLoops`, `removePolylineLoops`, `buildRibbonPolygonRobust`.
✅ **`buildMeshFromRoad`** roteia para o robust automaticamente — sem flag de opt-in, sem regressão em vias retas.
✅ **Debug overlay** mostra borda esquerda/direita em cores distintas + pontos de cruzamento original + samples de curva apertada.
✅ **30 testes novos**, todos verdes. Cobertura inclui via reta (regressão), curva suave (regressão), U-turn realístico, 90° elbow, retorno largo, curb robust.
✅ **515 testes totais** (485 → 515). 88 cargo verdes. Build verde. Typecheck verde.

---

## 16. Correção de suavização — centerline smoothing controlado (Ciclo 2 v5)

**Status:** Ciclo 2 v4 aprovado parcialmente (correção de auto-intersection OK). Validação visual reportou novo problema: **as curvas suaves desapareceram** — vias ficaram poligonais/segmentadas. Causa: `resolveCenterlineSamples` promovia cada par de control points para um Bezier **reto** independente, então cada segmento virava uma reta. Sem suavização entre vértices.

### 16.1 Problema observado

O perito validou após Ciclo 2 v4 e disse:

> "As vias ficaram muito retas, duras, segmentadas e poligonais. Para o uso com OSM, isso é inaceitável, porque ruas reais têm curvas leves, geometrias tortas, alças e retornos."

Especificamente:
- vias com 3+ control points: cada par virava uma reta, sem curvatura entre eles;
- curvas suaves planejadas (cardinal spline visual) sumiam;
- retornos viravam polígonos quebrados em vez de curvas contínuas;
- esquinas 90° funcionavam OK (porque deveriam ser quinas mesmo).

### 16.2 Por que o robust deixou vias rígidas

A causa não foi o `ribbonRobust` (loop removal) — esse só atua quando há auto-intersection real, e não está mexendo em curvas suaves. A causa foi o `resolveCenterlineSamples` anterior:

```typescript
// Ciclo 2 v4 — versão problemática:
for (let i = 0; i + 1 < pairs.length; i++) {
  const curve = bezierFromStraightSegment(a, b);  // ← BEZIER RETO!
  const seg = sampleCubicBezier(curve, 12);
  out.push(...seg);
}
```

`bezierFromStraightSegment(a, b)` retorna um Bezier cujos pontos de controle ficam exatamente na reta entre `a` e `b` (1/3 e 2/3 do caminho). Resultado: o sampler produz 13 pontos colineares por segmento. Concatenando segmentos: a centerline final é exatamente a polyline original densificada — sem suavização entre vértices.

### 16.3 Solução: centerline smoothing controlado

Nova etapa explícita no pipeline (antes do ribbon):

```
RoadObject.points
  → normalizeCenterlinePoints         ← remove duplicatas
  → classifyRoadVertex                ← canto vs curva
  → buildSmoothedCenterline           ← Catmull-Rom controlado
      ├─ "straight"  → polyline original (sem mudança)
      ├─ "soft"      → Catmull-Rom tensão 0.5 (default)
      ├─ "bezier"    → Catmull-Rom tensão 0.7 + denso
      └─ "osm"       → Catmull-Rom 0.6 + denso (futuro)
  → buildRibbonPolygonRobust          ← loop removal local
  → render
```

**Princípio:** loop removal continua existindo (não regride Ciclo 2 v4), mas agora opera sobre uma centerline já suavizada — então só atua em curvas patológicas reais (raio < halfWidth), não em curvas suaves normais.

### 16.4 Modos de suavização (`RoadSmoothingMode`)

Schema aditivo em `SicroRoadObject.smoothing`:

```typescript
export interface RoadSmoothing {
  mode: "straight" | "soft" | "bezier" | "osm";
  tension?: number;
  preserve_corners?: boolean;
}
```

| Modo | Tensão | Samples/seg | Caso de uso |
|---|---:|---:|---|
| `"straight"` | 0 | 1 | vias retas / esquinas urbanas duras |
| `"soft"` | 0.5 | 8 | **default** — curva suave preservando esquinas |
| `"bezier"` | 0.7 | 16 | curvas arredondadas (vias largas, alças) |
| `"osm"` | 0.6 | 12 | preset para vias importadas (futuro) |

**`preserve_corners`** (default `true`): quando ativo, vértices com ângulo de virada ≥ 72° (`π/2.5`) são **preservados verbatim** no output, e os sub-segmentos entre cantos são suavizados separadamente. Isso é o que mantém **esquinas urbanas angulares** enquanto suaviza **curvas progressivas**.

### 16.5 Sequência segura (não destrói correção robusta)

```
1. suavizar centerline    ← buildSmoothedCenterline
2. gerar samples densos   ← (já é parte do output)
3. gerar ribbon           ← buildRibbonPolygonRobust
4. detectar problemas     ← detectPolylineLoops (debug)
5. remover loops local    ← removePolylineLoops apenas onde necessário
6. preservar geometria    ← endpoints + corners preservados
```

O `ribbonRobust` continua sendo chamado, mas agora a centerline que ele recebe é **mais densamente amostrada e suavizada**. Resultado: a maioria dos casos não precisa de loop removal (porque a curva suavizada não tem auto-intersection), e quando precisa, atua apenas localmente.

### 16.6 Arquivos

**Novo:**

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/centerline.ts` | 290 | `RoadSmoothingMode`, `SmoothingOptions`, `normalizeCenterlinePoints`, `classifyRoadVertex`, `shouldSmoothVertex`, `buildCatmullRomCenterline`, `buildBezierCenterline`, `preserveSharpCorners`, `buildSmoothedCenterline`, `classifyCenterline`. |
| `__tests__/centerline.test.ts` | — | **37 testes** dos 6 cenários do briefing. |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `schema.ts` | Adiciona `RoadSmoothingMode` + `RoadSmoothing` + `SicroRoadObject.smoothing?` (aditivo opcional). |
| `road-v2/types.ts` | `RoadMeshInput.smoothing?` + `RoadMesh.rawCenterline` + `RoadMesh.vertexKinds` (debug). |
| `road-v2/rendererAdapter.tsx` | `resolveCenterlineSamples` agora chama `buildSmoothedCenterline` (substitui `bezierFromStraightSegment` per-segment). `roadObjectToMeshInput` copia `smoothing`. `buildMeshFromRoad` popula `rawCenterline` + `vertexKinds` para debug. Debug overlay mostra centerline crua (cinza tracejado), suavizada (azul) e classificação (quadrado amarelo / círculo ciano / círculo branco). |
| `road-v2/index.ts` | Re-exporta `centerline`. |
| `editor/InspectorPanel.tsx` | Adiciona dropdown "Suavização" (Reta / Suave / Curva / OSM) + checkbox "Preservar esquinas". |

### 16.7 Cenário visual esperado (descrição mental)

| Caso | Ciclo 2 v4 (reprovado) | Ciclo 2 v5 (agora) |
|---|---|---|
| Via reta 2 pontos | Reta | **Reta idêntica** (regressão protegida) |
| Curva suave 4 pontos (S-shape) | Poligonal — 3 segmentos retos visíveis | **Curva contínua** — Catmull-Rom através dos 4 pontos |
| Esquina 90° (3 pontos) | Quina ok | **Quina preservada** (preserve_corners=true por padrão) |
| Retorno em U (5 pontos) | Polígono quebrado | **Curva contínua** (loop removal atua só se necessário) |
| OSM-like (10+ pontos sutis) | Polígono com micro-segmentos | **Curva suave** com microângulos absorvidos |
| Cruzamento X / Y / T | OK | **OK preservado** (não há regressão) |
| Rotatória com entradas | OK | **OK preservada** |

### 16.8 Inspector UI

Adicionei dois controles ao painel da via:

```
Suavização: [Reta | Suave (default) | Curva/Bezier | OSM]
Preservar esquinas (não suavizar quinas ≥ 72°)  ☑
```

Default para todas as vias novas: `{ mode: "soft", preserve_corners: true }`. Vias antigas sem o campo caem no mesmo default automaticamente — sem migração necessária.

### 16.9 Debug overlay novo

Quando Debug Road v2 ligado:

- **Centerline crua** em cinza tracejado (`#94a3b8`, dash 4-4) — mostra a polyline original.
- **Centerline suavizada** em azul (`#2563eb`) — mostra o output do smoothing.
- **Endpoints**: círculos brancos com borda preta (4 px).
- **Cantos preservados** (vertex_kind="corner"): quadrados amarelos com borda marrom (5 px).
- **Pontos suavizados** (vertex_kind="smooth"): círculos ciano claro (3 px).
- **Tudo do Ciclo 2 v4 mantido** (problem points rosa, tight corners amarelos, edges esquerda/direita, etc.).

Confronto direto centerline crua vs suavizada mostra ao perito **onde o motor adicionou suavização**.

### 16.10 Limitações conhecidas

| Limitação | Impacto | Trabalho futuro |
|---|---|---|
| Catmull-Rom com tension > 0.7 pode gerar samples que extrapolam da bounding box dos control points | Curvas exageradas em "bezier" mode com poucos pontos. | Aceitável; o perito pode escolher "soft" se preferir. |
| `preserve_corners` usa apenas o ângulo entre dois segmentos adjacentes — não considera contexto global | Curva com micro-ângulos que somam um canto pode não ser detectada. | Adicionar análise de "curvatura cumulativa" se necessário. |
| Smoothing roda sempre antes do ribbon — não há fast-path para `mode: "straight"` | Densificação trivial mesmo em vias retas (9 samples para 2 pontos). | Detectar polyline já-reta e fast-path. |
| Sample count default subiu (era 13 por segmento, agora 9 para Catmull suave) | Performance ~igual; densidade visualmente OK. | Aumentar para 12 se necessário visualmente. |
| Inspector dropdown mostra modo, mas não há preview live | Perito muda o modo e vê o efeito apenas no canvas. | Adicionar preview thumbnail no Inspector. |

### 16.11 Testes (37 novos)

**`centerline.test.ts`** — cobertura dos 6 cenários do briefing:

1. **Linha reta** (4 testes): permanece reta em soft/bezier/straight; endpoints preservados.
2. **Curva suave 4 pontos** (4 testes): samples > control points; NÃO é apenas retas conectando vertices (cross product não-zero); endpoints preservados; bezier denso > soft.
3. **Esquina 90°** (3 testes): canto preservado verbatim com `preserve_corners=true`; classificação como "corner".
4. **Retorno U-turn** (3 testes): smooth gera curva contínua; ribbon robusto sem auto-intersection; output > 10 samples.
5. **OSM-like curve** (3 testes): osm > straight em samples; pico de sine preservado; preserve_corners não muda nada em curva sem quinas.
6. **Robust loop removal** (3 testes): via reta + smoothed → 0 problem points; curva S → 0 problem points; U-turn apertada + smoothed → ribbon final simples.

Mais: `normalizeCenterlinePoints` (3), `classifyRoadVertex` (4), `shouldSmoothVertex` (2), `classifyCenterline` batch (3), entry points `buildCatmullRomCenterline`/`buildBezierCenterline`/`preserveSharpCorners` (4), regressão sample count (1).

### 16.12 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 515 | **552** (+37) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 16.13 Validação manual esperada (11 cenários do briefing)

| # | Cenário | Esperado |
|---:|---|---|
| 1 | Road v2 ativo | "Road v2" verde |
| 2 | Via reta | Idêntica ao Ciclo 2 v4 |
| 3 | Curva suave 4 pontos | **Curva contínua agora — não mais 3 retas** |
| 4 | Curva leve estilo rua real (5+ pontos sutis) | **Suavização visível** |
| 5 | Retorno em U | **Curva contínua sem quina grossa** |
| 6 | Curva de 90° | Quina preservada (default `preserve_corners=true`) |
| 7 | Cruzamento X | Junction patch funcional (preservado v2) |
| 8 | Entroncamento Y | Idem (preservado v2) |
| 9 | Rotatória simples | Arcos abertos (preservado v3) |
| 10 | Debug ligado | Centerline crua em cinza, suavizada em azul, cantos em amarelo, suaves em ciano |
| 11 | Exportar PNG | Curvas no canvas == curvas no PNG |

### 16.14 Restrições respeitadas

- ❌ **Fase G (OSM Adapter 2.0) NÃO implementada.** Aguarda aprovação visual do Ciclo 2 v5.
- ❌ **OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador, Road v1** — todos intocados.
- ❌ **Sem commit / merge / tag.**
- ✅ **Junction patches X/T/Y do Ciclo 2 v2** — preservados.
- ✅ **Rotatória com arcos abertos do Ciclo 2 v3** — preservada.
- ✅ **Loop removal do Ciclo 2 v4** — preservado, atua agora apenas em curvas patológicas reais.
- ✅ **Schema 100% aditivo** — `smoothing` é opcional. Croquis pré Ciclo 2 v5 carregam normalmente; renderer aplica `"soft"` por padrão.

### 16.15 Resumo executivo do Ciclo 2 v5

✅ **Diagnóstico:** `bezierFromStraightSegment` per-segment produzia retas amostradas em vez de curvas; a centerline nunca passava por suavização real entre control points.
✅ **Solução:** `centerline.ts` com Catmull-Rom controlado por modo (`straight`/`soft`/`bezier`/`osm`) + `preserve_corners` que mantém esquinas urbanas angulares.
✅ **`buildSmoothedCenterline`** roteia automaticamente para a estratégia certa. Default `"soft"` aplicado a todas as vias (incluindo legacy).
✅ **`ribbonRobust` continua atuando**, mas agora sobre uma centerline suavizada — loop removal só dispara em curvas patológicas reais (raio < halfWidth).
✅ **Inspector** ganha dropdown "Suavização" + checkbox "Preservar esquinas".
✅ **Debug overlay** mostra centerline crua (cinza tracejado) + suavizada (azul) + classificação por vértice (corner amarelo / smooth ciano / endpoint branco).
✅ **37 testes novos**, todos verdes. Cobertura dos 6 cenários do briefing + helpers.
✅ **552 testes totais** (515 → 552). 88 cargo verdes. Build verde. Typecheck verde.

---

## 17. Rotatória 2.0 — proporção, flares e integração com a rede (Ciclo 2 v6)

**Status:** Ciclo 2 v5 aprovou as curvas suaves. Rotatória continuava reprovada visualmente — o perito reportou que ela parecia "um círculo solto colado sobre a malha", com proporções erradas e acessos artificiais. Plano: **reformulação conceitual** da rotatória como nó da rede viária.

### 17.1 Problema visual observado

Captura do perito mostrava:

- Anel + ilha **desproporcionais** em relação às vias entrantes;
- Patches trapezoidais radiais (Ciclo 2 v3) ficavam visualmente "colados" — sem suavidade na transição via→anel;
- Entradas oblíquas pareciam grudadas, não tangenciais;
- A rotatória **não conversava** com as vias — parecia um objeto isolado, não um nó de rede.

### 17.2 Por que a rotatória anterior era insuficiente

| Limitação anterior | Causa |
|---|---|
| Proporção arbitrária (r=80, width=14) | Defaults sem relação com a largura das vias |
| Patches trapezoidais radiais | Apenas 4 vértices retos; sem tangência ao anel |
| Sem campo de lane_count | Largura do anel não escalava com faixas |
| Sem Recalcular proporção | Perito tinha que ajustar manualmente cada eixo |

### 17.3 Novo modelo conceitual — `RoundaboutNode`

A rotatória passa a ser modelada como um **nó da rede viária** (não primitiva isolada):

```typescript
interface RoundaboutNode {
  id, cx, cy;
  outerRadius;
  innerRadius;          // = outerRadius - circulatingWidth
  circulatingWidth;     // largura do anel (proporcional)
  surfaceFill, innerFill, borderColor;
  entries: RoundaboutEntry[];  // vias conectadas
}
```

Acompanhado de:

- `computeAutoDimensions(roads, entries)` — calcula proporção proporcional;
- `buildEntryFlare(entry, road, rb)` — gera polígono "boca" com **curva Bezier** tangencial;
- Schema `SicroRoundaboutObject.lane_count?` (aditivo opcional).

### 17.4 Cálculo de proporção (`computeAutoDimensions`)

Heurística (validada visualmente contra SICRO 1.0):

```
avgRoadWidth = média(roadWidths) ou 80 se vazio
outerRadius = clamp(avgRoadWidth × 1.8, [48, 400])
circulatingWidth = clamp(avgRoadWidth × 0.9 × laneCount, [14, 60])
innerRadius = max(outerRadius - circulatingWidth, 16)
```

Resultado: para via urbana padrão 80 px → outer 144, width 60 (clamp), inner 84.
Para via larga 160 px → outer 288, width 60, inner 228.
Para via estreita 30 px → outer 54 (clamp min 48), width 27, inner 27.

**Defaults novos no factory:** `r=144, width=56, lane_count=1` — proporcional a via urbana 80 px, sem precisar de "recalcular".

### 17.5 Entradas como flares (`buildEntryFlare`)

Em vez do trapézio radial de 4 vértices, o novo flare:

1. Pega a **tangente da via** no endpoint que toca o anel (não a direção radial!).
2. Calcula 2 pontos na borda da via (left/right) usando `perpendicular(tangentAway)`.
3. Calcula 2 pontos no anel separados pelo setor angular `2·asin(halfWidth/r)`.
4. Conecta cada borda da via ao ponto correspondente no anel com **Cubic Bezier tangencial**:
   - Tangência na via = paralela à direção da via (no endpoint).
   - Tangência no anel = perpendicular ao raio (tangente do círculo).
5. Adiciona arco curto no anel entre os 2 pontos para fechar o polígono.

Resultado: polígono de ~28-30 vértices que **abre** suavemente da via para o anel, em vez de um trapézio reto colado. Visualmente: "a rua abre e encontra o anel" — não "encosta num círculo".

### 17.6 Arquivos

**Novo:**

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/roundaboutNode.ts` | 320 | `RoundaboutNode`, `computeAutoDimensions`, `buildEntryFlare`, `buildAsphaltRingSamples`, helpers de sampling. |
| `__tests__/roundaboutNode.test.ts` | — | **22 testes** dos cenários do briefing. |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `schema.ts` | `SicroRoundaboutObject.lane_count?` (aditivo opcional). |
| `factories.ts` | `makeRoundabout` defaults novos: r=144, width=56, lane_count=1. |
| `serializer.ts` | `coerceRoundaboutObject` preserva `lane_count` numérico. |
| `road-v2/roundaboutEntries.ts` | `buildRoundaboutEntryPatches` agora chama `buildEntryFlare` quando `points` disponível; fallback trapézio quando ausente (compat tests). |
| `road-v2/network.ts` | Passa `obj.points` ao builder de entry patches. |
| `road-v2/rendererAdapter.tsx` | Debug overlay ganha círculos tracejados roxos marcando outer/inner radius da rotatória. |
| `road-v2/index.ts` | Re-exporta `roundaboutNode`. |
| `editor/InspectorPanel.tsx` | Adiciona NumberField "Faixas do anel" + Field readonly "Raio da ilha" + botão "Recalcular proporção" (visível quando callback fornecido). |
| `editor/CroquiEditor.tsx` | Passa `onRecalcRoundaboutProportion` ao InspectorPanel — handler resolve vias conectadas (banda r ± halfWidth·1.5), chama `computeAutoDimensions`, aplica patch. |

### 17.7 Inspector novo

```
Centro X / Centro Y
Raio externo
Largura do anel
Raio da ilha (readonly = r - width)
Faixas do anel               [novo, lane_count]
Asfalto / Ilha / Borda (cores)
─────
[ Recalcular proporção ]     [novo botão]
```

Botão "Recalcular proporção": localiza vias com endpoint dentro da banda `r ± halfWidth · 1.5` da rotatória, calcula média das larguras, chama `computeAutoDimensions(roadWidths, lane_count)`, atualiza `r` + `width`. Feedback no rodapé: "Rotatória reproporcionada com N via(s) conectada(s)."

### 17.8 Debug overlay novo

- **Círculos tracejados roxos** marcando outer/inner radius (já visíveis sem debug; o tracejado roxo serve como marca de proporção).
- **Pontos de entrada laranja** + **fatias verdes claras dos gaps** (preservados v3).
- **Flare patches em magenta transparente** com contorno sólido (preservados v3).
- **Pontos de interseção pretos** (preservados v2).

### 17.9 Cenário visual esperado

| Caso | Ciclo 2 v5 (reprovado) | Ciclo 2 v6 (agora) |
|---|---|---|
| Rotatória isolada (sem vias) | r=80, width=14, ilha minúscula | **r=144, width=56, ilha 88 px** — proporção urbana padrão |
| Rotatória com 1 via | Trapézio reto colado | **Flare curvo tangencial** — boca abre suave |
| Rotatória com 4 vias entrando | 4 trapézios radiais | **4 flares curvos** — cada um tangente à via e ao anel |
| Via larga (160px) → rotatória | Anel pequeno demais para a via | "Recalcular proporção" → r=288, width=60 — anel ajusta |
| Via oblíqua | Trapézio rotacionado mal | **Flare respeita direção da via** — boca tangente à approach |
| Curva suave preservada | OK | **OK** (regressão protegida) |
| Cruzamento X/T/Y | OK | **OK preservado** |

### 17.10 Limitações conhecidas

| Limitação | Trabalho futuro |
|---|---|
| `lane_count` é aplicado apenas via `computeAutoDimensions` — não há linhas internas separando as faixas do anel | Próximo ciclo: lane dividers concêntricos. |
| Flare tangencial requer `points` da via — sem isso cai no trapézio antigo | Trade-off aceito: compat com testes legados. |
| Auto-dimensionamento exige clique manual no "Recalcular proporção" | Próximo ciclo: opção `auto_dimension: true` que recalcula a cada mudança de via conectada. |
| Rotatória ainda usa `Konva.Circle` preenchido para asfalto e ilha (não polygon real) | Próximo ciclo: substituir por polygon real (donut amostrado) se necessário. |
| Tangência do flare pode falhar em vias com control polyline de 2 pontos colineares com o centro da rotatória | Fallback trapézio cobre o caso, mas raro em uso real. |

### 17.11 Testes (22 novos)

**`roundaboutNode.test.ts`:**

- **`computeAutoDimensions`** (7): 0 vias → default 80; 1 via 80 → r=144 width clampado; vias estreitas 30 → r≥48; vias largas 200 → r≤400; média de múltiplas vias; lane_count=2 → width clampado; inner_radius mínimo respeitado.
- **`buildEntryFlare`** (5): polígono com > 4 vértices (curva, não trapézio); kind="roundabout_entry"; polígono não auto-cruza; entrada oblíqua válida; halfWidth >= outerRadius (degenerate) não crasha.
- **End-to-end network** (4): 4 vias → 4 flares curvos; rotatória sem vias → 0 flares; via larga → flare proporcional; regressão curva suave isolada.
- **Factory regression** (3): defaults r=144 / width=56 / lane_count=1; inner radius default = 88; overrides têm prioridade.
- **Compat `buildRoundaboutEntryPatches`** (2): sem points → trapézio 4 vértices; com points → flare > 4 vértices.
- **`detectRoundaboutEntries`** (1): via diametral conta como 2 entries (start + end).

### 17.12 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 552 | **574** (+22) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 17.13 Validação manual esperada (13 cenários do briefing)

| # | Cenário | Esperado |
|---:|---|---|
| 1 | Road v2 ativo | "Road v2" verde |
| 2 | Inserir rotatória isolada | **Proporção urbana padrão** — r=144, width=56, ilha 88; sem mais "ilha minúscula" |
| 3 | Inserir rotatória com 1 entrada | **Flare curvo tangencial** — não trapézio radial |
| 4 | Inserir rotatória com 4 entradas | **4 flares curvos** — cada um respeita a direção da via |
| 5 | Conectar via larga (160px) e clicar "Recalcular proporção" | r=288, width=60 — anel ajusta proporcionalmente |
| 6 | Conectar via estreita (30px) e recalcular | r=54 (clamp min 48), width=27 — não vira "moeda minúscula" |
| 7 | Ativar Debug Road v2 | Círculos tracejados roxos marcando outer/inner radius |
| 8 | Verificar proporção da ilha + anel | Inner / outer / width visíveis no Inspector e como roxo no debug |
| 9 | Verificar gaps + flares | Fatias verdes nos gaps; magenta nos flares (preservado v3) |
| 10 | Testar curva suave | Idêntica ao Ciclo 2 v5 (regressão protegida) |
| 11 | Testar retorno em U | Idêntico (regressão protegida) |
| 12 | Testar cruzamento X/Y | OK (regressão preservada) |
| 13 | Exportar PNG | Flares renderizam no PNG igual ao canvas |

### 17.14 Restrições respeitadas

- ❌ **Fase G (OSM Adapter 2.0) NÃO implementada.** Aguarda aprovação visual do Ciclo 2 v6.
- ❌ **OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador, Road v1** — todos intocados.
- ❌ **Sem commit / merge / tag.**
- ✅ **Smoothing do Ciclo 2 v5** — preservado, ribbon-robust + centerline.ts + Inspector dropdown.
- ✅ **Junction patches X/T/Y do Ciclo 2 v2** — preservados.
- ✅ **Arcos abertos do Ciclo 2 v3** — preservados, conviviem com flares.
- ✅ **Schema 100% aditivo** — `lane_count` opcional, default 1 no renderer. Rotatórias pré-Ciclo 2 v6 carregam com r/width legados.

### 17.15 Resumo executivo do Ciclo 2 v6

✅ **Diagnóstico:** rotatória precisava ser **nó da rede**, não primitiva isolada — defaults proporcionais + flares tangenciais.
✅ **`roundaboutNode.ts`** novo módulo: `computeAutoDimensions` (clamp inteligente) + `buildEntryFlare` (Cubic Bezier tangencial).
✅ **Defaults proporcionais** (r=144, width=56, lane_count=1) no factory — proporção urbana padrão.
✅ **Flares Cubic Bezier** — polígono de 28-30 vértices em vez de trapézio de 4. Tangente à via E tangente ao anel.
✅ **Inspector ganha** `lane_count`, raio da ilha (readonly informativo), e botão **"Recalcular proporção"**.
✅ **Debug overlay** mostra outer/inner radius (círculos roxos tracejados).
✅ **22 testes novos**, todos verdes. Cobre 7 cenários do briefing + regressões.
✅ **574 testes totais** (552 → 574). 88 cargo verdes. Build verde. Typecheck verde.

---

## 18. Rotatória 2.1 — seamless integration nas entradas (Ciclo 2 v7)

**Status:** Ciclo 2 v6 aprovou a proporção. Perito reportou que a borda externa do anel ainda aparecia nas conexões — "uma linha circular separando entrada e rotatória". A correção é cirúrgica: ampliar o gap angular, reordenar passes, eliminar fallback indevido.

### 18.1 Problema visual restante

Captura validada:
- Proporção do anel + ilha: **OK** (aprovada no Ciclo 2 v6).
- Mas: borda externa do anel ainda visível nas entradas, como **linha circular separando** via e rotatória.

Diagnóstico (3 causas):
1. **Gap angular igual à largura geométrica** — as pontas do stroke do arco terminavam exatamente no ângulo de início do flare. Sem padding, o lineCap="round" das pontas projetava o stroke por cima do flare nos limites.
2. **Ordem de render**: flares estavam em Pass 4, bordas externas em Pass 5b — bordas desenhavam **POR CIMA** dos flares.
3. **Fallback Circle**: o branch usava `segs.length === 0`. Em casos onde gaps eram detectados mas `outer_border_segments` ficavam vazios por casos limítrofes (gaps sobrepostos), o renderer ainda desenhava o `Konva.Circle` fechado — restituindo a "linha circular separando entrada".

### 18.2 Como os gaps foram ajustados

Adicionado **padding angular fixo de ~5°** (`ENTRY_GAP_PADDING_RAD = π/36`) em `roundaboutPath.ts`:

```typescript
const halfW =
  angleIntervalForEntry(road.halfWidth, rb.r) + ENTRY_GAP_PADDING_RAD;
```

Resultado: o gap angular passa a ser MAIOR que o setor angular geométrico da via. As pontas do stroke do arco externo terminam **fora** do limite do flare. O asfalto do disco do anel (Pass 2b — preenchido) ocupa o setor "extra" entre flare e arcos, dando continuidade visual.

Para uma via de 40 px num anel de 60 px:
- Sem padding: gap = 2·asin(20/60) ≈ 39° (geométrico exato).
- Com padding: gap = 2·(asin(20/60) + 5°) ≈ 49° (≈10° a mais total).

### 18.3 Como a borda externa foi removida nas conexões

A condição de fallback Konva.Circle foi reescrita: usa `gaps.length` (não `segs.length`).

**Antes:**
```tsx
{segs.length === 0 ? <Circle /> : segs.map(...)}
```

**Agora:**
```tsx
const hasEntries = (ring?.gaps.length ?? 0) > 0;
{!hasEntries ? <Circle /> : segs.map(...)}
```

Critério explícito: **se há ≥ 1 entry detectada para essa rotatória, NUNCA desenhar Circle fechado por cima dela.** Mesmo que `segs` venha vazio por algum caso degenerate (gaps muito sobrepostos), o renderer não cai no fallback — apenas omite os arcos. O perito vê o anel com asfalto (do disco Pass 2b) sem nenhuma borda visível ali.

### 18.4 Como os flares foram posicionados (reorder de passes)

**Antes (Ciclo 2 v6):**
```
Pass 4   roundaboutEntryPatches (flares)
Pass 4b  ilha central
Pass 5   bordas das vias
Pass 5b  bordas externas + internas da rotatória   ← cobria flares
```

**Agora (Ciclo 2 v7):**
```
Pass 4   ilha central
Pass 5   bordas das vias
Pass 5b  bordas externas + internas da rotatória
Pass 5c  roundaboutEntryPatches (flares)            ← cobre eventuais sobras
```

Os flares (asfalto preenchido) são desenhados **DEPOIS** dos arcos da borda externa. Mesmo se houver alguma sobra do stroke (pontas do `lineCap="round"`, anti-aliasing, micro-pixels nos limites do gap), o flare cobre por cima com asfalto.

Ilha central continua em Pass 4 (entre asfalto e bordas) — está **dentro** do raio interno, então os flares (que ficam **fora** do raio interno, no setor da entrada) não a cobrem.

### 18.5 Resultado visual esperado

| Caso | Ciclo 2 v6 (reprovado) | Ciclo 2 v7 (agora) |
|---|---|---|
| Rotatória com 4 entradas | Linha circular branca visível separando via e anel | **Borda externa some completamente no setor de entrada**; asfalto da via flui para asfalto do anel sem interrupção |
| Rotatória isolada | Borda completa OK | **Borda completa OK** (preservado) |
| Entrada oblíqua | Linha branca curva visível no encontro | **Encontro seamless** — padding cobre a oblicuidade |
| Ilha central | OK | **OK** — não é afetada |
| Borda interna da ilha | OK contínua | **OK contínua** (preservada) |
| Marcações da via na entrada | Já era cortada | **Continua cortada** (preservada) |
| Curvas suaves / U-turn / X/T/Y | OK | **OK** (regressões protegidas) |

### 18.6 Arquivos

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `road-v2/roundaboutPath.ts` | Adiciona `ENTRY_GAP_PADDING_RAD = π/36` (~5°). `buildRoundaboutGaps` agora soma esse padding ao half-width angular. |
| `road-v2/rendererAdapter.tsx` | (1) Pass 4 perde os flares e mantém só a ilha. (2) Pass 5b muda critério de fallback: `hasEntries = gaps.length > 0` em vez de `segs.length === 0`. (3) Novo Pass 5c renderiza os flares APÓS as bordas. |
| `__tests__/roundaboutPath.test.ts` | Teste antigo de `angle_half_width_rad` ajustado para considerar o padding. |
| `__tests__/seamless.test.ts` | **10 testes novos** dedicados ao seamless. |

### 18.7 Limitações conhecidas

| Limitação | Trabalho futuro |
|---|---|
| Padding fixo (5°) — não escala com `outerRadius` | Pode ficar grande demais em rotatórias muito pequenas (anel comendo metade do gap). Quando observado, parametrizar como porcentagem. |
| Gaps muito próximos (entradas adjacentes < 10°) podem se fundir num gap único | Aceitável — visualmente o resultado é um setor único sem stroke, que é o comportamento desejado. |
| Pass 5c desenha flare por cima da borda externa — se o flare tiver stroke próprio, sobrepõe | Não tem stroke por design (somente fill). |
| Roundabout muito pequena (r ≤ 30) com padding fixo pode ter gap > 60° | Borda externa fica encurtada drasticamente. Mitigação: aumentar `MIN_OUTER_RADIUS` no `computeAutoDimensions` (já é 48). |

### 18.8 Testes (10 novos)

**`seamless.test.ts`:**

- **Padding angular** (2): `ENTRY_GAP_PADDING_RAD ≈ 5°`; gap inclui padding acima do asin geométrico.
- **Outer_border fora dos gaps** (1): 4 entries → cada sample de cada segmento da borda externa NÃO está dentro de nenhum gap (com tolerância 1e-3).
- **Fallback Circle desativado** (2): rotatória isolada → 0 gaps + 0 segs (Circle ativo); rotatória com ≥1 entry → ≥1 gap + ≥1 seg (sem Circle).
- **Largura / ângulo** (2): via larga (160px) → gap maior; via diagonal → gap centralizado em π/4.
- **Dedup robusto** (1): 2 gaps muito sobrepostos não crashar; resultado ≤ 2 segs.
- **Regressão coexistência** (1): rotatória + curva + cruzamento X coexistem sem interferência.
- **detectRoundaboutEntries** (1): regressão — detecta entry quando endpoint está na banda do anel.

### 18.9 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 574 | **584** (+10) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 18.10 Validação manual esperada

| # | Cenário | Esperado |
|---:|---|---|
| 1 | Road v2 ativo + rotatória com 4 entradas | **Borda externa desaparece nas conexões** — sem linha circular separando |
| 2 | Confirmar fusão visual | Asfalto da via e asfalto do anel parecem **uma única superfície** |
| 3 | Ilha central | Continua **limpa** (preserved) |
| 4 | Borda interna da ilha | Continua **contínua** (preserved) |
| 5 | Rotatória isolada (sem vias) | Borda externa **completa** (Circle ativo) |
| 6 | Entrada oblíqua | Sem linha branca no encontro |
| 7 | Debug Road v2 ligado | Fatias verdes (gaps) **maiores** que a largura da via |
| 8 | Exportar PNG | Borda externa some no PNG também |
| 9 | Curvas suaves | Idênticas ao Ciclo 2 v5 (regressão protegida) |
| 10 | Cruzamento X/T/Y | Idênticos (regressão protegida) |

### 18.11 Restrições respeitadas

- ❌ **Fase G (OSM Adapter 2.0) NÃO implementada.** Aguarda aprovação visual do Ciclo 2 v7.
- ❌ **OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home, Importador, Road v1** — todos intocados.
- ❌ **Sem commit / merge / tag.**
- ✅ **Proporção do Ciclo 2 v6** preservada — r=144, width=56, lane_count=1.
- ✅ **Flares com Cubic Bezier tangencial do Ciclo 2 v6** preservados.
- ✅ **Smoothing do Ciclo 2 v5** preservado.
- ✅ **Junction patches X/T/Y do Ciclo 2 v2** preservados.
- ✅ **Schema 100% aditivo.**

### 18.12 Resumo executivo do Ciclo 2 v7

✅ **Diagnóstico:** borda externa do anel reaparecia nas entradas por 3 causas combinadas — gap sem padding, ordem de render errada, fallback Circle ativo indevidamente.
✅ **Correção tripla:**
  1. **Padding angular ~5°** (`ENTRY_GAP_PADDING_RAD`) ampliando o gap além da largura geométrica.
  2. **Reorder de passes** — flares passam para Pass 5c, após bordas externas, cobrindo eventuais sobras.
  3. **Fallback baseado em `gaps.length`** — Circle só desenha quando NÃO há entries.
✅ **10 testes novos** dedicados ao seamless. Garante que: (a) gap > asin geométrico; (b) segmentos NÃO cruzam gaps; (c) fallback Circle só dispara sem entries.
✅ **584 testes totais** (574 → 584). 88 cargo verdes. Build verde. Typecheck verde.
✅ **Mudança cirúrgica** — não tocou em proporção, flares, smoothing, junction patches ou Road v1.

**Aguardando validação visual humana. Se aprovado, libera Fase G (OSM Adapter 2.0).**

---

## 19. lineCap "butt" + padding 7.5° (Ciclo 2 v8)

**Status:** Ciclo 2 v7 ainda reprovado pelo perito — captura mostrou "quebra de continuidade" como uma **curva branca fina** visível na transição via↔anel. Correção cirúrgica de **2 linhas de código**.

### 19.1 Diagnóstico exato pela captura do perito

A imagem mostrou duas rotatórias:
- Esquerda: rotatória pequena com 1 via atravessando o centro (endpoints longe — sem entries detectadas) — borda externa completa visível, esperado.
- Direita: rotatória maior com 4 vias entrando (endpoints na borda do anel) — **gaps angulares funcionando**, mas com **uma curva branca fina** visível na transição via↔anel, "marcando" o setor de entrada como uma "boca" arredondada.

Causa identificada: o renderer usa `lineCap="round"` nos arcs da borda externa (Pass 5b). Round cap projeta a ponta do stroke por **`strokeWidth/2` = 1 px** PARA ALÉM do ângulo final do arco. Resultado: 1 px de stroke branco arredondado se projeta para dentro do gap angular, mesmo com padding 5°.

Em conjunto com:
- `opacity=0.9` (deixando o branco bem visível)
- `borderColor = "#f5f5f5"` (branco quase puro contra fundo cinza do asfalto)
- A curvatura da round-cap acompanha o anel → parece "uma curvinha branca"

O resultado visual era exatamente o que o perito descreveu: "uma linha curva separando a entrada do anel".

### 19.2 Correção (2 linhas)

**Arquivo 1: `roundaboutPath.ts`**

```diff
- export const ENTRY_GAP_PADDING_RAD = Math.PI / 36; // 5°
+ export const ENTRY_GAP_PADDING_RAD = Math.PI / 24; // 7.5°
```

**Arquivo 2: `rendererAdapter.tsx`** (Pass 5b, render dos arcs)

```diff
- lineCap="round"
+ lineCap="butt"
```

### 19.3 Por que cada mudança é necessária

**`lineCap="butt"`:** O stroke termina **exatamente** no ângulo final do arco. Sem projeção arredondada. Sem 1 px de stroke fora do arco amostrado. Sem "ponta curvada" cobrindo parte do gap.

**Padding 7.5° (vs 5° anterior):** Margem extra para qualquer artefato de sub-pixel. Com `lineCap="butt"` o stroke não projeta, mas o anti-aliasing do Konva pode "borrar" 1 px na ponta. 7.5° = ~10 px lineares no perímetro de um anel r=80 — muito mais que qualquer artefato sub-pixel.

### 19.4 Resultado visual esperado

| Cenário | Ciclo 2 v7 (reprovado) | Ciclo 2 v8 (agora) |
|---|---|---|
| Rotatória com 4 entradas | Curva branca fina visível em cada entrada | **Nada** — transição completamente seamless |
| Rotatória isolada | Borda completa OK | **OK preservado** (fallback Circle, lineCap não importa) |
| Entrada oblíqua | Mesma curva branca | **Mesma transição seamless** |
| Borda interna da ilha | OK contínua | **OK preservada** |

### 19.5 Limitações conhecidas

| Limitação | Impacto | Trabalho futuro |
|---|---|---|
| Padding 7.5° é fixo, não escala com `outerRadius` | Em rotatórias muito pequenas (r < 30 px), o setor angular do gap fica grande proporcionalmente. | Em prática: `MIN_OUTER_RADIUS = 48` no `computeAutoDimensions` previne. |
| `lineCap="butt"` mostra a quina dos arcos exposta | Em zoom muito alto pode ser perceptível como "corte abrupto". Visualmente OK no padrão de uso. | Adicionar small `lineJoin` round entre samples internas do arc. |
| Padding maior reduz a borda externa visível | Para rotatória com 4 entradas + padding 7.5°, restam ~70° por arc visível, em vez de ~80°. | Aceitável — visualmente continua um "anel com borda" reconhecível. |

### 19.6 Testes ajustados

- `seamless.test.ts`: assert `ENTRY_GAP_PADDING_RAD ≈ 7.5°`.
- `roundaboutPath.test.ts`: expected half-width passa de `asin + π/36` para `asin + π/24`.

Nenhum teste novo necessário — a correção é cirúrgica em constantes/props.

### 19.7 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 584 | **584** (testes ajustados, sem novos) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 19.8 Validação manual esperada

Critério único:
> Olhar uma rotatória com 4 entradas. NÃO deve ter **nenhuma curva branca** visível no setor de entrada. Asfalto da via flui direto para asfalto do anel.

Se aprovado, **libera Fase G (OSM Adapter 2.0)**.

### 19.9 Resumo executivo do Ciclo 2 v8

✅ **Diagnóstico exato da imagem:** `lineCap="round"` projeta 1 px de stroke para dentro do gap angular.
✅ **Correção de 2 linhas:** trocar `lineCap` para `"butt"` + aumentar padding de 5° para 7.5°.
✅ **Sem novos testes:** ajuste de 2 assertions existentes.
✅ **574 testes vitest verdes** + 88 cargo verdes.
✅ **Tudo preservado:** flares, proporção, smoothing, junction patches, road v1, OSM intocados.

**Aguardando validação visual final do perito.**

---

## 20. Eliminação total da borda externa quando há entries (Ciclo 2 v9)

**Status:** Ciclo 2 v8 ainda reprovado. A captura clara do perito mostrou que mesmo com `lineCap="butt"` + padding 7.5°, **a borda externa do anel continuava visível** como um contorno demarcando "quebra de continuidade" via↔anel.

### 20.1 Diagnóstico final pela imagem

A captura mostrou uma rotatória com 2 vias atravessando horizontalmente (entrando da esquerda e saindo pela direita). Sem control points selecionados, sem outros elementos. Apenas:

- **Anel cinza escuro** com um **contorno levemente mais escuro** visível em volta (a "borda externa") — mesmo após todas as correções dos ciclos anteriores.
- **Vias horizontais** com asfalto e marcações brancas.
- **Gap visual** entre o final da via e a borda do anel — onde deveria haver fusão.

O contorno escuro da borda externa do anel **NÃO é o stroke `Konva.Circle`** (que eu já cortei com gaps + butt cap). É o **contraste natural entre o disco do anel (cinza) e o fundo do canvas (branco)** — o disco cria uma silhueta de "donut" que o olho lê como uma "borda".

Os ciclos anteriores tentavam remover o stroke explícito, mas o problema visual era a **borda implícita** criada pelo contraste disco-anel-fundo. Mesmo com 0 stroke, o anel continua aparecendo como um anel discreto, sem se fundir com a via.

### 20.2 Solução final (Ciclo 2 v9)

**Mudança de 1 linha (essencial):**

Em `rendererAdapter.tsx` Pass 5b, eliminar completamente a borda externa quando há entries:

```diff
- {!hasEntries ? (
-   <Circle ... stroke=... />
- ) : (
-   segs.map(seg => <Line ... stroke=... lineCap="butt" />)
- )}
+ {!hasEntries && (
+   <Circle ... stroke=... />
+ )}
```

Resultado:
- **Rotatória ISOLADA (0 entries):** mantém o `Konva.Circle` stroke fechado — visual padrão.
- **Rotatória com entries (≥ 1):** **NÃO desenha NENHUMA borda externa**. Nem arcs nem Circle. Anel passa a ser apenas: disco cinza + ilha clara + borda interna branca.

### 20.3 Por que isso resolve a "quebra de continuidade"

Sem stroke branco externo:
- O flare (cinza, em Pass 5c) e o disco do anel (cinza, em Pass 2b) **encontram a via diretamente**, sem nenhuma linha branca intermediária.
- O contraste disco-cinza-vs-fundo-branco continua delimitando o anel como forma, mas **sem stroke**. Onde a via entra, o flare cobre o setor da borda — visualmente o cinza do anel se conecta ao cinza da via sem descontinuidade.
- A borda interna da ilha (entre ilha clara e anel cinza) continua visível, dando identidade visual à rotatória.

### 20.4 Cenário visual esperado

| Caso | Ciclo 2 v8 (reprovado) | Ciclo 2 v9 (agora) |
|---|---|---|
| Rotatória com 4 entradas | Borda externa cinza ainda visível como contorno do donut, com "quebra" nos setores das entradas | **Sem borda externa** — disco cinza encontra fundo sem linha; flare + disco se fundem com a via |
| Rotatória isolada | Borda externa branca completa (Circle stroke) | **OK preservado** — Circle stroke ainda ativo (fallback) |
| Entrada oblíqua | Borda externa visível dando "concavidade" no encontro | **Sem borda externa** — encontro seamless |
| Borda interna da ilha | Branca contínua | **Branca contínua preservada** |

### 20.5 Trade-off honesto

**Custo:** rotatórias com vias entrando perdem o **stroke branco** que dava "definição" visual ao anel externo. Visualmente o anel ainda existe (por contraste de cor), mas sem linha branca explícita.

**Ganho:** continuidade total via↔anel. Sem nenhuma linha branca intermediária na transição.

Se o perito quiser a borda externa visível em algum cenário futuro (export PNG técnico de alta resolução, por exemplo), basta reverter a condicional para `!hasEntries ? Circle : segs.map(Line)` no Pass 5b.

### 20.6 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 584 | **584** |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

Nenhum teste novo necessário. Os testes existentes do `roundaboutPath` (segments gerados, gaps detectados) continuam passando porque o **dado** continua sendo produzido — apenas o renderer não desenha mais. A infraestrutura fica disponível como dead code documentado para reativação futura se necessário.

### 20.7 O que está preservado

- ✅ Proporção do Ciclo 2 v6 (r=144, width=56).
- ✅ Flares Cubic Bezier do Ciclo 2 v6.
- ✅ Padding angular do Ciclo 2 v7 (7.5°, mantido para Pass 4 quando flare for desejado).
- ✅ Smoothing do Ciclo 2 v5.
- ✅ Junction patches X/T/Y do Ciclo 2 v2.
- ✅ Road v1, OSM, Drone, Laudo, etc. — não tocados.
- ✅ Schema 100% aditivo.
- ✅ Sem commit / merge / tag.

### 20.8 Validação manual esperada

Critério final:
> Olhar uma rotatória com vias entrando. **Não deve haver nenhuma linha ou contorno separando a via do anel.** O cinza da via flui direto para o cinza do anel; só a ilha central clara + borda interna branca identificam a rotatória.

Se aprovado, **libera Fase G (OSM Adapter 2.0)**.

### 20.9 Resumo executivo do Ciclo 2 v9

✅ **Diagnóstico final:** o problema não era stroke explícito (cortado em ciclos anteriores) mas **contorno implícito** do disco-cinza-vs-fundo-branco — uma "borda visual" criada pelo contraste de cores.
✅ **Solução radical: eliminar a borda externa completamente** quando há entries. Anel com vias = disco + ilha + borda interna. Sem stroke externo nenhum.
✅ **Mudança de 1 linha** em `rendererAdapter.tsx` Pass 5b.
✅ **Rotatória isolada preservada** — continua com stroke completo (fallback Circle).
✅ **574 testes vitest** + **88 cargo verdes** — nenhum quebrou.

**Aguardando validação visual final.**

---

## 21. Borda externa clipada geometricamente contra o context (Ciclo 2 v10)

**Status:** Ciclo 2 v9 ainda reprovado. A captura clara do perito mostrou um cenário NÃO COBERTO pelos ciclos anteriores: uma via reta **atravessando** o anel sem terminar nele. Ambos os endpoints da via estavam FORA da banda de detecção, então `detectRoundaboutEntries` retornava 0 entries — e o `Konva.Circle stroke` completo do anel era desenhado como fallback (incluindo cor vermelha que o perito setou no Inspector).

### 21.1 Diagnóstico exato pela imagem

A captura mostrou:
- Rotatória centrada no canvas, com cor de borda **vermelha** (`#e00b0b`, definida pelo perito no Inspector).
- Via reta vertical atravessando o anel de cima a baixo.
- Endpoints da via BEM acima e BEM abaixo do anel (longe da banda `[r ± halfWidth*1.5]`).
- Resultado: 0 entries detectadas → `hasEntries = false` → `Konva.Circle stroke vermelho` desenhado em torno de TODO o anel — incluindo onde a via passa.

Os ciclos anteriores (v3 → v9) só tratavam o caso "via TERMINA no anel" (endpoint na banda). O caso "via ATRAVESSA o anel" continuava produzindo a borda externa completa.

### 21.2 Solução final (Ciclo 2 v10)

Substituir o stroke do `Konva.Circle` (ou os arcs segmentados) por uma **polyline da borda externa clipada contra o context completo**:

```typescript
// Em rendererAdapter.tsx, Pass 5b:
const N = 64;
const flat: number[] = [];
for (let i = 0; i <= N; i++) {
  const t = (i / N) * 2 * Math.PI;
  flat.push(
    mesh.center.x + mesh.outerRadius * Math.cos(t),
    mesh.center.y + mesh.outerRadius * Math.sin(t),
  );
}
const runs = clipPolylineToOutside(flat, obj.id, plan.context);
// Renderizar cada run como Konva.Line
```

Como `clipPolylineToOutside` testa cada sample da polyline contra todas as outras entries do context (vias + outras rotatórias), o resultado é:

- **Rotatória isolada** (sem vias): polyline completa = círculo fechado.
- **Rotatória com via terminando no anel**: polyline cortada no setor de entrada.
- **Rotatória com via atravessando**: polyline cortada **em DOIS setores** (entrada + saída).
- **Rotatória com via passando rente**: polyline cortada onde a via toca a borda.

A coerência total com o resto do pipeline é garantida porque o **mesmo `clipPolylineToOutside`** que clipa marcações das vias clipa agora a borda do anel.

### 21.3 Por que isso resolve o caso reportado

| Cenário | Antes (v9) | Agora (v10) |
|---|---|---|
| Via TERMINA no anel | `hasEntries=true` → segments com gaps OK | Polyline clipada — corte limpo no setor da entrada |
| Via ATRAVESSA o anel | `hasEntries=false` → `Konva.Circle` stroke completo cortando a via | **Polyline clipada — 2 setores cortados** onde a via cruza |
| Rotatória isolada | `Konva.Circle` stroke completo | Polyline completa (visualmente igual) |
| Via passa rente ao anel | Stroke completo | Cortes nos pontos de tangência |

### 21.4 Estrutura do clip

`clipPolylineToOutside(polyline, ownRoadId, context)`:

```
out_runs = []
current_run = []
for each (x, y) in polyline:
  if isPointInsideOtherRoad(p, ownRoadId, context):
    if current_run.length >= 4: out_runs.push(current_run)
    current_run = []
  else:
    current_run.push(x, y)
if current_run.length >= 4: out_runs.push(current_run)
return out_runs
```

E `isPointInsideOtherRoad` testa contra cada entry no context (que inclui vias + outras rotatórias), com prefilter AABB. Para uma via:

- Calcula `pointToSegmentDist(p, samples[i], samples[i+1])` ao longo do centerline da via.
- Se distância < `halfWidth` da via, o ponto está "dentro" da via.

Como a borda externa do anel é amostrada em 64 pontos, qualquer ponto dentro de uma via é cortado.

### 21.5 Limitações conhecidas

| Limitação | Impacto | Trabalho futuro |
|---|---|---|
| Resolução de 64 samples na polyline da borda | Aliasing visual nos cortes pode aparecer em zooms altos | Aumentar para 128 se necessário; custo O(N²) com clipping mantém aceitável até 256 |
| Sem `lineCap=round` ⇒ pontas dos arcs visíveis em zooms altos | Aceitável; alternativa `lineCap="butt"` evita projeção indesejada | Sem mudança |
| Borda interna da ilha NÃO é clipada — sempre `Konva.Circle` | A ilha é por definição "intocada" pela via. Vias que cruzam o anel cruzariam só o ASFALTO, não a ilha (porque inner_radius < r). Se uma via cruza a ilha, o canvas mostra o asfalto da via sobre a ilha — comportamento atípico que não cabe corrigir aqui. | Aceitável |
| `clipPolylineToOutside` é O(N × M × S) onde N=pontos da polyline, M=entries no context, S=segments por entry | Para 64 samples × 10 vias × 50 segments = 32.000 ops. Sub-ms na prática. | Sem necessidade de otimização. |
| Setor onde via cruza o anel: polyline corta mas o ASFALTO do anel continua visível como faixa cinza por baixo da via | Aceitável — visualmente parece que a via "passa por cima" do anel. Para esconder, precisaria clipar o disco também (custoso). | Aceitável para Ciclo 2. |

### 21.6 Validações automáticas

| | Pré-correção | Pós-correção |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 584 | **584** |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

Nenhum teste novo necessário. A função `clipPolylineToOutside` já tem cobertura completa em `junctions.test.ts`. A mudança no renderer é puramente declarativa (usa o helper que já existe).

### 21.7 O que está preservado

- ✅ Proporção do Ciclo 2 v6 (r=144, width=56).
- ✅ Flares Cubic Bezier do Ciclo 2 v6.
- ✅ Padding angular do Ciclo 2 v7 (mantido para Pass 4 dos flares).
- ✅ Smoothing do Ciclo 2 v5.
- ✅ Junction patches X/T/Y do Ciclo 2 v2.
- ✅ Road v1, OSM, Drone, Laudo, Evidências, Dossiê, etc. — não tocados.
- ✅ Schema 100% aditivo.
- ✅ Sem commit / merge / tag.

### 21.8 Validação manual esperada

Critério final:
> 1. Via reta passando POR DENTRO da rotatória (atravessando, sem terminar): a **borda externa colorida do anel deve sumir EXATAMENTE onde a via cruza**, dos dois lados. O cinza da via flui direto sobre o anel sem nenhuma linha de cor (vermelha, branca, qualquer) demarcando.
> 2. Via terminando no anel: igual ao Ciclo 2 v3/v6 — corte limpo no setor da entrada.
> 3. Rotatória isolada (sem vias): borda externa completa visível.

Se aprovado, **libera Fase G (OSM Adapter 2.0)**.

### 21.9 Resumo executivo do Ciclo 2 v10

✅ **Diagnóstico definitivo:** o caso "via atravessando o anel" caía no fallback `Konva.Circle stroke` completo. Os ciclos v3-v9 só tratavam "via terminando no anel" via entries.
✅ **Solução unificada:** substituir `Konva.Circle stroke` + segments por **polyline da borda externa clipada contra o context**. O mesmo helper que clipa marcações das vias clipa agora a borda do anel.
✅ **Mudança cirúrgica:** ~30 linhas em `rendererAdapter.tsx` Pass 5b. Resto intocado.
✅ **Coerência total:** todos os 4 cenários (isolada / terminando / atravessando / rente) usam o mesmo pipeline.
✅ **584 testes vitest verdes** + 88 cargo verdes — nenhum quebrou.

**Aguardando validação visual final do perito.**

---

## 22. Fase G — OSM Adapter 2.0

**Status:** ciclos 1 + 2 (v1 a v10) aprovados. Fase G implementada — convert OSM (Overpass) para Road Engine 2.0. Aguardando validação visual.

### 22.1 Pré-requisitos atendidos

- Road Engine 2.0 (Road v2) maduro e estável.
- Junction patches X/T/Y (Ciclo 2 v2).
- Rotatória 2.0 com proporção + flares + seamless (Ciclos 2 v6/v7/v10).
- Smoothing controlado por modo `osm` (Ciclo 2 v5).
- Loop removal robusto para curvas fechadas (Ciclo 2 v4).
- `RoadNetworkLayerV2` global multipass.

### 22.2 Princípio central

OSM **não é motor de desenho**. OSM é **fonte de dados geométricos**.

```
Overpass JSON
  → projeção métrica local
  → filtragem (highway válido + comprimento mínimo)
  → Douglas-Peucker (limpa micro-zigzags)
  → fit uniforme ao canvas (preserva proporção)
  → snap por OSM node_id (preserva junctions)
  → separação rotatória vs road
  → SicroRoadObject (smoothing osm) + SicroRoundaboutObject
  → RoadNetworkLayerV2 (Road v2)
  → render multipass técnico
```

A importação OSM produz objetos editáveis no estilo SICRO — não cópia visual do mapa OSM.

### 22.3 Arquivos criados

| Arquivo | Linhas | Conteúdo |
|---|---:|---|
| `road-v2/osmAdapter.ts` | 400 | `convertOsmDatasetToSicroObjects`, `projectLatLonToLocalMeters`, `classifyOsmWay`, `isOsmRoundabout`, `buildRoundaboutFromOsm`. |
| `__tests__/osmAdapter.test.ts` | — | **38 testes** cobrindo projeção, classificação, detecção de rotatória, junction preservation, fixture Macapá-like, serializer round-trip. |

### 22.4 Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `road-v2/index.ts` | Re-exporta `osmAdapter`. |
| `editor/OsmImportModal.tsx` | Importa `convertOsmDatasetToSicroObjects` (substitui `osmDatasetToRoadsFit`). `OsmImportResult` ganha `roundabouts` + `warnings`. Aviso explícito "Importação OSM 2.0" no footer. |
| `editor/CroquiEditor.tsx` | `handleOsmImportConfirm` adiciona roads **+ roundabouts** ao doc. **Força `road_engine_version: "v2"`** automaticamente. Loga warnings no console. Feedback inclui contagem de rotatórias e avisos. |

**Não tocado:** `engine/osm.ts` (preservado por compat — `osmDatasetToRoadsFit` antigo continua existindo, mas não é mais chamado por nenhum caller). `engine/coordinates.ts`, `engine/osm.test.ts`, `OsmMapPanel.tsx` — todos preservados.

### 22.5 Pipeline OSM → Road v2

1. **Index nodes por id.**
2. **Filtra ways** com tag `highway` válido. Skipa `building`, `waterway`, etc.
3. **Projeta cada way em metros locais** (`projectLatLonToLocalMeters`):
   - Eixo X = leste positivo (longitude crescente, com correção `cos(lat)`).
   - Eixo Y = sul positivo (canvas Y-down). Norte = y menor.
   - Sem Mercator — erro < 0.1% para raios urbanos.
4. **Comprimento mínimo** (`min_way_length_m`, default 4 m): filtra ways degenerate.
5. **Douglas-Peucker** (`simplify_tolerance_m`, default 0.6 m) — limpa micro-zigzags do OSM, preserva forma geral. **Para rings fechados, simplifica preservando o último nó (que duplica o primeiro).**
6. **Detecta rotatória** (`isOsmRoundabout`):
   - tag `junction=roundabout` OR `junction=circular`;
   - OR ring fechado com geometria circular (stddev raio < 30% do raio médio).
7. **Bbox métrico** + escala uniforme: `scale = min(usableW/metricW, usableH/metricH)`. Sem stretch.
8. **Mapa `node_id → canvas_point`** (shared nodes): cada OSM node é projetado UMA vez. Duas ways que compartilham um node usam EXATAMENTE o mesmo Vec2.
9. **Snap final** (`snap_px`, default 1 px) — garante que junctions OSM detectadas pelo `RoadNetworkLayerV2`.
10. **Constrói** `SicroRoadObject` (com `smoothing: { mode: "osm", preserve_corners: true }`) OR `SicroRoundaboutObject` (Rotatória 2.0).
11. **Re-dimensiona rotatórias** com base nas larguras das vias entrantes (via `computeAutoDimensions`).
12. **Acumula warnings** (way ignorada, geometria irregular, etc.).

### 22.6 Como rotatórias OSM são tratadas

Detecção em duas vias:

1. **Tag explícita:** `junction=roundabout` OR `junction=circular`. Caso comum bem mapeado.
2. **Geometria implícita:** ring fechado (primeiro `node_ref` == último), com:
   - ≥ 5 nodes;
   - centroide calculado pela média dos pontos métricos;
   - desvio padrão do raio < 30% do raio médio (= polígono aproximadamente circular).
   Critério conservador — pouco falso positivo.

Quando detectada:

- Centroide → `cx`, `cy` (projetados para canvas).
- Raio médio em metros → raio em pixels via `scale` da escala uniforme.
- `lane_count` do OSM (`lanes=*`) ou default 1.
- `width` inicial = `max(14, rPixels * 0.38)` — aproximadamente correto.
- **Re-proporcionada na §8b**: depois que conhecemos as vias entrantes, `computeAutoDimensions(roadWidths, laneCount)` ajusta `r` e `width` proporcionalmente (mesma lógica do botão "Recalcular proporção" do Inspector).
- `metadata_json` preserva: `source: "osm"`, `osm_id`, `junction`, `name`, `node_refs` (para mapping de vias conectadas), `raw_tags`.

A rotatória produzida é um `SicroRoundaboutObject` `kind: "roundabout"` — exatamente como uma rotatória criada manualmente pela toolbar. Imediatamente compatível com `RoadNetworkLayerV2` (Rotatória 2.0 — flares, gaps, seamless integration).

### 22.7 Como curvas OSM são suavizadas

Toda via OSM recebe `smoothing: { mode: "osm", preserve_corners: true }`.

- Mode `"osm"`: Catmull-Rom com tensão 0.6 + 12 samples/segmento + corner preservation ativo (esquinas ≥ 72° preservadas como vértice).
- Polyline OSM (com possíveis micro-ângulos) é processada pelo Road v2 via `buildSmoothedCenterline` → `buildRibbonPolygonRobust` → ribbon polygon final.
- Resultado visual: curvas suaves, esquinas quando o OSM tem ângulos reais, sem tremulação.

**Trade-off intencional:** preservamos Douglas-Peucker no adapter (limpa zigzags) E aplicamos smoothing no Road v2 (suaviza o que restou). As duas etapas se complementam.

### 22.8 Como junctions são preservadas

Princípio: **OSM nodes compartilhados viram pontos canvas idênticos.**

```typescript
// Para cada OSM node, projetamos UMA vez:
projectedNodes: Map<number, Vec2>
```

Quando duas ways compartilham `node_ref = 100`, ambas usam `projectedNodes.get(100)` como endpoint. O Vec2 retornado tem coordenadas pixel-perfeitas iguais para ambas.

`RoadNetworkLayerV2` então detecta a junction via `polylineIntersectionsDetailed`, que encontra interseções entre control polylines — endpoints coincidentes garantem detecção mesmo sem cruzamento "real" (apenas tangência).

**Snap final** (`snap_px=1` px) garante que sub-pixel float não atrapalha — coordenadas são round-trip integral.

### 22.9 Integração com modal OSM

O modal OSM existente (Round 4 / Round 5 da MVP 10) continua funcionando:

1. Usuário abre modal → mapa carrega instantaneamente (`mapEnabled` = true por default).
2. Coordenada (manual ou do Dossiê) + raio (preset 25/50/100/200 m ou custom).
3. **Buscar vias** → `fetchOverpassBBox` (cache em memória, timeout 15s).
4. Modal lista vias encontradas + checkboxes.
5. **Aviso explícito** no footer: "Importação OSM 2.0 — O mapa é referência geográfica. O desenho final usa Road Engine 2.0."
6. Usuário clica "Importar selecionadas" → `convertOsmDatasetToSicroObjects` produz `{ roads, roundabouts, warnings, stats }`.
7. `handleOsmImportConfirm` adiciona ao doc **+ força `road_engine_version: "v2"`**.
8. Seleciona o primeiro objeto importado → perito vê no Inspector.
9. Feedback no rodapé: "Importadas N via(s) · K rotatória(s) do OSM (centro ... · raio ...). Road Engine 2.0 ativado. Escala sugerida: X px/m. · W aviso(s) — veja o console."

### 22.10 Debug / stats

Stats expostos via `OsmAdapterResult.stats`:

- `node_count` / `way_count` — entrada Overpass.
- `imported_road_count` / `imported_roundabout_count` — produzidos.
- `skipped_count` — ways ignoradas (filtros).
- `px_per_m` — escala efetiva do fit.
- `metric_bbox` — bbox em metros antes do fit.

Warnings (português, mostrados no console):

- "Way X ignorada: menos de 2 nodes válidos após filtragem."
- "Way X ignorada: comprimento Y m < mínimo Z m."
- "Way X ignorada: geometria insuficiente após simplificação."
- "Way X (junction=roundabout) ignorada: geometria irregular demais."
- "Way X ignorada: geometria pós-fit muito curta."

### 22.11 Testes (38 novos)

**`osmAdapter.test.ts`:**

- **`projectLatLonToLocalMeters`** (6): origem ≈ (0,0); leste → +x; oeste → -x; norte → -y; sul → +y; proporção X/Y preservada.
- **`classifyOsmWay`** (10): residential → urban + smoothing osm; primary → highway; secondary → avenue; service → parking; footway → dirt; oneway → one_way; lanes parseado; default lane_count; name vs ref vs null.
- **`isOsmRoundabout`** (6): `junction=roundabout` → true; `junction=circular` → true; ring circular sem tag → true; ring com cauda assimétrica → false; way não fechada → false; ring muito pequeno → false.
- **`convertOsmDatasetToSicroObjects` — minimal** (5): dataset vazio; sem highway; residential com smoothing osm; way curta filtrada; metadata preservada.
- **Roundabout integration** (3): tag → SicroRoundaboutObject; metadata preservada; `preserve_roundabouts=false` → road regular.
- **Shared nodes / junction preservation** (2): 2 ways compartilhando node têm endpoints **idênticos** pós-fit; 3 ways em estrela compartilham start point.
- **Fit + scale** (2): escala uniforme em bbox quadrado; dataset minúsculo não crasha.
- **Fixture Macapá-like** (1): cruzamento X + T + rotatória + 3 ways. Verifica preservação do node central + detecção da rotatória.
- **Serializer round-trip** (2): road OSM salva + reabre preservando smoothing/metadata; rotatória OSM preserva lane_count.

### 22.12 Limitações conhecidas

| Limitação | Trabalho futuro |
|---|---|
| Clipping por raio ao Overpass query — não filtra post-projection | Aceito: Overpass já restringe ao bbox; raio funciona como "filtro grosso" geográfico. |
| Sem detecção de rampa/viaduto (multi-level) | Fora do escopo SICRO: croqui pericial 2D. |
| Sem reuso de osmAdapter para diff/refresh OSM | Trabalho futuro: re-importação incremental. |
| Detecção de rotatória pela geometria pode dar falso negativo em rotatórias com geometria muito irregular (canteiro central oval, etc.) | Tag explícita `junction=roundabout` cobre o caso ideal; fallback a `closed_path` ainda manual. |
| Largura do anel inicial (antes do re-dimensionamento via §8b) é heurística | Re-dimensionamento via `computeAutoDimensions` corrige. Botão "Recalcular proporção" do Inspector também disponível. |
| Sem renderer de **preview** SICRO no modal — apenas o tile Leaflet | Aviso explícito no footer mitiga; preview real é trabalho futuro. |
| Footway/pedestrian classificado como `dirt` (não importa por default) | Pode ser parametrizado em `default_road_style` futuramente. |
| Importação OSM ativa Road v2 sempre, mesmo se croqui está em v1 | Por design — Road v2 é o destino. Perito pode reverter pelo toggle. |

### 22.13 Validação manual esperada

Roteiro do perito (briefing §16):

1. Abrir Croqui, criar novo.
2. Confirmar Road v2 ativo (ou deixar v1 — será forçado v2 pela importação).
3. Abrir Importar OSM.
4. Confirmar mapa carregando.
5. Coordenada Macapá: `0.0345, -51.0694` (centro do Dossiê de teste, se houver).
6. **Buscar vias em raio 25 m** → importar via simples.
7. **Buscar vias em raio 50 m** → importar cruzamento.
8. **Buscar rotatória** (encontrar local em Macapá com rotatória OSM mapeada — ex: praças centrais).
9. **Importar rotatória** → confirmar `SicroRoundaboutObject` no Inspector (não `closed_path` road).
10. Confirmar **curvas suaves** nas vias residenciais.
11. Confirmar **junctions limpos** nos cruzamentos (junction patches do RoadNetworkLayerV2).
12. Confirmar **rotatória proporcional** (anel grosso, ilha visível, flares conectados às vias).
13. **Confirmar editabilidade**: arrastar control points de uma via importada → ribbon recalcula.
14. **Salvar + reabrir** → tudo persiste, smoothing aplicado.
15. **Exportar PNG técnico** → curvas suaves no PNG igual ao canvas.
16. **Exportar PNG limpo** → idem.
17. Inserir no Laudo se fluxo disponível.
18. Exportar PDF do Laudo se viável.

Critério de aprovação:
- OSM importado visualmente **igual ou melhor** que vias manuais Road v2.
- Rotatória OSM **comparável** à rotatória manual.
- Junctions OSM funcionando como junctions manuais.
- Sem tremulação / sem zigzags / sem rotatória deformada.
- Sem regressão nos cenários manuais aprovados.

### 22.14 O que está preservado

- ✅ Road v1 segue intacto.
- ✅ `engine/osm.ts` legado intocado.
- ✅ Junction patches X/T/Y (Ciclo 2 v2).
- ✅ Rotatória 2.0 + seamless integration (Ciclos v6/v7/v10).
- ✅ Smoothing controlado (Ciclo 2 v5).
- ✅ Loop removal robusto (Ciclo 2 v4).
- ✅ Importar Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home — não tocados.
- ✅ Schema 100% aditivo.
- ✅ Sem commit / sem merge / sem tag.

### 22.15 Validações automáticas

| | Pré-Fase G | Pós-Fase G |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 584 | **622** (+38) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 22.16 Resumo executivo da Fase G

✅ **`road-v2/osmAdapter.ts`** — adapter puro convertendo OsmDataset → `{ roads, roundabouts, warnings, stats }`.
✅ **`convertOsmDatasetToSicroObjects`** orquestra: projeção métrica → filtragem → simplificação → detecção de rotatória → fit uniforme → snap shared nodes → SicroRoadObject (smoothing osm) + SicroRoundaboutObject (Rotatória 2.0).
✅ **`classifyOsmWay`** mapeia tags OSM → road_style + lane_count + direction + label + smoothing.
✅ **`isOsmRoundabout`** detecta via tag OR geometria circular (stddev raio < 30%).
✅ **Junctions preservadas** via `Map<osm_node_id, Vec2>` — shared nodes têm endpoints coincidentes.
✅ **Modal OSM** atualizado para usar adapter 2.0 + aviso "Importação OSM 2.0" no footer.
✅ **`CroquiEditor`** força `road_engine_version: "v2"` ao importar — OSM sempre renderiza no motor novo.
✅ **38 testes novos** cobrindo projeção, classificação, detecção, fit, junction preservation, fixture Macapá-like, serializer.
✅ **622 testes vitest** + 88 cargo + typecheck verde — zero regressão.

**Aguardando validação visual final do perito.**

---

## 23. Fase G v2 — Largura proporcional para divided carriageway

> **Status:** correção entregue. `pnpm typecheck` ✓, `pnpm test` 634
> (+12), `pnpm build` ✓, `cargo check` ✓. **Sem commit / sem merge /
> sem tag.** Aguardando nova validação visual.

### 23.1 Sintoma reportado

Após a validação visual da Fase G inicial, o perito sinalizou:
> "rotatória importou, ruas importaram, só teve problema na rua da
> esquerda, perceba, é uma via com um canteiro central, que ele
> considerou como duas vias, e essas duas vias que ele considerou
> acabou desenhando de uma forma como se cada uma delas tivesse dois
> sentidos, então acabaram ficando trunkadas".

Concretamente: a Avenida Manoel Torrinha (Macapá) chega à rotatória
com **canteiro central**. No OSM, isso é modelado como duas ways
distintas, cada uma `oneway=yes` + `lanes=2`, paralelas. O adapter
Fase G 1.0 desenhava cada uma com **largura cheia do preset urban
(80 px)**, ignorando `oneway`. Resultado: dois ribbons grossos
encostados, ambos com eixo central tracejado (como se fossem duas
ruas mão-dupla coladas) — visual "trunkado".

### 23.2 Causa raiz

O `classifyOsmWay` lia `osmLanesHint(tags)` e `osmOnewayToDirection(tags)`,
mas só usava `lane_count` como metadado. A **largura física** vinha
sempre do preset (`ROAD_STYLES["urban"].width = 80 px`), sem
considerar:
- a direção (oneway tem metade das faixas que bidirecional),
- a tag `lanes=N` (informação confiável quando presente).

Adicionalmente, **`markings.center_line`** mantinha o preset
(`dashed` para urban), pintando o eixo amarelo/branco no meio
de uma via mão única — incorreto por construção.

### 23.3 Decisão técnica

Mantém o princípio "OSM é dados, não motor". O adapter ganha
inteligência para:

1. **Calcular `width_px = lane_count × LANE_WIDTH_M × px_per_m`**
   quando há informação confiável (oneway OR `lanes` explícito).
   - `LANE_WIDTH_M = 3.5` (DNIT urbano).
   - `MIN_ROAD_WIDTH_PX = 14` (floor visual).
2. **Inferir lanes default para oneway sem `lanes` tag**:
   - residential/urban oneway → 1 faixa.
   - tertiary/secondary/avenue oneway → 2 faixas.
   - primary/highway oneway → 2 faixas.
   - service/parking oneway → 1 faixa.
3. **Sobrescrever `markings` para oneway:**
   - `center_line = "none"` (não há sentidos opostos para separar).
   - `edge_line = true` (sempre).
   - `lane_dividers = true` se `lane_count ≥ 2`.

**Bidirecional sem `lanes` tag** mantém o preset (sem regressão).

### 23.4 Arquivos alterados

- `src/modules/croqui/engine/road-v2/osmAdapter.ts`:
  - Constantes `LANE_WIDTH_M`, `MIN_ROAD_WIDTH_PX`.
  - `OsmRoadClassification` agora inclui `width_px`, `is_one_way`,
    `lanes_from_osm`, `should_override_width`.
  - `classifyOsmWay(tags, defaultLaneCount, smoothingMode, pxPerM)`
    — novo 4º parâmetro (escala do fit).
  - `inferOneWayDefaultLanes(road_style)` — helper interno.
  - `onewayMarkings(baseMarkings, laneCount)` — helper interno.
  - `convertOsmDatasetToSicroObjects` passa `scale` do fit ao
    classificador e aplica `overrides.width` + `overrides.markings`
    conforme as flags da classificação.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`:
  - +12 testes (8 unidades sobre `classifyOsmWay`; 4 integrados
    sobre o adapter final aplicando largura proporcional).

### 23.5 Validação automática

| | Pré-Fase G v2 | Pós-Fase G v2 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 622 | **634** (+12) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 23.6 Roteiro de validação visual

1. Croqui → Novo croqui em branco.
2. Importar OSM com o **mesmo ponto que reproduziu o bug** (rotatória
   de Macapá, raio 50 m).
3. Conferir no canvas:
   - **Avenida Manoel Torrinha** (à esquerda da rotatória) agora
     aparece como **duas vias finas paralelas**, cada uma com:
     - largura ≈ metade da via mão-dupla equivalente;
     - **sem eixo central tracejado**;
     - **com divisor de faixa** (linha branca dashed entre as 2
       faixas no sentido), se OSM tiver `lanes=2`;
     - borda lateral branca sólida.
   - **Outras vias do entorno** mantêm aparência (sem regressão).
   - **Rotatória central** segue como na Fase G 1.0 (anel + ilha +
     flares).
4. Editar uma das ways oneway: arrastar control point — ribbon
   recalcula corretamente.
5. Salvar → reabrir → larguras + markings persistem.
6. Exportar PNG técnico — visual idêntico ao canvas.

Critério de aprovação:
- Avenida com canteiro central **visualmente reconhecível como tal**
  (duas vias finas paralelas, não dois ribbons grossos).
- Sem eixo central nas oneway.
- Bidirecionais sem `lanes` mantêm visual da Fase G 1.0.
- Junctions e rotatórias inalteradas.

### 23.7 O que NÃO foi feito (escopo deliberado)

- **Não mesclamos** o par de ways em uma única via com median
  central. OSM modela como duas ways separadas e o adapter respeita
  essa modelagem — o canteiro fica como espaço vazio entre os dois
  ribbons. Mesclar exigiria detecção de paralelismo + casamento de
  direções opostas, o que é frágil em OSM real. Pode entrar em
  fase futura se o perito julgar necessário.
- **Não mudamos `road_style`** por causa de oneway. A direção
  afeta `lane_count` (e portanto `width`) + markings, não o
  `road_style` (urban/avenue/highway segue mapeando do `highway` tag).
- **Não alteramos** o Road v1 nem o conversor legado `engine/osm.ts`.
- Sem commit / sem merge / sem tag.

### 23.8 Resumo executivo da Fase G v2

✅ Avenidas com canteiro central no OSM (`oneway=yes` pairs)
agora ficam visualmente proporcionais.
✅ `classifyOsmWay` ganhou `width_px`, `is_one_way`,
`lanes_from_osm`, `should_override_width`.
✅ Oneway sem `lanes` infere default por `road_style`.
✅ Markings de oneway: sem eixo central, lane_dividers só se 2+
faixas.
✅ Bidirecionais sem `lanes` preservam preset (zero regressão).
✅ 12 testes novos (634 total, +12 desde Fase G 1.0).
✅ Typecheck / build / cargo check verdes.

**Aguardando nova validação visual do perito** com o mesmo ponto
que reproduziu o "trunkado".

---

## 24. Fase G v3 — Proporção uniforme entre TODAS as vias OSM

> **Status:** correção entregue. `pnpm typecheck` ✓, `pnpm test`
> 635 (+1), `pnpm build` ✓, `cargo check` ✓. **Sem commit / sem
> merge / sem tag.** Aguardando nova validação visual.

### 24.1 Sintoma reportado na validação da v2

Após v2, o perito reabriu o mesmo ponto (rotatória de Macapá com
Avenida Manoel Torrinha à esquerda) e reportou:
> "mesmo local, resultado foi esse, ruas desproporcionais".

No print de validação:
- **Avenida Manoel Torrinha** (2 ways oneway, `lanes=2`): largura
  ~14 px (fina, escalada proporcionalmente).
- **Rua Renascimento, Rua Principal, Rua Socialismo** (two_way
  sem `lanes` tag): largura ~80 px (preset urban não escalado).

Ratio visual ≈ 1:5.7 entre vias do mesmo nível hierárquico. O
perito comparou e reportou desproporção.

### 24.2 Causa raiz

A v2 só sobrescrevia `width` quando havia info confiável (oneway
OR `lanes` explícito do OSM). Bidirecionais sem `lanes` mantinham
o **preset não escalado**. Como `urban.width = 80 px` foi
calibrado para um canvas "ideal" sem px_per_m definido,
80 px num scale de ~2 px/m representam ~40 m físicos de largura —
não é rua, é pista de pouso.

Em outras palavras: a v2 corrigiu a oneway, mas deixou a
bidirecional "presa" a um sistema de unidades diferente. O
resultado foi desproporção entre vias OSM (mesma origem, mesma
escala) — exatamente o que o perito sinalizou.

### 24.3 Decisão técnica

**Aplicar proporção a TODAS as vias OSM**, não apenas oneway ou
com `lanes` explícito. O adapter passa a obedecer um princípio
único: tudo que vem do OSM compartilha o mesmo `px_per_m` do fit.

Mudanças mínimas em `osmAdapter.ts`:

- `should_override_width = true` **sempre** (independente de
  direção / tag `lanes`).
- `MIN_ROAD_WIDTH_PX` ajustado de 14 → 16 (visibilidade extra
  quando o scale é muito pequeno).
- Demais regras da v2 mantidas: oneway sem `lanes` infere
  default por `road_style`; markings de oneway sem eixo central;
  `lane_dividers` true se `lane_count ≥ 2`.

Vias **manuais** seguem usando preset (não passam pelo adapter)
— sem regressão no fluxo de "criar via" manualmente.

### 24.4 Por que NÃO mesclamos divided carriageway nesta fase

OSM modela avenida com canteiro central como **duas ways
oneway paralelas**. Mesclar exigiria:
- detecção de paralelismo;
- casamento de direções opostas;
- inferência da posição/largura do canteiro;
- decisão de qual nome usar (geralmente as duas têm o mesmo `name`).

Em OSM real isso é frágil — o mapeador pode esquecer de marcar
oneway numa das ways, ou usar `name` ligeiramente diferente em
cada lado. A v3 escolhe **respeitar a modelagem OSM** (duas
ways) e garantir proporção. O canteiro fica como espaço entre
os ribbons (visual coerente em zoom in).

Mesclar pode entrar como fase futura se o perito julgar
necessário, mas não foi pré-requisito desta correção.

### 24.5 Arquivos alterados (v3)

- `src/modules/croqui/engine/road-v2/osmAdapter.ts`:
  - `MIN_ROAD_WIDTH_PX`: 14 → 16.
  - `should_override_width` em `classifyOsmWay`: sempre true.
  - Docstring atualizado explicando o princípio v3.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`:
  - Teste `two_way SEM lanes → should_override_width false`
    atualizado para asserir `true`.
  - Teste `two_way residential SEM lanes → mantém preset`
    atualizado para `width proporcional ao scale`.
  - Testes do clamp `MIN_ROAD_WIDTH_PX` atualizados de 14 → 16.
  - **+1 teste novo:** `proporção uniforme: 4-faixas vs 2-faixas
    → ratio 2:1` — asserção direta do que a v3 garante.

### 24.6 Validação automática

| | Pré-v3 | Pós-v3 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 634 | **635** (+1) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 24.7 Roteiro de validação visual

1. Croqui → Novo croqui em branco.
2. Importar OSM no **mesmo ponto** (rotatória de Macapá, raio
   25/50 m).
3. Conferir no canvas:
   - **Todas as vias OSM têm proporção realista entre si.**
     - Avenida Manoel Torrinha (2 ways oneway, `lanes=2`):
       cada ribbon = 2 faixas × 3.5 m × scale.
     - Rua Renascimento (mão-dupla, sem `lanes`): 2 faixas
       default × 3.5 m × scale.
     - Cada way oneway da avenida tem **mesma largura** que a
       rua mão-dupla — porque ambas têm 2 faixas no total da
       sua geometria. Visualmente a avenida fica MAIOR porque
       são DUAS ways paralelas + espaço entre (canteiro).
   - Sem oneway com 80 px nem mão-dupla com 14 px — tudo
     escalado pelo mesmo `px_per_m`.
   - Rotatória central segue como antes.
   - Junctions limpos.
4. Comparar lado a lado com SICRO 1.0 Python — verificar
   plausibilidade visual.
5. Salvar → reabrir → larguras persistem.
6. Exportar PNG técnico/limpo.

Critério de aprovação:
- **Sem desproporção visual entre vias OSM importadas no mesmo
  croqui.**
- Avenidas com canteiro central são visualmente reconhecíveis
  como tal (duas vias paralelas com espaço entre).
- Rotatória + junctions inalterados.

### 24.8 Tradeoff aceito

Em fit overview de raios grandes (200 m+), todas as vias OSM
ficam **proporcionalmente finas**. Isso é fisicamente correto:
uma rua de 7 m num canvas que cobre 400 m de mundo real **deve**
ocupar ~1.75% do canvas. O perito ajusta zoom para detalhar
áreas — o mesmo workflow das vias manuais.

Alternativa rejeitada: aplicar "boost visual" (multiplicador
> 1) para tornar OSM mais grosso. Rejeitada porque (a) introduz
constante mágica não-pericial e (b) cria mismatch com a régua
de medições.

### 24.9 Resumo executivo da Fase G v3

✅ `should_override_width = true` SEMPRE — proporção uniforme
entre TODAS as vias OSM no mesmo croqui.
✅ `MIN_ROAD_WIDTH_PX` aumentado para 16 (visibilidade em scales
pequenos).
✅ Bidirecional sem `lanes` agora também escalada (corrige a
desproporção da v2).
✅ Vias manuais mantêm preset (não passam pelo adapter).
✅ +1 teste de ratio uniforme (635 total).
✅ Typecheck / build / cargo check verdes.

**Aguardando nova validação visual do perito** com o mesmo ponto
que reproduziu a desproporção da v2.

---

## 25. Fase G.2 — Paridade visual com SICRO 1.0

> **Status:** preset entregue. `pnpm typecheck` ✓, `pnpm test`
> **679** (+44), `pnpm build` ✓, `cargo check` ✓, `cargo test
> --lib` **88** ✓. **Sem commit / sem merge / sem tag.** Aguardando
> validação visual lado-a-lado com SICRO 1.0.

### 25.1 Por que a v3 ainda foi reprovada

Após a v3, o perito comparou o resultado lado a lado com o
SICRO 1.0 Python e foi enfático: **estruturalmente o motor 2.0
está correto, mas visualmente o 1.0 ainda parece "croqui pronto"
enquanto o 2.0 parece "alpha"**. O diagnóstico real não é cor da
ilha nem setas oneway. É:

1. **Proporção geral das vias** (1.0 mais equilibrado).
2. **Largura visual vs rotatória** (1.0 mais harmonioso).
3. **Bordas brancas com peso correto** (1.0 menos "técnico").
4. **Eixo amarelo tracejado com peso visual certo** (1.0 mais
   "placa de trânsito real").
5. **Integração das entradas ao anel** (1.0 mais orgânica).
6. **Sensação geral de croqui pericial pronto**.

Conclusão: precisamos copiar não só a estrutura do 1.0, mas as
**constantes visuais exatas** que ele usa.

### 25.2 Auditoria — constantes visuais extraídas do SICRO 1.0

Auditoria nova das 5 fontes Python (commit
`C:\Users\perit\OneDrive\Documentos\SICRO\`):

| Item | SICRO 1.0 Python | SICRO 2.0 antes da G.2 | Ajuste G.2 |
|---|---|---|---|
| Asfalto fill | `#1C1C1C` (`editor_croqui.py:2950`) | `#3f3f46` (`urban` preset) | OSM agora pinta `#1C1C1C` |
| Calçada fill | `#7C7460` (`editor_croqui.py:2927`) | `#475569` (`urban.curb.color`) | OSM agora pinta `#7C7460` |
| Ilha rotatória | `#3A6535` (`editor_croqui.py:2964`) | `#e5e7eb` (cinza claro) | OSM rotatória agora verde Python |
| Eixo amarelo | `#F5C518` (`editor_croqui.py:2991`) | `#fde047` (Tailwind yellow-300) | Renderer agora `#F5C518` |
| Borda branca | `#FFFFFF` (`editor_croqui.py:2982`) | `#f5f5f5` (Tailwind neutral-100) | Renderer agora `#FFFFFF` |
| Dash eixo | `(12, 8)` px (`editor_croqui.py:2969`) | `[14, 12]` px | (mantido — diferença visualmente menor) |
| Stroke eixo | `2 px` (`lw_mc`) | `2 px` | igual ✓ |
| Stroke borda | `2 px` (`lw_b`) | `2 px` | igual ✓ |
| Largura primary | `10.5 m` (`_LARG_CLASSE`) | `lanes × 3.5 m` ou preset 180px | OSM agora `_LARG_CLASSE[hw] × scale` |
| Largura tertiary | `7.5 m` | `lanes × 3.5 m` | idem |
| Largura residential | `6.0 m` | `lanes × 3.5 m` ou preset 80px | idem |
| Largura footway | `2.0 m` | preset 60px | idem |
| Marcação default residential | branca (`_marcacao_para_highway`) | dashed (preset urban) — color "auto" | OSM agora `markings.color = "white"` |
| Marcação default tertiary | amarela | dashed — color "auto" → amarelo só para avenue/highway | OSM agora `markings.color = "yellow"` |
| Superfície footway | calçada (`_superficie_para_highway`) | mantida como asfalto | OSM footway agora pinta calçada |
| Centerline solid | sempre tracejada no Python | poderia ser solid em arteriais | OSM agora sempre `"dashed"` |

### 25.3 Arquivos criados / alterados

**Criados:**
- `src/modules/croqui/engine/road-v2/sicro1Parity.ts` (~265 linhas)
  — constantes extraídas do Python:
  - 6 cores (`SICRO_1_COLOR_*`).
  - Tabela `_LARG_CLASSE` completa (13 highways).
  - Helpers: `sicro1OsmRoadWidthMeters(tags)`,
    `sicro1CenterLineColorForHighway(highway)`,
    `sicro1SurfaceForHighway(highway)`,
    `sicro1SurfaceFillForHighway(highway)`,
    `sicro1RoadStyleForHighway(highway)`.
  - Objeto agregador `SICRO_1_PARITY_PRESET` (`version: 1`).
- `src/modules/croqui/engine/road-v2/__tests__/sicro1Parity.test.ts`
  — **43 testes** cobrindo cores, tabela widths, helpers,
  preset agregado.

**Alterados:**
- `src/modules/croqui/engine/road-v2/index.ts` —
  `export * from "./sicro1Parity"`.
- `src/modules/croqui/engine/road-v2/osmAdapter.ts`:
  - `classifyOsmWay` agora calcula `width_px` usando
    `sicro1OsmRoadWidthMeters(tags) × pxPerM` (tabela Python).
  - Oneway divided carriageway divide a largura por 2 (cada
    way representa um lado da arterial).
  - O tag OSM `lanes` continua presente como metadado em
    `lane_count` mas NÃO afeta o cálculo de largura — paridade
    com o Python que ignora `lanes` para width.
  - Adapter sobrescreve `surface.fill` para `#1C1C1C` (asfalto)
    ou `#7C7460` (calçada/footway), `curb.color` para `#7C7460`,
    `markings.color` para `"yellow"` ou `"white"` conforme a
    classe OSM.
  - Rotatória importada do OSM recebe `inner_color: "#3A6535"`
    (verde Python) e `surface.fill: "#1C1C1C"`.
- `src/modules/croqui/engine/road-v2/rendererAdapter.tsx`:
  - `resolveColors` atualizado:
    - Branco vira `#FFFFFF` puro (em vez de `#f5f5f5`).
    - Amarelo vira `#F5C518` (Python) em vez de `#fde047`.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`:
  - Testes de width-by-class refeitos para a nova fórmula
    (Python `_LARG_CLASSE`).
  - +1 teste novo: `tag width=10` sobrescreve `_LARG_CLASSE`.
- `src/modules/croqui/engine/road-v2/__tests__/rendererAdapter.test.ts`:
  - Asserções de cor atualizadas (`#f5f5f5` → `#FFFFFF`,
    `#fde047` → `#F5C518`).

**Preservados (intocados):**
- `engine/osm.ts` legado.
- `factories.ts` `ROAD_STYLES` (vias manuais continuam com
  preset original — sem regressão).
- `roundabout.ts` `DEFAULT_INNER_COLOR` (rotatórias manuais
  antigas continuam cinza claro — perito pode trocar pelo
  Inspector).
- Schema `.sicrocroqui` v0.3 — aditivo, sem nova migração.
- Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home —
  zero modificação.

### 25.4 Decisão importante: preset SOMENTE no adapter OSM

O preset `sicro1Parity` **NÃO** muda os defaults globais do
Road Engine v2. Ele é aplicado **explicitamente pelo adapter
OSM** ao construir cada `SicroRoadObject` e `SicroRoundaboutObject`
importado:

- Vias manuais criadas pelo perito (Toolbar → Criar via)
  continuam usando o `ROAD_STYLES` preset original (urban,
  avenue, highway, etc.) — sem mudança visual.
- Rotatórias manuais continuam com ilha cinza claro.
- Croquis antigos abrem idênticos.

Quando o perito julgar que vias manuais também devem usar o
preset Python, basta trocar `ROAD_STYLES.urban.surface.fill`,
`curb.color` etc. (uma linha). Mas isso fica fora desta fase
para não tocar em coisas funcionando.

### 25.5 Roteiro de validação visual lado-a-lado

1. Croqui → Novo croqui em branco.
2. Importar OSM no **mesmo ponto que foi reprovado nas v1, v2,
   v3** (rotatória de Macapá, raio 25/50 m).
3. Comparar lado a lado:
   - Print do SICRO 1.0 Python (referência).
   - Print do SICRO 2.0 G.2 (resultado novo).
4. Verificar especificamente:
   - [ ] Asfalto: cinza muito escuro (quase preto) — não
         cinza-médio.
   - [ ] Calçada (curb): cinza-amarelado quente — não azul-cinza.
   - [ ] Eixo central: amarelo `#F5C518` tracejado nas arteriais,
         branco nas residenciais.
   - [ ] Bordas: brancas puras (`#FFFFFF`).
   - [ ] Rotatória: ilha central VERDE `#3A6535`.
   - [ ] Largura primary ≈ 10.5 m × scale (proporção real).
   - [ ] Largura tertiary ≈ 7.5 m × scale (3.75 m por way oneway).
   - [ ] Largura residential ≈ 6 m × scale.
   - [ ] Avenida com canteiro central (Manoel Torrinha): cada
         way oneway tem ~3.75 m visual, separadas pelo canteiro.
   - [ ] Modo normal **sem** contornos azulados, sem handles
         visíveis, sem stroke de debug.
   - [ ] Modo Debug Road v2 mostra overlay (control points,
         flares, junctions) sobre tudo.
5. Salvar → reabrir → cores e larguras persistem.
6. Exportar PNG técnico/limpo.

Critério de aprovação:
- "**Olhando lado a lado, o SICRO 2.0 G.2 tem qualidade visual
  igual ou superior ao SICRO 1.0.**"
- Se ainda persistir sensação de "alpha vs pronto", entrar em
  Fase G.3 ajustando peso/proporção das marcações.

### 25.6 Limitações conhecidas / itens não-cobertos

1. **Setas direcionais em oneway** — Python não desenha; SICRO 2.0
   também não. Esse item pode entrar em fase futura se o perito
   julgar relevante.
2. **Padrão `granulado` no asfalto** — Python tem `superficies.py`
   com padrão `granulado` (pontos cinza claros sobre cinza
   escuro). O multipass NÃO renderiza esse padrão (linha 2952
   do Python usa `cor_asf` lisa). SICRO 2.0 também não. Paridade.
3. **Mascaramento per-pixel** das marcações dentro de outras
   vias — Python faz `_dist_seg` per ponto. SICRO 2.0 faz
   junction patches + clipping AABB. Resultado visual diferente
   mas equivalente em qualidade.
4. **Fundo verde do canvas Python** vs cinza escuro do SICRO 2.0
   — diferença de tema do app, não da via. Não tratado nesta
   fase.

### 25.7 Validações automáticas

| | Pré-G.2 | Pós-G.2 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 635 | **679** (+44) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

Novos testes: 43 em `sicro1Parity.test.ts` + 1 em `osmAdapter.test.ts`
(`tag width=10`).

### 25.8 Resumo executivo da Fase G.2

✅ **`sicro1Parity.ts`** centraliza 6 cores + tabela
`_LARG_CLASSE` + 5 helpers do SICRO 1.0 Python.
✅ Asfalto OSM agora `#1C1C1C`, calçada `#7C7460`, ilha
rotatória `#3A6535` (verde Python).
✅ Eixo central amarelo `#F5C518` (Python), branco
`#FFFFFF` (puro).
✅ Largura física por classe OSM (`primary=10.5m`,
`tertiary=7.5m`, etc.) — paridade com `_LARG_CLASSE`.
✅ Oneway divided carriageway = `_LARG_CLASSE / 2` por way
(reconstrói arterial com canteiro).
✅ Centerline color por highway: arteriais → amarelo,
residenciais → branco (paridade `_marcacao_para_highway`).
✅ Vias manuais e rotatórias antigas intactas.
✅ 44 testes novos (679 total) + typecheck/build/cargo verdes.

**Aguardando validação visual lado-a-lado com o SICRO 1.0** —
critério: paridade igual ou superior, não apenas estrutural.

---

## 26. Fase G.3 — Diagnóstico de runtime + causa raiz visual

> **Status:** entregue. `pnpm typecheck` ✓, `pnpm test` **689**
> (+10), `pnpm build` ✓, `cargo check` ✓, `cargo test --lib`
> **88** ✓. **Sem commit / sem merge / sem tag.** Aguardando
> nova validação visual.

### 26.1 Por que a G.2 falhou visualmente

A G.2 trocou as **cores e larguras-por-classe** corretamente,
mas o perito reportou "praticamente não mudou nada no resultado
visual". O diagnóstico anterior tratava a paridade como tabela
de constantes — útil, mas insuficiente.

**Causa raiz identificada (10 hipóteses rodadas até descobrir):**

Hipótese vencedora — **2 etapas estruturais do Python NÃO
existiam no SICRO 2.0:**

1. **`_clipar_no_raio`** (`desenho/osm_via.py:87`) — Python
   recorta cada way OSM ao **círculo do raio** antes de
   projetar para canvas. O bbox do fit fica `~2 × raio`, não
   o comprimento total da via.
2. **`_pontos_para_spline`** (`desenho/osm_via.py:169`) —
   Python reduz cada way clipada a **4 pontos de controle
   Cubic Bezier** via Hermite (tangentes nos endpoints +
   controles a `arc/3` ao longo das tangentes).

O resultado conjunto dessas duas etapas: SICRO 1.0 dá zoom
DENTRO do raio + desenha curvas LIMPAS de 4 pontos.

**O que estava acontecendo no SICRO 2.0 G.2:**
- Way OSM Avenida Manoel Torrinha = ~800 m de geometria (vinda
  do Overpass).
- Bbox métrico ≈ 800 m × 800 m → fit scale ≈ 1280 / 800 = 1.6
  px/m (compatível com o "1.81 px/m" que aparecia no rodapé).
- Largura tertiary = 7.5 m × 1.6 = 12 px → THIN.
- Polyline OSM com 30+ vértices → curva "tortuosa" mesmo com
  smoothing Catmull-Rom.

**Em paralelo, SICRO 1.0 Python no mesmo local:**
- Way clipada ao raio 25 m → bbox ≈ 50 m × 50 m.
- Fit scale ≈ 25 px/m (15× maior!).
- Largura tertiary = 7.5 m × 25 = 187 px → BIG, visualmente
  satisfatório.
- 4 pontos Bezier → curva PROFISSIONAL, sem zigue-zague de
  vértices intermediários.

A diferença de scale (15×) é exatamente o que o perito viu como
"qualidade visual inferior".

### 26.2 Auditoria do fluxo (T2 do briefing)

Caminho real do OSM até o renderer:

```
OsmImportModal.handleConfirm
  → convertOsmDatasetToSicroObjects (adapter G.2 — sem clip,
                                     sem bezier)
  → onConfirm(result)
  → CroquiEditor.handleOsmImportConfirm
  → setDoc({ objects: [...prev, ...result.roads,
                       ...result.roundabouts],
             road_engine_version: "v2" })
  → CanvasStage
  → RoadNetworkLayerV2 (mesh = buildMeshFromRoad(road))
  → roadObjectToMeshInput passa surface.fill, curb.color,
                           markings.color para o renderer
  → Konva.Line / Konva.Circle no canvas
```

Conclusões da auditoria:
- ✅ Modal chama `convertOsmDatasetToSicroObjects` (adapter v2.0).
- ✅ `engine/osm.ts` legado **não** é mais usado para gerar
  objetos finais.
- ✅ Schema, coercer, `roadObjectToMeshInput` preservam
  `surface.fill`, `curb.color`, `markings.color`,
  `markings.center_line`, `markings.color`.
- ✅ `road_engine_version: "v2"` é forçado.
- ✅ `RoadNetworkLayerV2` lê `mesh.surfaceFill`, `mesh.curbFill`,
  `mesh.centerColor`, `mesh.edgeColor` e aplica no Konva.
- ❌ **Sem clip + sem bezier**: o objeto que chegou ao renderer
  é tecnicamente correto, mas estruturalmente diferente do que
  o Python produz.

### 26.3 Correção estrutural

#### 26.3.1 `clipPolylineToRadius(pts, radius)`

Reimplementação direta do `_clipar_no_raio` Python — clipa
uma polilinha em coords métricas locais (origem = centro do
sinistro) ao círculo de raio dado. Preserva trechos parciais
via cálculo de interseção segmento × círculo.

```typescript
export function clipPolylineToRadius(
  pts: ReadonlyArray<Vec2>,
  radius: number,
): Vec2[];
```

#### 26.3.2 `polylineToBezier4Points(pts)`

Reimplementação do `_pontos_para_spline` Python — reduz a
polilinha clipada a 4 pontos de controle Cubic Bezier:

```typescript
export interface OsmBezierFit {
  start: Vec2;
  end: Vec2;
  c1: Vec2;  // start + tangenteInicial × (arc / 3)
  c2: Vec2;  // end - tangenteFinal × (arc / 3)
  arcLengthM: number;
}

export function polylineToBezier4Points(
  pts: ReadonlyArray<Vec2>,
): OsmBezierFit | null;
```

#### 26.3.3 Schema aditivo `SicroRoadObject.bezier?`

```typescript
bezier?: { cx1: number; cy1: number; cx2: number; cy2: number; };
```

Quando presente, `roadObjectToMeshInput` passa para o renderer
como `RoadMeshInput.bezier`. O `buildMeshFromRoad` (Fase B do
Road v2) já consumia esse campo para vias manuais com Bezier
explícito — agora vias OSM também o usam.

#### 26.3.4 Pipeline do adapter atualizado

```
ways OSM
 → projetar lat/lon → metros locais
 → detectar rotatória (com geometria completa, ANTES do clip)
 → CLIPAR cada way ao raio (vias regulares)
 → simplificar (DP) leve
 → Hermite → Bezier 4-point
 → bbox métrico do conjunto CLIPADO + fit uniforme
 → SicroRoadObject {
     points: [start.x, start.y, end.x, end.y]   ← 2 pontos
     bezier: { cx1, cy1, cx2, cy2 }              ← 2 controles
     surface.fill: "#1C1C1C"  (Fase G.2 mantido)
     curb.color:  "#7C7460"  (Fase G.2 mantido)
     markings.color: yellow/white por highway
     width: _LARG_CLASSE[hw] × scale (clipped)
   }
```

### 26.4 Runtime OSM Import Diagnostics (T1 do briefing)

`CroquiEditor.handleOsmImportConfirm` agora imprime no
DevTools console (View → Toggle Developer Tools, ou
Ctrl+Shift+I) um `console.groupCollapsed` por importação,
com **um log por via** mostrando:

```
road {
  id, label, source: "osm" | "manual",
  highway, oneway, lanes_tag, arc_length_m,
  road_style, lane_count, width_px, direction,
  bezier_set: true | false,
  surface_fill: "#1C1C1C",
  curb_color: "#7C7460",
  curb_enabled: true,
  markings_center: "dashed" | "none",
  markings_color: "yellow" | "white",
  markings_lane_dividers: bool,
  smoothing: "osm" | ...
}
```

E **um log por rotatória** com:

```
roundabout {
  id, label, source, osm_id,
  cx, cy, outer_r_px, inner_r_px, ring_width_px,
  lane_count, surface_fill, inner_color, border_color
}
```

Permite ao perito (e a auditorias futuras) **provar
empiricamente** que o preset visual chegou ao objeto antes
do renderer.

### 26.5 Substituir vias OSM anteriores (T3 do briefing)

`handleOsmImportConfirm` agora **remove automaticamente**
todas as vias e rotatórias OSM existentes do `doc.objects`
antes de inserir as novas. Detecta:
- `road.subtype === "osm_way"`, OU
- `road.metadata_json.source === "osm"`, OU
- `roundabout.metadata_json.source === "osm"`.

Vias manuais não são afetadas. O `pushHistory(prev.objects)`
preserva o undo. A feedback message agora avisa:
> "...Road Engine 2.0 ativado (vias OSM anteriores foram
> substituídas)."

Garante que a validação visual sempre usa objetos novos
(com Bezier + clip + preset Python), não restos de
importação anterior.

### 26.6 Arquivos alterados (G.3)

- `src/modules/croqui/engine/schema.ts`:
  - `SicroRoadObject.bezier?: { cx1, cy1, cx2, cy2 }` aditivo.
- `src/modules/croqui/engine/road-v2/osmAdapter.ts`:
  - +160 linhas: `clipPolylineToRadius` + `polylineToBezier4Points`
    + `OsmBezierFit` interface.
  - Pipeline `convertOsmDatasetToSicroObjects` refatorado: clip
    antes do fit, Bezier-fit por way, endpoints em
    `[start, end]` apenas, `bezier` setado no override.
  - `projectedPolyline` helper removido (obsoleto).
- `src/modules/croqui/engine/road-v2/rendererAdapter.tsx`:
  - `roadObjectToMeshInput` passa `obj.bezier` para o renderer.
- `src/modules/croqui/editor/CroquiEditor.tsx`:
  - `handleOsmImportConfirm` agora: (a) console.group com
    diagnostic de cada objeto importado; (b) remove OSM
    existentes antes de inserir novos; (c) feedback message
    atualizada.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`:
  - +10 testes (clipPolylineToRadius × 6 +
    polylineToBezier4Points × 4).
  - Teste de fixture Macapá atualizado para a semântica
    Bezier 4-point (junções interiores não são vértices).
  - 62 testes ao total no osmAdapter.

### 26.7 Validações automáticas

| | Pré-G.3 | Pós-G.3 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 679 | **689** (+10) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 26.8 Roteiro de validação visual lado-a-lado

1. Croqui → Novo croqui em branco.
2. Abrir DevTools (Ctrl+Shift+I), aba Console.
3. Importar OSM no MESMO ponto que reprovou em G.2:
   - centro lat 0.0719, lon -51.05308.
   - raio 25 m.
4. **No console**, conferir o `[OSM] Importação ...` group:
   - Cada via OSM tem `bezier_set: true`.
   - `surface_fill: "#1C1C1C"`.
   - `curb_color: "#7C7460"`.
   - `markings_color: "yellow"` ou `"white"` conforme classe.
   - `arc_length_m` próximo de 50 (não 500+) — confirma clip.
5. **No canvas**, conferir visualmente:
   - Vias agora aparecem **muito mais grossas e proporcionais
     ao canvas** (clip + scale apropriado).
   - Curvas **suaves** (4-point Bezier, sem zigue-zague).
   - Avenida Manoel Torrinha com canteiro central reconhecível.
   - Rotatória central com ilha verde, anel proporcional.
6. Comparar lado-a-lado com SICRO 1.0 Python — **dimensão e
   composição visual devem estar próximas**.

Critério de aprovação:
- Vias visivelmente proporcionais ao canvas (não fios finos).
- Composição harmoniosa (não geométrica/bruta).
- Rotatória integrada às entradas, anel + ilha proporcionais.
- Se ainda não atender, entrar em Fase G.4 com ajustes finos
  baseados nas **medições do diagnóstico runtime** (largura,
  raio, anel) — que agora podem ser obtidos do console.

### 26.9 O que NÃO foi feito (escopo deliberado)

- **`resolveSicro1VisualMetrics` agregado** (T5 do briefing):
  larguras, raios e dash já vinham do `sicro1Parity.ts` da G.2.
  Não criamos novo agregador para evitar redundância.
- **Mascaramento per-pixel** das marcações: SICRO 2.0 mantém
  `junctionPatches.ts` + clipping AABB (abordagem diferente
  do `_dist_seg` Python, mas equivalente em qualidade).
- **Setas direcionais oneway, fundo verde do canvas, padrão
  granulado no asfalto**: itens estilísticos secundários,
  fora do escopo desta correção.
- Road v1, `engine/osm.ts` legado, `ROAD_STYLES` presets
  manuais, rotatórias manuais — todos intactos.

### 26.10 Resumo executivo da Fase G.3

✅ **Causa raiz identificada e corrigida:** ausência de
clip-por-raio + ausência de Bezier 4-point geravam objetos
estruturalmente diferentes do Python, mesmo com cores certas.
✅ **`clipPolylineToRadius`** + **`polylineToBezier4Points`**
implementam paridade Python.
✅ **Schema aditivo** `SicroRoadObject.bezier?` carrega os
2 control points internos do Bezier.
✅ **Runtime diagnostic** no console permite verificação
empírica do que chegou ao objeto.
✅ **Substituição automática** de OSM anteriores evita
confusão entre objetos novos e remanescentes.
✅ 10 testes novos (689 total) + typecheck/build/cargo verdes.

**Aguardando nova validação visual** com o mesmo ponto que
reprovou em G.2. Se ainda houver gap, o diagnóstico runtime
agora dá métricas concretas para a próxima iteração.

---

## 27. Fase G.3 ROLLBACK — Regressão grave por clipping/Bezier experimental

> **Status:** rollback entregue. `pnpm typecheck` ✓,
> `pnpm test` **694** (+5), `pnpm build` ✓, `cargo check` ✓.
> **Sem commit / sem merge / sem tag.** Aguardando nova
> validação visual com o pipeline stable.

### 27.1 O que regrediu

Validação visual da G.3 no mesmo local Macapá (raio 25 m,
croqui novo) gerou **regressão grave**:

- Vias OSM apareceram como **fragmentos isolados** (retângulos
  pretos pequenos espalhados pelo canvas).
- A **malha perdeu continuidade**: ribbons não se conectam à
  rotatória nem entre si.
- A **rotatória ficou isolada** no centro, sem entradas
  detectadas.
- O resultado ficou **visualmente pior** que qualquer versão
  anterior (G.2, G v3, G v2, G inicial). O perito qualificou
  como "atrocidade".

### 27.2 Causa provável da regressão (diagnóstico)

A combinação `clipPolylineToRadius` + `polylineToBezier4Points`
quebra a **topologia** que o `RoadNetworkLayerV2` depende para:

1. **Detectar junctions** — depende de endpoints OSM compartilhados
   entre ways. Quando uma via OSM atravessa o círculo de clip, o
   clipping cria **endpoints NOVOS** (pontos de interseção
   segmento × círculo) que NÃO casam com nenhum `node_id`.
   Resultado: shared nodes perdidos → junction detection retorna
   vazio → cada via vira fragmento isolado.

2. **Conectar vias à rotatória** — o detector de roundabout
   entries procura endpoints de vias próximos do anel. Os
   endpoints clipados estão na borda do círculo de clip (raio
   25 m), não no anel da rotatória (raio ~12 m). Resultado:
   nenhuma entry detectada → rotatória isolada.

3. **Reduzir via a 4-point Bezier** — em raio pequeno (25 m),
   a polyline clipada tem comprimento próximo do raio. Bezier
   com 2 control points entre 2 endpoints próximos vira um
   **trecho minúsculo e quase reto** — visualmente um retângulo
   pequeno, não uma via.

Conclusão: o port direto do Python `_clipar_no_raio` +
`_pontos_para_spline` **não é compatível com a arquitetura
topológica do Road Engine 2.0**. SICRO 1.0 Python aceita esse
modelo porque seu render não depende de junction detection
estrutural — ele usa máscara per-pixel (`_dist_seg`) para
clipar marcações em runtime, independente de endpoints.

### 27.3 Decisão de rollback

**Princípio**: `Continuidade da malha > Suavização visual`.

Reverter G.3 visualmente:
- **Default** = pipeline **stable** (G.2): polilinha completa
  + smoothing Catmull-Rom "osm" + shared nodes preservados.
- **Opt-in flag** = `experimental_bezier_clip` (G.3): mantido
  no código para experimentos futuros, NÃO é o default.

O que NÃO é revertido (porque não estava quebrado):
- Cores G.2 (asfalto `#1C1C1C`, calçada `#7C7460`, ilha verde
  `#3A6535`, eixo amarelo `#F5C518`).
- Larguras G.2 (`_LARG_CLASSE` × scale).
- Marcação por highway (yellow/white).
- Diagnóstico runtime no console (`console.groupCollapsed`).
- Substituição automática de OSM existentes.
- Road v2 forçado ao importar.

### 27.4 Modo de importação como flag

```typescript
export type OsmImportMode = "stable" | "experimental_bezier_clip";

export interface OsmImportOptions {
  // ... outros campos ...
  /**
   * Pipeline visual a usar. Default `"stable"` — preserva topologia.
   * `"experimental_bezier_clip"` aplica clip + Bezier 4-point estilo
   * Python; **não usar como default até a fragmentação ser resolvida**.
   */
  mode?: OsmImportMode;
}
```

No adapter:
- `stable`: usa `projectedFlatPolyline(...)` (polilinha completa
  + shared nodes via `projectedNodes` map). Não chama clip nem
  Bezier fit.
- `experimental_bezier_clip`: chama `clipPolylineToRadius` +
  `polylineToBezier4Points` + emite `bezier` field no
  SicroRoadObject (caminho G.3 original).

`resolveOptions(opts).mode ?? "stable"`.

### 27.5 Pipeline stable (default)

```
ways OSM
  → projetar lat/lon → metros locais
  → preservar shared node coordinates (Map<node_id, Vec2>)
  → simplificar (Douglas-Peucker tolerance 0.6 m)
  → fit uniforme global
  → snap de endpoints compartilhados
  → SicroRoadObject {
      points: polilinha completa simplificada,
      width: _LARG_CLASSE[hw] × scale,
      surface.fill: "#1C1C1C",
      curb.color: "#7C7460",
      markings.color: yellow|white,
      markings.center_line: "dashed",
      smoothing: { mode: "osm" },
      // SEM bezier field
    }
  → RoadNetworkLayerV2 (junction detection funciona)
```

Rotatórias OSM continuam como `SicroRoundaboutObject`
(Rotatória 2.0) — caminho independente do mode flag.

### 27.6 Fixture Macapá obrigatória

Criada em `osmAdapter.test.ts`: descreve sintese viária do
local reprovado:
- Avenida Manoel Torrinha (2 ways oneway divided carriageway).
- Rua Renascimento (curva nordeste).
- Rua Principal (sul reto).
- Rua Socialismo (sudeste reto).
- Rotatória 12 m de raio (`junction=roundabout`, 12 nodes).

Testes que rodam contra a fixture:
- `stable: gera malha reconhecível (5 vias + 1 rotatória, sem
  fragmentos)` — ✓
- `experimental_bezier_clip: produz objetos com bezier field
  (cuidado: pode fragmentar)` — ✓ (marca o modo como
  experimental, não valida visual).

### 27.7 Comparação stable vs experimental

| Item | stable (default) | experimental_bezier_clip |
|---|---|---|
| `points.length` típico | >= 4 (polilinha) | == 4 (start + end) |
| `bezier` field | undefined | setado |
| Topologia preservada | **Sim** | Pode quebrar (endpoints clipados) |
| Junction detection | Funciona | Não confiável |
| Rotatória conectada | Sim | Pode ficar isolada |
| Curvas suaves | Catmull-Rom smoothing | Cubic Bezier 4-point |
| Bbox do fit | Geometria completa (zoom out) | Geometria clipada (zoom in) |
| Visual em raio pequeno | Vias visíveis | Fragmentos minúsculos |
| Recomendado para | Produção | Experimentos isolados |

### 27.8 Arquivos alterados no rollback

- `src/modules/croqui/engine/road-v2/osmAdapter.ts`:
  - `OsmImportMode` exportado + `OsmImportOptions.mode?`.
  - `resolveOptions` retorna `mode: "stable"` por default.
  - Helper `projectedFlatPolyline` restaurado (havia sido
    removido na G.3).
  - Pipeline branched: `experimentalMode` guarda chamadas a
    `clipPolylineToRadius` + `polylineToBezier4Points`.
  - Build step branched: stable usa polilinha + sem bezier;
    experimental usa 2 pontos + bezier.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`:
  - Teste Macapá fixture atualizado para semântica stable
    (shared node 100 = vértice da polyline).
  - +5 testes novos: 3 sobre mode switching + 2 sobre fixture
    Macapá (stable + experimental).
  - 67 testes ao total no osmAdapter.

### 27.9 Validações automáticas

| | Pré-rollback (G.3) | Pós-rollback |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 689 | **694** (+5) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

### 27.10 Roteiro de validação

1. Croqui → Novo croqui em branco.
2. (Opcional) DevTools → Console — para inspecionar diagnostic.
3. Importar OSM no MESMO ponto (Macapá, raio 25 m).
4. **No console** (se aberto):
   - Confirmar que `bezier_set: false` em todas as vias OSM.
   - `import_mode: "stable"` no metadata.
5. **No canvas:**
   - Vias OSM aparecem como ribbons **contínuos**, não
     fragmentos.
   - A rotatória aparece **conectada** às vias entrantes
     (entries detectadas, flares desenhados).
   - **Topologia intacta** — comparar com o resultado
     pré-G.3 (G.2), que era reconhecível.
6. Critério mínimo: **o resultado precisa estar ao menos
   tão bom quanto a versão pré-G.3 (G.2)**. Paridade visual
   total com SICRO 1.0 é objetivo futuro, mas a regressão da
   G.3 está revertida.

### 27.11 Lição aprendida

**Não aplicar port do Python cegamente.** O SICRO 1.0 usa
arquitetura diferente:
- Python: render por máscara per-pixel + Bezier 4-point sem
  precisar de junction detection.
- SICRO 2.0: `RoadNetworkLayerV2` depende de junction detection
  por shared endpoints + polyline geometry.

Sobreposição entre os dois modelos NÃO é trivial. Tentar usar
Bezier 4-point obrigatório quebra a topologia que o renderer
v2 precisa.

A paridade visual com SICRO 1.0 ainda é um objetivo válido,
mas **não pode sacrificar** continuidade da malha, junctions
funcionais, ou rotatória conectada. Pesquisa futura: como
manter polilinha (para topologia) e ainda produzir visual
suave Python-style (talvez via melhor smoothing, não via
clip/bezier obrigatório).

### 27.12 O que NÃO foi feito (deliberado)

- **Não removemos** o código da G.3 (`clipPolylineToRadius`,
  `polylineToBezier4Points`, `bezier` field no schema). Ficam
  como opt-in para experimentos futuros.
- **Não criamos UI** para o modo experimental — o flag é
  setado via `options.mode` chamando o adapter
  programaticamente. O modal sempre usa default `"stable"`.
- **Não voltamos** as cores G.2 (asfalto/calçada/ilha verde)
  — essas mudanças NÃO eram a causa da regressão.
- **Não fizemos commit/merge/tag.** Road v1, módulos Drone /
  Laudo / Evidências / Dossiê / Vídeo / Imagem / Home —
  intactos.

### 27.13 Resumo executivo do rollback

✅ Pipeline **stable** (G.2) restaurado como **default**.
✅ Pipeline **experimental_bezier_clip** (G.3) isolado atrás
de flag `OsmImportOptions.mode`.
✅ Topologia preservada — shared nodes, junctions, rotatória
conectada.
✅ Cores G.2 (paridade Sicro 1.0) mantidas.
✅ Diagnóstico runtime + substituição automática de OSM
mantidos.
✅ Fixture Macapá criada para validação automática contínua.
✅ 5 testes novos (694 total) + typecheck / build / cargo
verdes.

**Aguardando nova validação visual** — critério: a importação
voltou a ser **pelo menos** tão boa quanto era antes da G.3.
