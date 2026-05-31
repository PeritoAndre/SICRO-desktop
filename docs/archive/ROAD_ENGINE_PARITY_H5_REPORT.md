# Road Engine Parity — H.5 Report

**Fase:** H.5 — OSM Adapter Parity
**Data:** 2026-05-26
**Estado:** Implementado, aguardando validação visual no app real.
**Restrições mantidas:** sem commit, sem merge, sem tag. Road v1 e v2 intactos. Sem mexer em Laudo / Drone / Evidências.

---

## 1. Resumo executivo

H.5 implementa o **OSM Adapter Parity** — pipeline OpenStreetMap → Python Parity Engine. Importações OSM agora podem gerar diretamente `SicroRoadObject_parity` + `SicroRoundaboutObject_parity` no array `parity_objects`, sem passar pelo Road v2.

Não removemos o adapter Road v2 — ele continua sendo o default quando `road_engine_version !== "parity"`. O modal OSM agora aceita um prop `engine` que decide qual adapter chamar; o `CroquiEditor` passa `"parity"` quando o documento atual está em modo parity.

Status das validações:

| Validação           | Status                                              |
| ------------------- | --------------------------------------------------- |
| `pnpm typecheck`    | ✅                                                  |
| `pnpm test`         | ✅ 812 passed (35 novos do osmAdapter parity)       |
| `pnpm build`        | ✅                                                  |
| `cargo check`       | ✅                                                  |
| `cargo test`        | ✅ 101 passed                                       |
| Validação visual    | ⏳ Aguardando perito reproduzir caso de Macapá      |

---

## 2. Princípio

> **OSM é só fonte de geometria.**

```
OpenStreetMap / Overpass
  → nodes/ways/tags
  → projeção métrica local (cos-corrected longitude)
  → classificação por highway (largura_m + marcacao)
  → fit uniforme ao canvas (px/m)
  → Hermite/Bezier 4 pontos
  → SicroRoadObject_parity (mundo, metros)
  → SicroRoundaboutObject_parity (mundo, metros)
  → RoadParityRenderer (mesmo motor aprovado em H.3)
```

Nada do Road v2 entra nesse caminho. Sem flares, sem junction patches, sem smoothing modes, sem lane_count, sem width em pixels.

---

## 3. Arquivos criados

### 3.1. `src/modules/croqui/engine/road-parity/osmAdapter.ts` (novo)

- **~570 linhas** de pipeline puro (sem React, sem Konva, sem fetch).
- API pública (exportada via `road-parity/index.ts`):
  - `convertOsmDatasetToParityObjects(input)` — adapter principal.
  - `projectLatLonToLocalMeters(lat, lon, centerLat, centerLon)` — projeção.
  - `polylineToParityBezier(pts)` — Hermite → Bezier 4-point.
  - `isOsmRoundaboutForParity(way, points)` — detecção de rotatória.
  - `parityRoadWidthMetersByHighway(highway)` — tabela `_LARG_CLASSE`.
  - `parityRoadMarkingByHighway(highway, isOneWay)` — `_marcacao`.
  - `isNonVehicleHighway(highway)` — filtro footway/path/etc.
- Tipos exportados: `OsmParityImportInput`, `OsmParityImportOptions`,
  `OsmParityImportStats`, `OsmParityAdapterResult`, `ParityBezierFit`.

### 3.2. `src/modules/croqui/engine/road-parity/__tests__/osmAdapter.test.ts` (novo)

- **35 testes** cobrindo:
  - largura por classe (primary 10.5, secondary 8.5, tertiary 7.5, residential 6.0, service 4.5);
  - marcação por classe (amarela em arteriais, branca em residenciais);
  - oneway (mao_dupla=false, marcacao=nenhuma, largura/2);
  - footway/path/cycleway ignorados;
  - polyline → Bezier preserva endpoints e tangentes;
  - detecção de rotatória via tag e geometria;
  - metadata_json preserva source, osm_id, raw_tags;
  - coords em mundo (metros), não pixels;
  - stats + warnings de ways ignoradas.

### 3.3. `ROAD_ENGINE_PARITY_H5_REPORT.md` (este arquivo)

---

## 4. Arquivos alterados

### 4.1. `src/modules/croqui/engine/road-parity/index.ts`

Adicionado `export * from "./osmAdapter"`.

### 4.2. `src/modules/croqui/editor/OsmImportModal.tsx`

- Import do `convertOsmDatasetToParityObjects` + tipos parity.
- `OsmImportResult` estendido com:
  - `parity_roads: SicroRoadObject_parity[]`
  - `parity_roundabouts: SicroRoundaboutObject_parity[]`
  - `engine: "v2" | "parity"`
- `OsmImportModalProps` ganhou prop `engine?: "v2" | "parity"` (default `"v2"`).
- `handleConfirm` ramifica:
  - `engine === "parity"` → chama `convertOsmDatasetToParityObjects` e devolve em `parity_roads`/`parity_roundabouts`, deixando `roads`/`roundabouts` vazios.
  - caso contrário → mantém o caminho legado com `convertOsmDatasetToSicroObjects`.
