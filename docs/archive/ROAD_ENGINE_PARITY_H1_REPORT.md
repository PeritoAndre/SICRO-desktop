# Python Parity Engine — H.1 Report

**Data:** 2026-05-26
**Fase:** H.1 — Schema + tipos do Python Parity Engine
**Status:** Entregue. Aguardando validação antes de prosseguir para H.2 (renderer).
**Branch:** `mvp/osm-road-import`. Sem commit / sem merge / sem tag.

---

## 1. Escopo entregue

Apenas **tipos e factories**. Nenhum renderer. Nenhuma integração com o app. Nenhum coercer de migração (esses entram em H.2 e H.4).

### Arquivos novos

```
src/modules/croqui/engine/road-parity/
├── types.ts          286 linhas — SicroRoadObject_parity + SicroRoundaboutObject_parity + constantes
├── factories.ts      163 linhas — makeParityRoad, makeParityRoadBezier, makeParityRoundabout
├── guards.ts          85 linhas — isParityRoad, isParityRoundabout, isParityObject, isLegacyRoadOrRoundabout
├── index.ts           14 linhas — barrel export
└── __tests__/
    ├── types.test.ts          (30 testes)
    ├── guards.test.ts         (17 testes)
    └── serialization.test.ts  ( 6 testes)
```

### Arquivos alterados (cirurgicamente)

- `src/modules/croqui/engine/schema.ts`:
  - `RoadEngineVersion` agora aceita `"parity"` além de `"v1" | "v2"`.
  - `SicroCroquiDoc` ganhou campo opcional `parity_objects?: SicroParityObject[]`.
  - `SicroObject` union **NÃO** foi alterado (decisão deliberada — ver §3).
- `src/modules/croqui/engine/serializer.ts`:
  - `coerceRoadEngineVersion` aceita `"parity"`.
  - `coerceCroquiDoc` faz passthrough de `parity_objects` (sem coerção dedicada ainda — H.4 introduz).
- `src/modules/croqui/editor/CroquiEditor.tsx`:
  - Prop `roadEngineVersion` da `EditorStatusBar` agora aceita o `RoadEngineVersion` completo (inclui `"parity"`).

---

## 2. Modelo entregue

### 2.1 `SicroRoadObject_parity` — 20 campos

| Categoria | Campos |
|---|---|
| Sistema (5) | `id`, `kind: "road_parity"`, `engine: "parity"`, `layer_id`, `category: "vias"` |
| Geometria Bezier 4-point (8) | `ax`, `ay`, `bx`, `by`, `cx1`, `cy1`, `cx2`, `cy2` (mundo, metros) |
| Aparência (4) | `largura_m`, `superficie`, `mao_dupla`, `marcacao` |
| Estado UI (3) | `visible`, `locked`, `label` |
| Metadata (1) | `metadata_json` |

**Eliminados vs SicroRoadObject legado:** `subtype`, `points` polilinha, `direction`, `road_style`, `lane_count`, `lane_width`, `markings.*` (5 sub-campos), `curb.*` (3), `surface.*` (2), `spline_tension`, `smoothing.*`, `closed_path`, `bezier?` (passa a ser primeira classe).

### 2.2 `SicroRoundaboutObject_parity` — 13 campos

| Categoria | Campos |
|---|---|
| Sistema (5) | `id`, `kind: "roundabout_parity"`, `engine: "parity"`, `layer_id`, `category: "vias"` |
| Geometria (4) | `cx`, `cy`, `r_m`, `largura_m` (mundo, metros) |
| Aparência (2) | `superficie`, `inner_color?` (opcional — default verde `#3A6535` no renderer) |
| Estado UI (3) | `visible`, `locked`, `label` |
| Metadata (1) | `metadata_json` |

**Ajustes vs spec H.0 conforme aprovação:**
- ✓ `inner_color` mantido como opcional (default `#3A6535` no renderer).
- ✓ `border_color` removido (branco hardcoded).
- ✓ `lane_count` removido.
- ✓ `flares`, `entries` não existem.

### 2.3 Constantes domínio (exportadas)

