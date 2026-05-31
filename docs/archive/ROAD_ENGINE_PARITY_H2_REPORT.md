# Python Parity Engine — H.2 Report

**Data:** 2026-05-26
**Fase:** H.2 — Renderer Konva multipass simples
**Status:** Entregue. **Aguardando validação visual antes de prosseguir.**
**Branch:** `mvp/osm-road-import`. Sem commit / sem merge / sem tag.

---

## 1. Escopo entregue

**4 arquivos novos** em `src/modules/croqui/engine/road-parity/`:

| Arquivo | Linhas | Propósito |
|---|---:|---|
| `geometry.ts` | 217 | Funções puras de geometria — paridade direta com Python |
| `clipping.ts` | 213 | Boolean clipping de marcações com densificação + fallback |
| `renderer.tsx` | 360 | `<RoadParityRenderer>` — 4 passes Konva multipass |
| `__tests__/geometry.test.ts` | 200 | 20 testes |
| `__tests__/clipping.test.ts` | 132 | 10 testes |

**1 arquivo novo** no spike (para validação):

| Arquivo | Propósito |
|---|---|
| `src/modules/croqui/spikes/road-render-lab/parity/ParityLabRenderer.tsx` | Adapter que converte LabScene → SicroParityObject[] e renderiza com o renderer real |

**2 arquivos alterados** (cirurgicamente):

- `road-parity/index.ts` — barrel agora exporta geometry, clipping, RoadParityRenderer.
- `spikes/road-render-lab/LabApp.tsx` — adiciona terceira opção "Parity Engine REAL" + modo lado-a-lado "Parity | Konva".

**Nenhuma alteração** em CanvasStage, Road v1, Road v2, OSM adapter, módulos não-Croqui.

---

## 2. Como o renderer funciona

### 2.1 Filosofia (paridade SICRO 1.0)

Imitação direta do `_desenhar_vias_multipass` Python:

1. **Calçada** — polígono offset cinza-amarelado, fundo.
2. **Asfalto** — polígono preto + anel/ilha das rotatórias.
3. **Marcações** — bordas brancas + eixo central tracejado, **clipadas contra obstáculos**.
4. **Handles** — apenas para objeto selecionado.

**Não tem:** junction patches X/T/Y, flares, roundabout entries, smoothing modes, ribbon robust, lane dividers, road_style, closed_path, smoothing parameterizado. Igual Python.

### 2.2 Passes em detalhe

#### Pass 1 — Calçadas

Para cada `SicroRoadObject_parity` com `superficie === "asfalto"`:
- `sampleCubicBezier(road, 32)` → 33 pontos da centerline em mundo.
- `buildRoadSidewalk(samples, largura_m/2, 2.0)` → polígono offset.
- `projectWorldPoints(poly, pxPerM, offsetX, offsetY)` → canvas.
- `<Konva.Line closed tension={0.5} fill="#7C7460" />`.

Para cada `SicroRoundaboutObject_parity`:
- `<Konva.Circle radius={(r_m + largura_m/2 + 2) × pxPerM} fill="#7C7460" />`.

#### Pass 2 — Asfalto

Para cada via:
- `buildRoadRibbon(samples, largura_m/2)` → polígono asfalto.
- `<Konva.Line closed tension={0.5} fill={cor_por_superficie} />`.
- Cor: `asfalto` → `#1C1C1C`; `calcada` → `#7C7460`; `terra` → `#9C7A4E`.

Para cada rotatória:
- `<Konva.Circle radius={outer_r_px} fill="#1C1C1C" />` (asfalto do anel).
- `<Konva.Circle radius={inner_r_px} fill={inner_color ?? "#3A6535"} />` (ilha).

#### Pass 3 — Marcações

Para cada via:
- `buildRoadEdges(samples, largura_m/2)` → bordas left + right (mundo).
- Obstáculos = polígonos do asfalto de TODAS as outras vias + discos de TODAS as rotatórias.
- `clipPolylineAgainstPolygons(border, obstacles)` → sub-polilinhas.
- Renderiza cada sub-polilinha como `<Konva.Line stroke="#FFFFFF" strokeWidth={2} lineCap="butt" />`.