- Footer informativo do modal mostra "Importação OSM — Python Parity Engine" (com chip roxo) quando `engine === "parity"`.

### 4.3. `src/modules/croqui/editor/CroquiEditor.tsx`

- `handleOsmImportConfirm` ganhou branch parity:
  - Diagnóstico parity log (id, largura_m, mao_dupla, marcacao, etc.).
  - Remove `parity_objects` OSM antigos (`metadata_json.source === "osm"`), preservando objetos parity criados manualmente.
  - Faz patch imutável de `parity_objects` + define `road_engine_version: "parity"` + garante `scale.px_per_m` (usa a sugestão do fit se não houver).
  - Não toca em `objects` (legados v1/v2 ficam intactos).
- `<OsmImportModal>` agora passa `engine={doc.road_engine_version === "parity" ? "parity" : "v2"}`.

---

## 5. Tabelas de paridade

### 5.1. Largura por classe (`_LARG_CLASSE`)

| highway OSM                        | largura_m |
| ---------------------------------- | --------- |
| motorway, trunk, primary           | 10.5      |
| primary_link, motorway_link, etc.  | 10.5      |
| secondary, secondary_link          | 8.5       |
| tertiary, tertiary_link            | 7.5       |
| residential, unclassified          | 6.0       |
| living_street                      | 6.0       |
| service, parking_aisle             | 4.5       |
| (fallback / desconhecido)          | 6.5       |
| footway, path, pedestrian, etc.    | **ignorado** |

Vias `oneway=yes` recebem `largura_m / 2` (paridade SICRO 1.0 — em divided carriageway cada way representa um lado).

### 5.2. Marcação por classe

| highway OSM                        | mão dupla   | oneway     |
| ---------------------------------- | ----------- | ---------- |
| primary, trunk, secondary, tertiary| **amarela** | nenhuma    |
| residential, unclassified, service | **branca**  | nenhuma    |
| living_street                      | branca      | nenhuma    |

Oneway sempre = `nenhuma` (eixo central não faz sentido em mão única).

### 5.3. Rotatória (`junction=roundabout`)

| Campo            | Valor                                                       |
| ---------------- | ----------------------------------------------------------- |
| `kind`           | `roundabout_parity`                                         |
| `cx`, `cy`       | centroide do ring (metros)                                  |
| `r_m`            | média das distâncias do centroide aos nodes                 |
| `largura_m`      | `clamp(meanR × 0.4, 4, 9)` — paridade Python                |
| `superficie`     | `"asfalto"`                                                 |
| `inner_color`    | **omitido** → renderer aplica `#3A6535` (verde canteiro)    |

Detecção: `junction=roundabout` OU ring fechado circular (stdDev/meanR < 30%).

---

## 6. Geometria — Hermite → Bezier 4-point

Cada polyline OSM (após Douglas-Peucker leve, tol 0.6 m) é reduzida a 4 pontos Bezier cúbico via tangentes Hermite (paridade `_pontos_para_spline` Python):

```
start = pts[0]
end   = pts[N-1]
tangente_inicial = direção do primeiro segmento (normalizada)
tangente_final   = direção do último segmento (normalizada)
arc = soma dos comprimentos dos segmentos
c1 = start + tangente_inicial × (arc / 3)
c2 = end   − tangente_final   × (arc / 3)
```

Equivalente ao Bezier "natural" — trechos retos viram retas, curvas suaves preservam direção. Não tenta clipar por raio (causa direta da regressão G.3); o fit uniforme centraliza o conjunto no canvas.

---

## 7. Fluxo no modal OSM

1. Perito clica "Importar OSM" no Toolbar.
2. `OsmImportModal` abre (mantém comportamento Round 4 — Leaflet sob demanda, busca Overpass sob demanda).
3. Perito escolhe coordenadas + raio + clica "Buscar vias".
4. Perito seleciona ways no painel direito + clica "Importar selecionadas".
5. Modal:
   - se `engine === "parity"` (passado pelo CroquiEditor quando o doc está em parity), chama `convertOsmDatasetToParityObjects`;
   - se não, chama `convertOsmDatasetToSicroObjects` (legado v2).
6. CroquiEditor:
   - remove parity_objects (ou objects) OSM antigos;
   - insere novos;
   - define `road_engine_version: "parity"` (ou `"v2"`);
   - mostra resumo no feedback.
7. Renderer (`RoadParityRenderer`) desenha automaticamente porque `road_engine_version === "parity"` e `parity_objects` populado.

---

## 8. Restrições verbatim respeitadas

- ✅ NÃO gerar SicroRoadObject (Road v2) — adapter parity só produz `*_parity`.
- ✅ NÃO usar RoadNetworkLayerV2 — renderer é `RoadParityRenderer` (de H.3).
- ✅ NÃO usar flares — não há código de flare no novo adapter.
- ✅ NÃO usar junction patches — geometria parity não tem essa primitiva.
- ✅ NÃO usar smoothing modes — Bezier 4-point fica fechado dentro do objeto.
- ✅ NÃO usar lane_count — `SicroRoadObject_parity` não tem esse campo.
- ✅ NÃO usar width em pixels — `largura_m` é em metros, renderer aplica px/m.
- ✅ NÃO mexer no Road v2 adapter — `osmAdapter.ts` legado intacto.
- ✅ NÃO remover Road v1/v2 — coexistem.
- ✅ NÃO mexer em Laudo / Drone / Evidências.
- ✅ NÃO fazer commit / merge / tag.