| Constante | Valor | Origem Python |
|---|---|---|
| `PARITY_ENGINE_TAG` | `"parity"` | discriminador interno |
| `PARITY_ROAD_LARGURA_PADRAO_M` | `7.0` | `spline_via.py:37 LARGURA_PADRAO` |
| `PARITY_ROAD_LARGURA_MIN_M` | `0.5` | clamp inferior |
| `PARITY_ROAD_LARGURA_MAX_M` | `30.0` | clamp superior |
| `PARITY_ROUNDABOUT_R_MIN_M` | `2.0` | sanidade |
| `PARITY_ROUNDABOUT_R_MAX_M` | `100.0` | sanidade |
| `PARITY_ROUNDABOUT_LARGURA_PADRAO_M` | `7.0` | exemplo `_rotatoria` |
| `PARITY_ROUNDABOUT_LARGURA_MIN_M` | `2.0` | ilha visível |
| `PARITY_ROUNDABOUT_LARGURA_MAX_M_FALLBACK` | `15.0` | sanidade |
| `PARITY_DEFAULT_PX_PER_M` | `10` | fallback quando `scale.px_per_m` é null |
| `PARITY_SIDEWALK_WIDTH_M` | `2.0` | `superficies.py calcada_auto.largura` |

---

## 3. Decisão arquitetural importante: array separado `parity_objects`

A spec original (H.0) propunha adicionar os tipos parity ao `SicroObject` union. **Mudei essa decisão durante a implementação** porque adicionar `SicroRoadObject_parity` à união quebrou narrowing em ~6 lugares do código existente (`InspectorPanel.tsx`, `CroquiEditor.tsx`, `serializer.test.ts`) — TypeScript passou a exigir guards adicionais em cada `if (obj.kind === "road")`.

**Solução escolhida:** array separado.

```typescript
interface SicroCroquiDoc {
  // ... campos existentes ...
  objects: SicroObject[];                            // legado (v1 + v2)
  parity_objects?: SicroParityObject[];              // Fase H — NOVO
  road_engine_version?: "v1" | "v2" | "parity";
}
```

**Vantagens:**
- Zero impacto no código existente que trabalha com `objects`.
- Type narrowing em `kind === "road"` permanece com a shape legada.
- Renderer parity (H.2) lê `parity_objects` exclusivamente.
- Migration (H.4) move objetos de `objects` → `parity_objects`.

**Trade-off:**
- Documento "parity-puro" tem `objects: []` e `parity_objects: [...]`. Não é elegante mas é prático.
- Loops sobre TODOS os objetos precisam iterar nos dois arrays. Aceitável.

**Type discrimination:** `kind: "road_parity"` e `kind: "roundabout_parity"` (não `"road"` / `"roundabout"`). Isso evita colisões de switch-case mesmo se algum código ler ambos os arrays misturados no futuro.

---

## 4. Type guards

```typescript
isParityRoad(obj): obj is SicroRoadObject_parity
isParityRoundabout(obj): obj is SicroRoundaboutObject_parity
isParityObject(obj): obj is SicroParityObject
isLegacyRoadOrRoundabout(obj): boolean
```

Todos aceitam `SicroObject | { engine?: unknown; kind?: unknown }` para serem robustos a inputs não-tipados (JSON raw vindo de disco, payloads de undo/redo, etc.).

---

## 5. Factories

```typescript
makeParityRoad(ax, ay, bx, by, opts?) → SicroRoadObject_parity
makeParityRoadBezier(ax, ay, cx1, cy1, cx2, cy2, bx, by, opts?) → SicroRoadObject_parity
makeParityRoundabout(cx, cy, r_m, opts?) → SicroRoundaboutObject_parity
```

Defaults conforme spec:
- via: largura_m = 7.0, superfície = asfalto, mão dupla, amarela, controles a 1/3 e 2/3.
- rotatória: largura = 7.0, superfície = asfalto, `inner_color` undefined (renderer aplica `#3A6535`).

Clamps:
- `largura_m` da via em `[0.5, 30]`.
- `r_m` da rotatória em `[2, 100]`.
- `largura_m` da rotatória em `[2, min(15, r_m - 1)]` (garante ilha visível).
- Inputs inválidos (`NaN`, `Infinity`) caem no mínimo.

IDs autogerados com prefixo `rdp_` (road parity) ou `rbp_` (roundabout parity) — fácil identificação em logs.

---

## 6. Testes — 53 novos (747 total)