Se `mao_dupla === true` E `marcacao !== "nenhuma"`:
- `clipPolylineAgainstPolygons(centerline, obstacles)` → sub-polilinhas.
- Renderiza cada sub-polilinha como `<Konva.Line stroke={cor_marcacao} strokeWidth={2} dash={[12, 8]} lineCap="butt" />`.
- Cor: `amarela` → `#F5C518`; `branca` → `#FFFFFF`.

Para cada rotatória:
- `<Konva.Circle stroke="#FFFFFF" strokeWidth={2} fillEnabled={false} />` em raios externo e interno.

#### Pass 4 — Handles

Apenas se o objeto está selecionado (`obj.id === selectedId`):

**Via:**
- Círculos A, B nas âncoras (raio 7px, azul accent `#4A80FF`, stroke preto).
- Círculos C1, C2 nos controles (raio 5px, azul mais claro `#4F72E0`).
- Linhas tracejadas A↔C1 e B↔C2 (guia visual).

**Rotatória:**
- Círculo no centro (raio 7px, azul accent).
- Anel tracejado no raio externo (handle para redimensionar futuramente).

---

## 3. Conversão `largura_m` → pixels

**Princípio:** o objeto SEMPRE armazena `largura_m` em metros. O renderer multiplica por `pxPerM` no momento de desenhar.

```typescript
const effectivePxPerM = resolvePxPerM(props.pxPerM);
// resolvePxPerM:
//   - número positivo válido → retorna ele mesmo
//   - null / undefined / 0 / NaN / Infinity / negativo → PARITY_DEFAULT_PX_PER_M (10)

const halfWidthPx = road.largura_m / 2 × effectivePxPerM;
```

Não há cache de "largura em pixels" no objeto. Mudar o zoom do documento muda só o `pxPerM`, e todas as vias se reescalam automaticamente.

---

## 4. Como a rotatória é desenhada

```
sidewalk_r_px  = (r_m + largura_m/2 + 2) × pxPerM   ← Pass 1 (calçada externa)
outer_r_px     = (r_m + largura_m/2) × pxPerM        ← Pass 2 (asfalto do anel)
inner_r_px     = max(0, r_m - largura_m/2) × pxPerM  ← Pass 2 (ilha)
borda externa  =          ↑ stroke branco            ← Pass 3
borda interna  =          ↑ stroke branco            ← Pass 3
```

5 camadas Konva.Circle concêntricas. Cor padrão da ilha: `#3A6535` (verde canteiro Python). Quando `inner_color` está setado no objeto, sobrescreve.

---

## 5. Como a marcação é desenhada

**Eixo central** (tracejado amarelo/branco):
- Sampleado da Bezier (32 pontos).
- Clipado contra polígonos de outras vias + discos de rotatórias.
- Renderizado como `Konva.Line` com `dash={[12, 8]}` em px fixos de tela.
- Color hardcoded: `#F5C518` (amarelo Python) ou `#FFFFFF` (branco).

**Bordas brancas** (left + right):
- `buildRoadEdges(samples, halfWidth)` → 2 polilinhas perpendiculares.
- Cada uma clipada contra os mesmos obstáculos.
- Renderizada sólida (sem dash) com `strokeWidth={2}`.

---

## 6. Clipping com fallback (regra do perito)

A função `clipPolylineAgainstPolygons` tem **comportamento defensivo em 3 camadas**:

1. **Linha vazia (< 2 pontos)** → retorna `[]` (nada a desenhar).
2. **Sem obstáculos** → retorna `[line.slice()]` sem chamar algoritmo principal.
3. **Try-catch** em volta do algoritmo principal — qualquer erro de geometria captura:
   ```typescript
   try {
     const densified = densifyPolyline(line, 1.0);
     return { segments: doClip(densified, obstacles), report };
   } catch (err) {
     // Fallback: retorna a polilinha INTACTA com warning.
     return {
       segments: [line.slice()],
       report: { fallback_used: true, fallback_reason: err.message, ... }
     };
   }
   ```