---

## 9. Limitações conhecidas (a documentar para validação)

1. **OSM divided carriageway** (avenida representada como dois ways oneway paralelos): cada way vira uma via parity com `largura/2`. Sem canteiro central explícito — depende do mapeamento OSM.

2. **Rotatórias não-circulares**: se o ring tiver desvio > 30%, cai em via regular (com warning).

3. **Vias muito longas que saem do raio**: NÃO são clipadas. O endpoint distante fica na coord projetada — pode aparecer fora da área visual do canvas até o perito mover/ajustar. (Decisão: clip causa fragmentação, conforme regressão G.3.)

4. **Sem detecção de junction X/T/Y**: o renderer parity já lida com cruzamentos via clipping multipass; sem adicionar primitivas de junction patch.

5. **Sem ferramenta manual "Criar via parity"** (interativa, 2-clicks). Inserção parity hoje é via demo button (H.3) + import OSM (H.5). Ferramenta interativa entra em H.6.

---

## 10. Caso de teste principal — Macapá

Para validar visualmente:

1. **Coordenadas**: cole no campo `Coordenadas` do modal:
   - rotatória Manoel Torrinha (centro): `-0.0345, -51.0694` (ajustar conforme ponto real do perito).
2. **Raio**: 25 m (preset).
3. **Antes de buscar**: ativar Road Parity no StatusBar (botão "Road" cicla v1→v2→parity).
4. **Resultado esperado**:
   - 1 rotatória detectada (`junction=roundabout`);
   - 4 vias arteriais entrando (Av. Manoel Torrinha, R. Renascimento, R. Principal, R. Socialismo);
   - largura proporcional à classe (tertiary 7.5 m visível, residential 6.0 m menor);
   - rotatória parecida com a do demo H.3;
   - asfalto cinza escuro (#1C1C1C), calçada cinza-amarelado (#7C7460), eixo amarelo tracejado em arteriais.

Se o resultado ficar pior que o demo parity, NÃO aprovar — H.5 está reprovada e precisa de ajuste.

---

## 11. Testes — 35 cobrindo o adapter

### 11.1. Tabelas (`parityRoadWidthMetersByHighway`, `parityRoadMarkingByHighway`)
- 7 testes para largura por classe.
- 3 testes para marcação (oneway, arteriais, residenciais).

### 11.2. Filtros (`isNonVehicleHighway`)
- 3 testes (skip de footway/path/etc, aceita veicular, undefined = skip).

### 11.3. Projeção (`projectLatLonToLocalMeters`)
- 3 testes (centro → 0,0; longitude positiva → x positivo; latitude positiva → y negativo).

### 11.4. Bezier (`polylineToParityBezier`)
- 4 testes (reta, 1 ponto, degenerada, L preserva tangentes).

### 11.5. Detecção rotatória (`isOsmRoundaboutForParity`)
- 3 testes (tag, geometria circular, polilinha aberta).

### 11.6. Adapter principal — way → road_parity
- 6 testes (primary→10.5/amarela, residential→6.0/branca, oneway→/2/nenhuma, label, footway ignorado, metadata).

### 11.7. Adapter principal — roundabout → roundabout_parity
- 2 testes (junção via tag, metadata).

### 11.8. Fit uniforme
- 2 testes (px_per_m > 0, coords em metros).

### 11.9. Stats
- 2 testes (dataset vazio, warnings populados).

Total geral road-parity após H.5: **118 testes** (vs 83 em H.3).

---

## 12. Próximos passos

1. **Validação visual H.5** — perito reproduzir caso de Macapá:
   - ✅ Road Parity aparece nas vias importadas?
   - ✅ Rotatória detectada?
   - ✅ Larguras proporcionais por classe?
   - ✅ Cores Sicro 1.0 (asfalto escuro, eixo amarelo, calçada bege)?
   - ✅ Resultado próximo do demo parity de H.3?
2. Após aprovação H.5:
   - **H.4** — Migração schema v0.3 → v0.4 (legados → parity quando perito aceitar).
   - **H.6** — Ferramentas interativas "Criar via" / "Criar rotatória" parity.
   - **H.7** — Templates parity (curva L, X, T, Y).
   - **H.8** — Validação final + remoção do Road v1, deprecate Road v2.

---

## 13. Resumo dos comandos rodados

```bash
pnpm typecheck    # ✅ sem erros
pnpm test         # ✅ 812 passed (35 novos do osmAdapter parity)
pnpm build        # ✅ build limpo, 1 warning de chunk size (esperado)
cargo check       # ✅ verde
cargo test        # ✅ 101 passed
```

**Sem commit, sem merge, sem tag.** Aguardando validação visual do perito antes de qualquer próximo passo.