| Arquivo | Testes | Cobertura |
|---|---:|---|
| `types.test.ts` | 30 | factory defaults, overrides, clamp, edge cases (NaN, Infinity), ID generation, kinds, engine tag |
| `guards.test.ts` | 17 | isParityRoad/Roundabout/Object/Legacy contra parity, legado, e tipos não-relacionados; type narrowing TS |
| `serialization.test.ts` | 6 | round-trip JSON → parse → coerce preservando campos parity, road_engine_version "parity", inner_color opcional |

Todos passam:

| | Pré-H.1 | Pós-H.1 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 694 | **747** (+53) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

---

## 7. O que **NÃO** foi feito (escopo deliberado)

- ❌ Nenhum renderer Konva — H.2.
- ❌ Nenhum coercer de migração v0.3 → v0.4 — H.4.
- ❌ Nenhum adapter OSM_parity — H.5 (bloqueado até H.2 entregar protótipo visual aprovado, conforme regra do perito).
- ❌ Nenhuma ferramenta "Criar via" — H.6.
- ❌ Nenhum Inspector parity — H.6.
- ❌ Nenhum template parity — H.7.
- ❌ Nenhuma mudança no CanvasStage / RoadNetworkLayerV2 / road-v2 / road-v1 — tudo intocado.
- ❌ Nenhum botão na UI apontando para o motor parity.
- ❌ Nenhum lab spike modificado.

O app real **continua funcionando exatamente igual** — o motor parity está disponível como tipo, mas ninguém o usa ainda.

---

## 8. Como verificar manualmente

```bash
# 1. Compilar tipos.
pnpm typecheck

# 2. Rodar testes parity.
pnpm vitest run src/modules/croqui/engine/road-parity

# 3. Build full.
pnpm build

# 4. App continua funcionando (sem renderer parity ativo ainda).
pnpm tauri dev
```

Para confirmar que o motor parity NÃO afeta o app:
1. Abra qualquer croqui existente — abre normalmente, renderiza com v1/v2 conforme antes.
2. Crie um croqui novo — usa v1 default, normal.
3. Importe OSM — usa road-v2 atual (G.3 rollback), não toca em parity.

---

## 9. Riscos identificados durante H.1

Nenhum risco crítico. Apenas observações:

1. **`parity_objects` é um campo opcional novo em `SicroCroquiDoc`.** Documentos antigos abrem sem ele (undefined). O coercer já trata. Sem efeito em produção.
2. **`coerceCroquiDoc` faz passthrough sem validar shape interno** de `parity_objects`. Em H.4 introduzimos `coerceParityRoad` + `coerceParityRoundabout` para validação. Por enquanto, se o usuário corromper o JSON manualmente, o objeto vai para o renderer (que vai crashar ou ignorar). Aceitável para fase de tipos.
3. **`kind: "road_parity"` é uma string nova no schema.** Bibliotecas externas (se houver) que esperam `kind: "road" | "roundabout" | ...` podem precisar atualizar. Não há bibliotecas externas no projeto — risco zero.

---

## 10. Resumo executivo da H.1

✅ **Tipos** `SicroRoadObject_parity` (20 campos) + `SicroRoundaboutObject_parity` (13 campos) entregues em `road-parity/types.ts`.
✅ **Factories** com defaults, clamps e validação.
✅ **Type guards** com narrowing TypeScript correto.
✅ **Schema v0.4 prep**: `RoadEngineVersion` aceita `"parity"`, `SicroCroquiDoc.parity_objects` opcional, coercer faz passthrough.
✅ **53 testes novos**, todos passam.
✅ **App real intocado** — v1, v2, croquis existentes, OSM import — tudo funciona como antes.
✅ **Pronto para H.2** — renderer Konva parity que consome esses tipos.

**Aguardando validação antes de prosseguir para H.2.**

Pontos para você confirmar:
1. Decisão de `parity_objects` separado de `objects` está OK?
2. Kinds distintos `"road_parity"` e `"roundabout_parity"` está OK (mesmo que internamente)?
3. Constantes domínio (limites min/max de largura, raio) estão razoáveis?
4. `inner_color` opcional (default `#3A6535` no renderer) está OK como ajuste da spec?

Se tudo OK, sigo para H.2 — renderer Konva multipass simples que renderiza as fixtures básicas (via reta + curva + rotatória + cruzamento) e exporta PNG. **Apenas isso até validação visual.**