**Garantia:** o renderer NUNCA deixa o croqui sem marcação por causa de boolean op. Se algo der errado, a marcação aparece sem clipping (visualmente um pouco "errada" no cruzamento, mas o croqui inteiro fica legível). Nunca aberração.

### Densificação automática

Antes de clipar, a polilinha passa por `densifyPolyline(line, 1.0)` — subdivide segmentos > 1m em pontos intermediários. Garante que segmentos longos que atravessam um obstáculo (ambos endpoints fora, trecho interno dentro) sejam detectados corretamente.

---

## 7. Onde rodar a validação visual

### 7.1 Acesso

URL: `http://localhost:1420/#spike=road-render-lab`

(Mesmo lab usado em H-spike. Zero impacto no app real.)

### 7.2 Dropdown "Renderer"

Adicionei a opção **"Parity Engine REAL (sozinho)"** + **"Parity | Konva (lado a lado)"**.

A opção "Parity Engine REAL" usa o renderer de produção (`RoadParityRenderer` exportado de `engine/road-parity/`). Não é o renderer do spike — é o que o app vai usar.

### 7.3 Fixtures incluídas

As 6 fixtures originais do spike funcionam:

1. **Via curva** (Bezier em S).
2. **Via em U** (retorno apertado).
3. **Cruzamento X** (4 vias arteriais).
4. **Cruzamento T** (horizontal + vertical).
5. **Rotatória + 4 vias** (anel + cardeais).
6. **Macapá-like** (rotatória + Av. Manoel Torrinha + Renascimento + Principal + Socialismo).

Todas convertidas automaticamente pelo `ParityLabRenderer` adapter de `LabScene` para `SicroParityObject[]`.

### 7.4 Botão "PNG Parity"

Adicionei botão dedicado de export PNG para o renderer parity. Funciona igual ao Konva — `stage.toDataURL()`.

---

## 8. Limitações conhecidas (H.2)

1. **Sem drag de handle ainda.** Os handles aparecem quando seleciona via, mas não são arrastáveis. H.6 adiciona drag.
2. **Sem ferramenta "Criar via" no app principal ainda.** Para criar objetos parity, hoje só via factory programática. H.6 adiciona toolbar.
3. **Sem Inspector parity.** H.6.
4. **Sem migração de croquis antigos.** H.4.
5. **Sem adapter OSM parity.** Bloqueado até H.2 ser visualmente aprovada (regra do perito). H.5.
6. **Sem render de calçada para `superficie === "calcada"` ou `"terra"`.** O renderer atual só desenha calçada externa quando a via é asfalto. Vias do tipo `calcada` ou `terra` não têm calçada própria (faz sentido: calçada não tem calçada, terra não tem calçada). Mantido conforme Python.
7. **Sem export PNG no app principal.** Apenas no lab. App principal continua usando v1/v2.

---

## 9. Testes — 30 novos (777 total)

| Arquivo | Testes | Cobertura |
|---|---:|---|
| `geometry.test.ts` | 20 | Bezier sampling, ribbon polygon, edges, rings rotatória, projeção, flatten |
| `clipping.test.ts` | 10 | Vazio, sem obstáculos, atravessando, dentro, fora, múltiplos obstáculos, fallback com NaN, sem segmentos de 1 ponto |

**Total parity (acumulado H.1 + H.2): 83 testes.**

Validações:

| | Pré-H.2 | Pós-H.2 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 747 | **777** (+30) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

---

## 10. Roteiro de validação visual obrigatório

**Critério de aprovação H.2** (do briefing do perito):

> H.2 só será aprovada se visualmente:
> - via reta parecer rua;
> - curva suave parecer rua;
> - via em U parecer aceitável;
> - cruzamento X/T não parecer blocos quebrados;
> - rotatória simples parecer melhor que Road v2;
> - o resultado lembrar mais o SICRO 1.0 do que o Road v2 atual.

### Como validar

1. Rodar `pnpm tauri dev` (ou `pnpm dev` no browser).
2. Abrir `http://localhost:1420/#spike=road-render-lab`.
3. No dropdown "Renderer", selecionar **"Parity Engine REAL (sozinho)"**.
4. Para cada fixture (dropdown "Fixture"):
   - **Via curva** — confirmar curva suave.
   - **Via em U** — confirmar retorno aceitável (pode ter auto-cruzamento de ribbon — limitação conhecida sem ribbon robusto; documentar).
   - **Cruzamento X** — confirmar 4 vias chegam no centro, marcações clipadas no encontro.
   - **Cruzamento T** — confirmar via horizontal contínua, vertical chega e termina.
   - **Rotatória + 4 vias** — confirmar anel + ilha verde + 4 vias terminam no perímetro.
   - **Macapá-like** — confirmar malha reconhecível (4 vias + rotatória central).
5. Comparar lado a lado com **"Parity | Konva (lado a lado)"** — o renderer Parity deve estar **igual ou melhor** que o Konva do spike (que foi aprovado em H-spike).
6. Para cada fixture, exportar PNG via botão "PNG Parity" — confirmar que o export funciona.

### Critério visual mínimo

Se você olhar lado a lado com o **SICRO 2.0 atual (Road v2)** e o resultado **claramente parecer mais com o SICRO 1.0 Python**:
- Curvas suaves ✓
- Marcações tracejadas finas amarelas ✓
- Ilha verde da rotatória ✓
- Sem patches quebrados nas junções ✓
- Sem flares estranhos ✓
- Sem fragmentação ✓

→ **H.2 aprovada.** Sigo para H.3 (feature flag no CanvasStage), depois H.4 (migration), depois H.6 (ferramentas + Inspector), depois H.5 (OSM adapter — só depois das anteriores estáveis).

### Se H.2 reprovar

Não passo para H.3 sem aprovar H.2 visualmente. Você diz exatamente o que não está bom e ajusto **dentro** dos limites do escopo H.2 (passes, cores, larguras, clipping). Sem adicionar features novas.

---

## 11. O que NÃO foi feito (escopo deliberado)

- ❌ Nenhum CanvasStage tocado.
- ❌ Nenhuma toolbar nova.
- ❌ Nenhum Inspector novo.
- ❌ Nenhuma migração de documentos.
- ❌ Nenhum adapter OSM (bloqueado até H.2 aprovado).
- ❌ Nenhum drag de handle (H.6).
- ❌ Nenhum template parity (H.7).
- ❌ Nenhuma remoção de Road v1 / v2.
- ❌ Nenhum commit / merge / tag.

App principal **continua funcionando idêntico**. v1, v2, OSM import (stable), Drone, Laudo, Evidências, Dossiê, Imagem, Vídeo, Home — todos intocados.

---

## 12. Resumo executivo H.2

✅ **`geometry.ts`** — funções puras paridade Python (sampleCubicBezier, buildRoadRibbon, buildRoadEdges, buildRoundaboutRings, projeções).
✅ **`clipping.ts`** — boolean clipping per-polyline com densificação automática + fallback defensivo (3 camadas).
✅ **`renderer.tsx`** — `<RoadParityRenderer>` em **4 passes** Konva multipass paridade Python:
  - Calçada → Asfalto → Marcações clipadas → Handles.
✅ **30 testes novos** cobrindo Bezier, ribbon, edges, rings, projeção, clipping, fallback (777 total).
✅ **Validação visual** habilitada via lab: dropdown "Parity Engine REAL" + lado a lado com Konva.
✅ **Zero impacto** no app principal (v1, v2, OSM import, módulos não-Croqui).
✅ Typecheck / build / cargo check verdes.

**Aguardando validação visual com critério explícito: o resultado precisa lembrar mais o SICRO 1.0 do que o Road v2 atual.**
