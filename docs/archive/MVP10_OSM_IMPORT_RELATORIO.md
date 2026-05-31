# MVP 10 — Importação OSM para Croqui / Seleção de Local do Sinistro

**Branch:** `mvp/osm-road-import`
**Data:** 2026-05-25 → **2026-05-26** (Fase G — Reimplementação sobre Road Engine 2.0)
**Status:** ⏳ Reimplementado sobre Road Engine 2.0 (Fase G) — sem commit/merge/tag (aguardando validação visual)

---

## 1. Status

MVP 10 plugga o scaffold OSM do MVP 9 numa UI completa: o perito agora
abre o mapa de OpenStreetMap dentro do SICRO, localiza o sinistro
(coordenadas digitadas, clique no mapa, ou coords vindas do Dossiê),
escolhe um raio (25/50/100/200 m ou custom), e o SICRO consulta o
endpoint Overpass público para trazer as vias da região. Cada via
selecionada vira um `SicroRoadObject` no croqui — editável,
arrastável, redimensionável, exportável como qualquer via criada à mão.

O escopo é **base viária**, não georreferenciamento pericial. A escala
sugerida é informada mas nunca aplicada automaticamente; o perito
calibra com lona de 2 m ou similar antes de usar para medições.

---

## 2. Decisões técnicas

| Tópico | Decisão |
|---|---|
| Provedor de mapa | **OpenStreetMap** via tiles públicos (`tile.openstreetmap.org`). Sem Google Maps, sem API paga. |
| Biblioteca de mapa | **react-leaflet 4.2.1** + **leaflet 1.9.4**. v4 é a última que suporta React 18; v5 exige React 19. |
| Fonte de vias | **Overpass API** (`overpass-api.de/api/interpreter`). Query `way[highway](bbox)`. |
| Coords / projeção | Aproximação esférica + projeção linear `lon/lat → canvas` (já existia no scaffold MVP 9). Aceita sub-1% de erro em buffers de até 1 km. |
| HTTP | `globalThis.fetch` com `AbortController(15s)`. Sem `tauri-plugin-http` — não é necessário com CSP `null`. |
| Cache | In-memory `Map<bboxKey, OsmDataset>`. Cache em disco fica para um spike futuro. |
| Tauri CSP | Continua `null` (sem CSP). Permite tiles e Overpass sem ajuste extra. |

---

## 3. Dependências adicionadas

```diff
+ "leaflet": "^1.9.4",
+ "react-leaflet": "^4.2.1",
+ "@types/leaflet": "^1.9.21"  (devDependency)
```

CSS do Leaflet importado uma única vez em `src/main.tsx`. Nenhuma
dependência Rust adicional — MVP 10 é puramente frontend + rede.

---

## 4. Fluxo do usuário

```
1. Toolbar do Croqui → seção Imagem → "Importar OSM…"
2. Modal abre com 3 áreas: inputs (esquerda) · mapa (centro) · vias (direita)
3. Usuário define o ponto do sinistro por:
   a) colar coordenada "lat, lon" (várias formas aceitas)
   b) clicar no mapa
   c) "Do Dossiê" — usa coords da ocorrência ativa, se houver
4. Escolhe raio (25/50/100/200 m ou custom)
5. "Buscar vias" → Overpass devolve nodes+ways → mapa desenha
   polylines e a lista mostra cada via com checkbox
6. "Importar selecionadas" → vias viram RoadObjects no canvas,
   centralizadas, com label = name; escala sugerida é exibida no
   feedback mas NÃO aplicada (perito confirma via "Definir escala")
7. Salvar + exportar PNG técnico/limpo + abrir no Laudo seguem
   funcionando como sempre
```

---

## 5. Arquivos novos / modificados

**Novos**

- `src/modules/croqui/engine/coordinates.ts` — parse de coords + bbox
  + scale estimation (puro, sem rede).
- `src/modules/croqui/engine/coordinates.test.ts` — 17 testes.
- `src/modules/croqui/editor/OsmImportModal.tsx` — assistente OSM
  (Leaflet + react-leaflet + lista + Overpass).
- `MVP10_OSM_IMPORT_RELATORIO.md` — este documento.

**Modificados**

- `src/modules/croqui/engine/osm.ts`:
  - `fetchOverpassBBox` deixa de ser stub e ganha implementação
    real (POST Overpass QL + `AbortController` + cache).
  - Novo helper `buildOverpassQuery(bbox)`.
  - Novo helper `parseOverpassPayload(raw)`.
  - `osmWayToRoad` agora preserva `name` (label), `oneway`
    (direction), `lanes`, `maxspeed`, `surface` e o tag bag
    completo em `metadata_json`.
  - Novo helper `osmOnewayToDirection(tags)`.
  - Cache em memória + `clearOverpassCache()`.
- `src/modules/croqui/engine/osm.test.ts` — +14 testes
  (buildOverpassQuery, parseOverpassPayload, fetchOverpassBBox com
  fetch mockado: sucesso/cache/ignore_cache/429/5xx/network/abort/
  non-JSON; oneway/ref-label/maxspeed conversor).
- `src/modules/croqui/engine/schema.ts` — adiciona
  `SicroOsmImportSession` + `SicroCroquiDoc.osm_imports?` (aditivo,
  opcional).
- `src/modules/croqui/engine/serializer.ts` — coercer ignora docs
  sem `osm_imports`, valida entries (lat/lon/radius obrigatórios)
  para os que vierem.
- `src/modules/croqui/engine/index.ts` — re-exporta `coordinates`.
- `src/modules/croqui/editor/Toolbar.tsx` — botão "Importar OSM…".
- `src/modules/croqui/editor/CroquiEditor.tsx` — `showOsmImport`
  state + `handleOsmImportConfirm` que appende RoadObjects, registra
  `osm_imports`, seleciona o primeiro road e dispara feedback com a
  escala sugerida.
- `src/main.tsx` — `import "leaflet/dist/leaflet.css";`
- `package.json` — Leaflet + react-leaflet.

---

## 6. Estratégia Overpass

### 6.1 Query

```overpass
[out:json][timeout:25];
(way[highway](min_lat,min_lon,max_lat,max_lon););
(._;>;);
out body;
```

- `[out:json]` — devolve JSON puro (mais fácil de parsear que XML).
- `[timeout:25]` — o servidor tem ceiling próprio; combinamos com
  nosso `AbortController(15s)` no cliente.
- `way[highway](bbox)` — apenas vias dentro do bbox. Edifícios,
  hidrantes, lotes etc. **não** entram nesta query — escopo MVP.
- `(._;>;)` — materialisa os `nodes` referenciados (precisamos das
  coordenadas).
- `out body;` — retorna corpo completo (tags + geometry).

### 6.2 Tratamento de erros

| Cenário | Tradução para o usuário |
|---|---|
| `AbortError` (timeout) | "O servidor OSM/Overpass não respondeu dentro do tempo limite. Tente novamente ou reduza o raio." |
| `fetch` exception | "Falha ao acessar o OSM/Overpass. Verifique a conexão de rede." |
| HTTP 429 | "Limitando as requisições (429). Tente novamente em alguns minutos." |
| HTTP 5xx | "Servidor OSM/Overpass indisponível (HTTP <status>). Tente mais tarde." |
| HTTP 4xx (não-429) | "O servidor OSM/Overpass recusou a consulta (HTTP <status>)." |
| Body não-JSON | "Resposta do OSM/Overpass não está em JSON válido." |
| `elements` ausente | "Resposta sem campo `elements`." |
| `elements` vazio | Phase = `empty`; modal mostra "Nenhuma via encontrada". |

Nenhum cenário trava a UI — o modal volta para o estado idle e o
botão "Buscar vias" fica novamente clicável.

### 6.3 Cache em memória

`Map<string, OsmDataset>` com chave = `"min_lat,min_lon,max_lat,max_lon"`
arredondado a 6 casas decimais (≈ 11 cm — qualquer movimento real do
ponto invalida o cache). Hit → retorna `from_cache: true` instantâneo,
sem rede.

Botão "Recarregar (sem cache)" no modal força nova consulta via
`clearOverpassCache()` + refetch.

---

## 7. Parse de coordenadas

`parseCoordinates(input)` aceita:

| Entrada | Resultado |
|---|---|
| `-0.0345, -51.0694` | OK (formato canônico) |
| `-0.0345 -51.0694` | OK (espaço único) |
| `0,0345 51,0694` | OK (vírgula decimal BR) |
| `0.0345 S 51.0694 W` | OK (hemisfério) |
| `(lat: -0.0345, lon: -51.0694)` | OK (parens + labels) |
| `(empty)` | `error: "empty"` |
| `-0.0345` | `error: "missing_separator"` |
| `95, 50` | `error: "lat_out_of_range"` |
| `0, 200` | `error: "lon_out_of_range"` |

Cada erro tem uma mensagem em português (`coordinateParseErrorMessage`)
exibida abaixo do input quando a validação falha.

`formatCoordinates({lat, lon})` produz o formato canônico (6 decimais)
e faz round-trip com `parseCoordinates`.

---

## 8. Conversão OSM → RoadObject

```ts
osmWayToRoad(way, nodes, viewport) → SicroRoadObject | null
```

Regras (todas testadas):

| Tag OSM | Mapeamento | Default |
|---|---|---|
| `highway=motorway,trunk,primary,*_link` | `road_style: "highway"` | — |
| `highway=secondary,*` | `road_style: "avenue"` | — |
| `highway=tertiary,residential,living_street,unclassified` | `road_style: "urban"` | — |
| `highway=service,parking_aisle` | `road_style: "parking"` | — |
| `highway=track,path,footway,cycleway` | `road_style: "dirt"` | — |
| desconhecido | `road_style: "urban"` | conservador |
| `oneway=yes/true/1/-1` | `direction: "one_way"` | — |
| `oneway=no/false/0` | `direction: "two_way"` | — |
| `oneway=*` outros | `direction: "unknown"` | — |
| `oneway` ausente | `direction: "two_way"` | seguro |
| `lanes=N` (positivo) | `lane_count: N` | preset |
| `name` | `label` | null → fallback `ref` → null |
| `name`/`ref` ausentes | `label: null` | layer panel mostra default |

Tudo isso, mais o tag bag completo (`raw_tags`), `osm_id` e
`source: "osm"` vão para `metadata_json` como JSON serializado —
qualquer auditoria futura consegue reconstruir o que veio do OSM.

---

## 9. Escala estimada

```
suggested_px_per_m = canvas_width_px / (bbox_lon_span_deg × cos(lat) × R × π/180)
```

Onde `R = 6 371 000 m`. Para um bbox típico (raio 100 m em
Macapá-like, canvas 800 px), retorna ≈ 2–4 px/m.

**Importante:** este valor é apenas informado no feedback do
CroquiEditor (`Escala sugerida: X.XX px/m … (não aplicada — confirme
em "Definir escala")`). O `doc.scale` continua intocado. O perito
calibra explicitamente com a ferramenta existente — mantém o princípio
"OSM é base, não conclusão pericial".

---

## 10. Persistência

`SicroCroquiDoc.osm_imports?: SicroOsmImportSession[]` (aditivo):

```ts
interface SicroOsmImportSession {
  imported_at: string;      // ISO timestamp
  source: string;           // "osm:overpass" hoje
  center_lat: number;
  center_lon: number;
  radius_m: number;
  query_bbox: { min_lat; max_lat; min_lon; max_lon };
  selected_way_ids: number[];
  suggested_px_per_m?: number | null;
}
```

Cada confirmação do modal adiciona uma entrada. Docs antigos sem o
campo carregam intactos (coercer ignora). Entries malformados
(`center_lat` faltando, etc.) são silenciosamente descartados pelo
coercer — defensivo contra docs corrompidos.

`SicroRoadObject.metadata_json` carrega os campos OSM individuais
**por via** (`osm_id`, `name`, `highway`, `oneway`, `lanes`,
`maxspeed`, `surface`, `raw_tags`). Mesmo se `osm_imports` for
removido manualmente, cada via sabe sua origem.

---

## 11. Privacidade

A única coisa que sai da workstation para a internet pública na
operação do modal é:

1. **Tiles OSM** — requisição GET para `tile.openstreetmap.org` por
   tile visível no mapa. Conteúdo: zoom + x + y. Não há identificação
   de usuário.
2. **Overpass query** — POST para `overpass-api.de` com o bbox
   geográfico no corpo. Nada mais. Sem header de identificação, sem
   cookies, sem BO, sem ocorrência, sem fotos.

Documentado no próprio modal:
> "Privacidade: a consulta ao OSM envia apenas o retângulo geográfico
> — nenhum dado pericial sai do SICRO."

Para deploys com requisito de privacidade reforçado, o `endpoint` da
função `fetchOverpassBBox` é configurável via `OsmFetchOptions.endpoint`
— bastará trocar para um Overpass institucional/local em um futuro
spike.

---

## 12. Resultados das validações

| Verificação | Antes | Depois |
|---|---|---|
| `pnpm typecheck` | ✅ | ✅ |
| `pnpm vitest run` | 218 testes | **249 testes** (+31) |
| `pnpm build` | 391 KB gzip | 446 KB gzip (+55 KB pelo Leaflet) |
| `cargo check` | ✅ | ✅ |
| `cargo test --lib` | 88 testes | 88 testes (sem mudanças Rust) |

Os 31 novos vitest:
- 17× `coordinates.test.ts` (parseCoordinates 9, formatCoordinates 1, bboxFromCenterRadius 4, estimatePxPerMeter 2, error messages 1).
- 9× Overpass real (buildQuery, parsePayload null/missing-elements/garbage, fetch POST, cache hit, ignore_cache, 429, 5xx, network-throw, abort, non-JSON).
- 3× converter extension (oneway → direction, ref fallback, maxspeed/surface preservation).
- 2× metadata extra (label = name, source marker).

---

## 13. Compatibilidade

- **Schema `.sicrocroqui`** continua em v0.3 (todas as adições são
  aditivas + opcionais).
- **Croquis antigos** abrem sem mudança — sem `osm_imports`, sem road
  com `subtype: "osm_way"`, tudo funciona.
- **Road Engine Pro** (MVP 9) intacto — RoadObjects importados do OSM
  usam o mesmo renderer, junction polygons funcionam quando duas vias
  OSM se cruzam, clipping de marcações aplica normalmente.
- **Importar Drone** (MVP 9 R4) intacto — os dois fluxos coexistem;
  o perito pode importar OSM + sobrepor drone background como
  referência espacial.
- **Outros módulos** (Laudo, Evidências, Dossiê, Vídeo, Imagem, Home,
  Importador, scaffold OSM, lens_correction Rust) não foram tocados.

---

## 14. Limitações documentadas

1. **MVP depende de rede.** Sem internet → "Falha ao acessar". Cache
   em memória só cobre a sessão atual.
2. **Sem georreferenciamento pericial.** A projeção lat/lon → canvas é
   linear (mercator-ish). Para áreas até ~2 km² o erro é < 1%; para
   áreas maiores não é apropriado.
3. **Sem ortorretificação.** Vias OSM são curva-suave do dado bruto;
   não há ajuste perspectivo com pontos de controle.
4. **Sem roteamento.** Só geometria; nada de "qual o caminho de A a B".
5. **Sem suporte a `.osm`/`.pbf` offline.** Toda consulta vai pela
   rede. Cache local em disco é spike futuro.
6. **Sem servidor institucional.** Endpoint é o público da Overpass.
   `OsmFetchOptions.endpoint` permite trocar — feature para deploy.
7. **Buildings, hidrantes, lotes etc. fora do escopo.** Query é
   `way[highway]` apenas.
8. **Conclusão pericial não automática.** O fluxo é "abrir → escolher →
   importar → revisar → confirmar". Em nenhum momento o SICRO assume
   que o resultado do OSM é correto sem revisão humana.
9. **Cache cleared on reload.** Recarregar a janela perde o cache.
10. **Default crop / map zoom estão em Macapá** (lat -0.0345, lon
    -51.0694) quando não há dossie coords. Ajustar via UI ou inserir
    fallback configurável é uma melhoria futura.

---

## 15. Roteiro de validação manual (executar)

> Cumprir os 7 blocos antes de aprovar o fechamento.

**A — Coordenadas**
1. Abrir Croqui → "Importar OSM…".
2. Colar `-0.0345, -51.0694` (Macapá) → marcador aparece.
3. Apagar e digitar `0.0345 S 51.0694 W` → mesma coordenada.
4. Digitar `lixo invalido` → mensagem de erro embaixo do input.
5. Clicar em outro lugar no mapa → coords se atualizam.
6. Se a ocorrência ativa tiver lat/lon, clicar "Do Dossiê" → mapa
   pula para essa coord.

**B — Busca**
1. Selecionar raio 50 m → "Buscar vias" → lista preenche em ≤ 5 s.
2. Trocar para 100 m → "Buscar vias" → mais vias.
3. Trocar para 200 m → "Buscar vias" → ainda mais.
4. Marcar/desmarcar vias na lista — polyline no mapa muda
   cor/espessura.
5. "Recarregar (sem cache)" — refaz a consulta (vê requisição
   nova na aba Network do devtools, se aberta).

**C — Importação**
1. Selecionar 3-5 vias.
2. "Importar selecionadas (N)" → modal fecha; vias aparecem no
   canvas como RoadObjects coloridos.
3. Confirma feedback: "Importadas N via(s) do OSM (centro lat,
   lon · raio Rm). Escala sugerida: X.XX px/m (não aplicada)".
4. Clica em uma via → handles do Road Engine aparecem (8 anchors).
5. Arrasta, redimensiona, edita pontos de controle — funciona.
6. Salva croqui → reabre → vias preservadas.

**D — Escala**
1. Verifica que `doc.scale` permanece `null` (não foi
   automaticamente preenchido).
2. Usa "Definir escala" com dois cliques na imagem ou em
   referencial conhecido para calibrar manualmente.
3. Insere uma medida — agora tem unidade.

**E — Exportação**
1. PNG técnico → fundo de via do OSM aparece no PNG.
2. PNG limpo → idem, sem carimbo.
3. "Abrir Laudo" → `ensureCroquiExportFresh` reexporta antes de
   navegar → painel de evidências do Laudo mostra croqui novo.
4. Exporta PDF do Laudo → PDF traz o croqui com as vias OSM.

**F — Robustez**
1. Desligar internet → "Buscar vias" → mensagem "Falha ao
   acessar" — app não trava.
2. Coordenada `0, 0` → busca em meio do Atlântico → lista vazia
   com "Nenhuma via encontrada" — app não trava.
3. Coordenada `95, 0` → erro "Latitude fora do intervalo" → não
   chama a rede.

**G — Módulos**
1. Dossiê / Vídeo / Imagem / Laudo / Evidências / Home / Importador
   continuam abrindo e funcionando.
2. Central de Evidências → Integridade → não acusa erro novo.

---

## 16. Próximos passos sugeridos

1. **Cache em disco.** Persistir Overpass responses em
   `croquis/osm/cache/` (com sidecar). Permite re-imports offline.
2. **Endpoint configurável via UI.** Settings → "Overpass endpoint" →
   troca para um servidor institucional.
3. **Busca textual (Nominatim).** "Avenida FAB, Macapá" → coords.
   Privacidade requer atenção — Nominatim recebe o texto digitado.
4. **OSM offline (`.osm` / `.pbf`).** Parser local + tiles vector
   embarcados.
5. **Importar mais features.** Postes, semáforos, faixas de pedestre
   já mapeados no OSM → SicroMarkerObject (mobiliário urbano).
6. **Ortorretificação assistida.** Marcar pontos correspondentes no
   drone background + no mapa OSM → homografia → georreferenciamento
   visual aceitável.

---

**Reiterando a instrução do usuário:** este MVP **não cria commit**,
**não faz merge** e **não cria tag**. Aguardando validação manual
antes do fechamento.

---

## 17. Correções pós-validação — mapa OSM e qualidade visual

> **Status desta rodada:** entregue para nova validação visual.
> Sem commit/merge/tag.

### 17.1 Problemas reportados na primeira validação

1. **Mapa não aparecia no modal.** O usuário precisou importar
   apenas por coordenadas digitadas — clicar no mapa não funcionava
   porque o mapa estava em branco.
2. **Qualidade visual inferior ao SICRO 1.0.** Mesmo quando a
   importação por coordenada funcionou, a malha viária no Croqui
   ficou esticada, com vias desproporcionais, interseções quebradas,
   rotatórias estranhas e conexões com aparência feia.

### 17.2 Causa raiz — mapa não aparecia

`Leaflet` lê `clientHeight` do container no momento do mount. O
modal usa CSS grid (`grid-template-columns: 260px 1fr 280px`) com
`minHeight: 460` na linha mas **não** uma `height` explícita. Quando
o modal monta dentro de um `<div className={styles.dialog}>`, o
layout passa por várias etapas:

1. Modal mount → React commit → DOM nodes existem.
2. Browser layout → grid computa a linha (depende do conteúdo da
   coluna mais alta).
3. Leaflet lê `clientHeight` da `div` interna do MapContainer.

Na maioria das execuções, o passo 2 acontece **antes** de Leaflet
medir. Mas com nested CSS grid + flex + tela do Tauri, o passo 2
às vezes acontece **depois** — Leaflet lê 0 e fica preso a esse
zero.

### 17.3 Solução do mapa

Dois ajustes:

1. **`height: 460` explícito** no wrapper externo do MapContainer
   (não apenas `minHeight`). Leaflet agora sempre tem um número real.
2. **`MapInvalidator` component** mounted dentro do MapContainer:
   chama `map.invalidateSize()` num microtask + fallback `setTimeout(200)`.
   Cobre os casos em que o passo 2 (layout) demora mais que o passo
   3 (Leaflet measure).

Bônus: nova bandeira `tileerror`/`tileload` no `TileLayer` →
indicador "⚠ tiles indisponíveis — use coordenadas" no canto
superior direito do mapa quando a rede não consegue baixar tiles.

### 17.4 Causa raiz — qualidade visual

A primeira rodada projetava `lon/lat → canvas pixels` usando uma
bbox quadrada em metros mapeada num canvas retangular (1600×1000).
Resultado: o eixo horizontal usava ~ 4 px/m e o vertical ~ 2.5 px/m
→ vias horizontais "espremidas" e verticais "esticadas".

Além disso:
- as vias ficavam "à largura" do preset (urban=80 px, avenue=140 px)
  sem importar a escala real → vias gigantes quando o raio era
  pequeno, microscópicas quando grande;
- OSM trazia 20-30 pontos por quadra → linhas trêmulas;
- nós compartilhados entre ways tinham coordenadas projetadas
  *quase* iguais — sub-pixel mismatch → interseções "abertas";
- `junction=roundabout` era projetado como polyline reta de N
  segmentos → rotatória quebrada;

### 17.5 Soluções implementadas

| Tópico | Solução |
|---|---|
| Mapa não aparecia | `height` explícito + `MapInvalidator` (microtask + 200ms). |
| Projeção isotrópica | Novo `osmDatasetToRoadsFit(ways, nodes, centre, options)` projeta cada lon/lat para coordenadas métricas locais (centradas no perito), depois **fitOsmRoadsToCanvas**: bbox métrica + escala uniforme + offset → centro do canvas. Garante mesmo `px/m` nos dois eixos. |
| Largura por tipo | Novo `defaultWidthMeters(highway)` em **metros reais**: motorway 14 m, primary 10.5 m, secondary 8.5 m, tertiary 7 m, residential/unclassified 6.5 m, service 4.5 m, track 4 m, footway/cycleway 2 m. A escala atual da projeção converte para px. |
| Lanes override | Se `lanes=N` existir, override usa `N × 3.25 m` (largura de faixa brasileira). Caso contrário, fallback por highway. |
| Snap de nós | Após projeção, todas as coordenadas são arredondadas a 1 px (configurável via `snap_px`). Ways que compartilham um OSM `node_id` ficam com **endpoints exatamente iguais** → junction polygons do Road Engine Pro detectam corretamente. |
| Rotatória | Detecção de `junction=roundabout` em `makeOsmRoad`: força `spline_tension = 0.7`, `center_line: "none"` (não faz sentido ter eixo central numa rotatória), preserva o ring fechado. |
| Geometria suave | Douglas-Peucker com `epsilon = 0.5 m` (configurável via `simplify_m`). Remove pontos artificialmente clusterizados do OSM sem prejudicar curvas reais. |
| UI da lista | Lista de vias agora mostra "⊙" para roundabouts, "↓" para `oneway=yes`, "Nf" para lanes. Visual mais legível. |

### 17.6 Pipeline novo (`osmDatasetToRoadsFit`)

```
Overpass response (lon/lat) ──┐
                              ▼
                      project to local metric
                      x = (lon - c.lon) · cos(c.lat) · R · π/180
                      y = -(lat - c.lat) · R · π/180
                              │
                              ▼
                      simplifyPolylineDP (ε = 0.5 m)
                              │
                              ▼
                      bbox of all metric points
                              │
                              ▼
                      scale = min(usableW / bboxW, usableH / bboxH)
                      offset = canvas centre - bbox centre · scale
                              │
                              ▼
                      project metric → canvas pixels (uniforme)
                      snap to 1 px grid
                              │
                              ▼
                      makeOsmRoad(way, projected_points, scale)
                              │
                              ▼
                  SicroRoadObject[] (centrados, aspect-correct,
                  width em px proporcional ao real, junction tag
                  preservado, name como label, raw_tags em
                  metadata_json)
```

### 17.7 Arquivos modificados

- `src/modules/croqui/engine/osm.ts` — `osmDatasetToRoadsFit`,
  `simplifyPolylineDP`, `defaultWidthMeters`, `makeOsmRoad`
  (helper privado), `LANE_WIDTH_M` constant.
- `src/modules/croqui/editor/OsmImportModal.tsx` — `height` no
  wrapper, `MapInvalidator`, `tileError` state, eventHandlers
  no TileLayer, troca de `osmDatasetToRoads` por
  `osmDatasetToRoadsFit` no `handleConfirm`, indicador "⊙" na lista.
- `src/modules/croqui/engine/osm.test.ts` — +11 testes
  (simplifyPolylineDP 4, osmDatasetToRoadsFit 7).

### 17.8 Resultados das validações

| Verificação | Antes | Depois |
|---|---|---|
| `pnpm typecheck` | ✅ | ✅ |
| `pnpm vitest run` | 249 testes | **260 testes** (+11) |
| `pnpm build` | 446 KB gzip | 446 KB gzip (sem mudança) |
| `cargo check` | ✅ | ✅ |
| `cargo test --lib` | 88 testes | 88 testes (Rust intocado) |

### 17.9 Compatibilidade

- A função antiga `osmDatasetToRoads(ways, nodes, view)` continua
  exportada e seus testes (3 cenários) seguem verdes. Nenhum
  caller externo precisa mudar.
- Schema `.sicrocroqui` v0.3 inalterado (continua aditivo).
- Road Engine Pro intacto — vias do `osmDatasetToRoadsFit` são
  `SicroRoadObject` normais; o junction polygon + clipping de
  marcações funcionam exatamente como nas vias criadas à mão ou
  pelos templates.
- Importar Drone (MVP 9 R4) intacto.
- Outros módulos (Laudo / Evidências / Dossiê / Vídeo / Imagem /
  Home / Importador) intocados.

### 17.10 Limitações remanescentes

1. **Tiles ainda dependem de rede.** O indicador "⚠ tiles
   indisponíveis" guia o usuário para o fallback por coordenadas
   manuais. Cache local de tiles é spike futuro.
2. **Rotatórias com aproximação octogonal.** OSM frequentemente
   traz a rotatória como ring de 8-12 nós; a tensão alta do spline
   suaviza para um círculo plausível, mas não é geometria de
   círculo exato. Suficiente para croqui pericial.
3. **Sem ajuste pós-importação como grupo.** O usuário ajusta via
   por via. Spike futuro: agrupar via session id + transformer
   coletivo (move/scale/rotate o conjunto).
4. **Sem importação de mobiliário urbano.** OSM tem placas,
   semáforos, postes mapeados; ainda só importamos `way[highway]`.
   Próxima rodada se houver demanda.
5. **Sem suavização adaptativa por classe.** Toda via passa pela
   mesma simplificação (0.5 m). Esquinas urbanas retas e curvas
   suaves usam o mesmo `epsilon`. Pragmático para v1.
6. **Sem suporte a `name:pt`/internacionalização.** Só lê `name`
   bruto.

### 17.11 Roteiro de validação visual (executar)

> Executar os 7 blocos antes de aprovar o fechamento.

**A — Mapa visível**
1. Toolbar do Croqui → "Importar OSM…".
2. **Conferir:** o mapa aparece imediatamente com tiles do OSM
   carregados, mostrando uma área de Macapá (default).
3. Pan/zoom funcionam.
4. Clique no mapa → coordenada atualiza no input + marcador vermelho
   aparece + círculo de raio aparece.
5. (Opcional) Desligar internet por 5 s → indicador "⚠ tiles
   indisponíveis" aparece sobre o mapa; reconectar limpa o aviso.

**B — Coordenadas**
1. Colar `-0.0345, -51.0694` → mapa centraliza, marcador aparece.
2. Apagar e digitar `0.0345 S 51.0694 W` → mesmo lugar.
3. Coord inválida → mensagem clara abaixo do input.

**C — Importação no mesmo local da comparação**
1. Buscar com raio 100 m no centro da cidade.
2. Conferir lista — nomes de via, "⊙" em rotatórias, "↓" em
   one-ways.
3. Selecionar todas → "Importar selecionadas".
4. **Conferir no Croqui:**
   - vias proporcionais ao raio escolhido;
   - cruzamentos limpos (Road Engine Pro detecta junções);
   - rotatórias arredondadas, não octogonais quebradas;
   - largura de via primary > secondary > residential;
   - one-ways visíveis pela cor amarela do eixo;
   - tudo centrado no canvas com margem ~10 %.

**D — Qualidade comparativa**
1. Comparar lado-a-lado com a importação OSM do SICRO 1.0 do
   mesmo local.
2. **Esperado:** SICRO 2.0 igual ou melhor — particularmente nas
   conexões (junctions seamless) e nas rotatórias.

**E — Persistência**
1. Salvar (Ctrl+S).
2. Fechar Croqui, reabrir.
3. **Conferir:** vias OSM continuam lá, `osm_imports` no
   `.sicrocroqui` preservado, mover/redimensionar continua
   funcionando.

**F — Exportação**
1. PNG técnico → vias OSM aparecem.
2. PNG limpo → idem, sem carimbo.
3. Abrir Laudo → painel de evidências mostra croqui novo.
4. Exportar PDF → vias OSM na imagem.

**G — Robustez**
1. Buscar em (lat 0, lon 0) — meio do Atlântico → "Nenhuma via
   encontrada", sem travar.
2. Buscar em (95, 0) — coord inválida → erro claro, sem chamada
   de rede.
3. Desconectar a rede + buscar → erro claro, app não trava.

### 17.12 Próximos passos sugeridos

1. **Ajuste pós-importação como grupo** (mover/rotacionar/escalar
   todo o conjunto OSM como uma unidade).
2. **Cache de tiles em disco** para uso offline parcial.
3. **Importação de mobiliário urbano** (`way[highway:*]` ampliado
   ou query adicional para `node[traffic_signals]`,
   `node[barrier]`, etc.).
4. **Provider configurável** via UI (Overpass institucional /
   Carto / próprio servidor).
5. **Comparação visual lado-a-lado** com SICRO 1.0 num teste
   sistemático de regressão.

---

**Reiterando a instrução do usuário:** esta rodada **não cria
commit**, **não faz merge** e **não cria tag**. Aguardando nova
validação visual antes do fechamento do MVP 10.

---

## 18. Correção crítica — Mapa visível e unificação total com Road Engine Pro

> **Status desta rodada:** terceira tentativa pós-validação reprovada.
> Sem commit/merge/tag.

### 18.1 Auditoria que o usuário pediu

Antes de qualquer código, respondi as 10 perguntas obrigatórias:

| # | Pergunta | Achado |
|---|---|---|
| 1 | Onde a via manual é criada? | `CroquiEditor.handleFinishRoad` → `factories.ts:makeRoad(points, road_style)` |
| 2 | Qual factory? | `makeRoad` (linha 349 de `factories.ts`), usa `ROAD_STYLES[style]` preset |
| 3 | Quais campos deixam a via "bonita"? | `width`, `lane_count`, `markings`, `curb`, `surface`, `spline_tension`, `road_style` — **todos vêm do preset** |
| 4 | Onde o OSM cria? | `osm.ts:makeOsmRoad` (privado) → chama `makeRoad(...)` |
| 5 | Diferença entre os dois? | **OSM sobrescrevia `width`** com `defaultWidthMeters(highway) × px_per_m` ≈ 13 px (residential, raio 100 m, canvas 1600 px) versus os 80 px do preset urban → **6× mais fino**. Também sobrescrevia `spline_tension` para 0.4 (preset 0.5) |
| 6 | OSM usa `makeRoad`? | Sim ✅ |
| 7 | Sets coerentes? | **Não** — width e spline_tension sobrescritos |
| 8 | Escala/proporção? | Aspect-correct desde Round 2 ✓ |
| 9 | Renderer recebe iguais? | Mesma `SicroRoadObject` shape, mas com `width` 6× menor → CanvasStage desenha asfalto fino |
| 10 | **Por que visualmente diferentes?** | **Porque o OSM passava `width: 13` e o manual passa `width: 80`. Mesma factory, mesmo renderer, dados diferentes.** |

### 18.2 Causa raiz do mapa invisível

Investigando o CSS module `.dialog`:

```css
.dialog {
  width: 520px;           /* hard fix */
  overflow: hidden;       /* clipa qualquer coisa que extrapole */
  ...
}
```

E meu modal:

```tsx
<div className={styles.dialog} style={{ maxWidth: 1080, minHeight: 560 }}>
  <div style={{ display: "grid",
                gridTemplateColumns: "260px 1fr 280px",   // mínimo 540 px
                minHeight: 460 }}>
```

`maxWidth: 1080` **não sobrescreve** `width: 520`. O grid (260 + 1fr + 280 = 540 px mínimos) excedia o container de 520 px → coluna do meio (`1fr`) ficava com ~0 px e era clippada por `overflow: hidden`. **Leaflet renderizava o mapa corretamente — em um div invisível.** Por isso o `invalidateSize` da Round 2 não resolveu: o problema não era timing, era largura zero.

### 18.3 Soluções

**Mapa visível.** Width inline força o dialog a 1080 px (compatível com a viewport):

```tsx
<div className={styles.dialog}
     style={{ width: 1080, maxWidth: "min(1080px, 95vw)", minHeight: 560 }}>
```

`width: 1080` derrota o `width: 520` do CSS-module (especificidade inline > seletor de classe). `maxWidth: "min(1080px, 95vw)"` protege janelas pequenas (até 95 % da viewport).

**Múltiplos `invalidateSize`.** Mesmo com largura correta, mantive 4 ticks de invalidate (microtask + 50 ms + 200 ms + 500 ms) — defesa em profundidade contra qualquer layout pass tardio.

**Painel de diagnóstico.** Strip visível no rodapé do mapa mostrando:
- `● leaflet OK` ou `● leaflet …` (verde/vermelho)
- `tiles ✓ N` (contador de tiles carregados)
- `tiles ✗ N` (contador de erros, se houver)
- `resize @ HH:MM:SS` (timestamp do último `invalidateSize`)
- mensagem do último `tileerror` (truncada em 40 chars)
- botão **"Recarregar mapa"** que incrementa `mapRefreshKey` → reexecuta o efeito do `MapInvalidator`

Se o mapa não aparecer, o usuário (e o desenvolvedor) saberão imediatamente em qual etapa parou.

**Unificação total com Road Engine Pro.** Strip dos overrides visuais em `makeOsmRoad`:

```ts
// ANTES (Round 2 — bug):
const overrides = {
  subtype: "osm_way",
  width: defaultWidthMeters(highway) * px_per_m,   // ❌ override visual
  direction,
  spline_tension: isRoundabout ? 0.7 : 0.4,        // ❌ override visual gratuito
  ...
};

// DEPOIS (Round 3 — corrigido):
const overrides = {
  subtype: "osm_way",       // identificador de origem, renderer ignora
  direction,                 // semântica OSM (oneway)
  ...(label ? { label } : {}),
  metadata_json: JSON.stringify({ ... }),
};
if (lanes && lanes >= 1) overrides.lane_count = lanes;
if (isRoundabout) {
  overrides.spline_tension = 0.7;                  // só rotatória
  overrides.markings = { center_line: "none", ... };
}
return makeRoad(flat, style, overrides);
```

**Tudo o mais — `width`, `curb`, `surface`, `markings` (não-rotatória), `spline_tension` (não-rotatória), `category`, `visible`, `locked` — vem do mesmo `ROAD_STYLES[style]` preset que o toolbar manual usa.** Resultado: uma `residential` OSM é **pixel-by-pixel idêntica** a uma `urban` manual desenhada com os mesmos pontos.

### 18.4 Teste de paridade

Esse teste é o **canário** contra regressões visuais futuras:

```ts
describe("Road Engine Pro parity — OSM roads must match manual roads", () => {
  it.each(["urban", "avenue", "highway", "dirt", "parking"])(
    "%s — OSM and manual share width / curb / surface / markings / spline_tension / lane_count",
    (style) => {
      const ways = [{ id: 1, node_refs: [1,2], tags: { highway: HIGHWAY_FOR_STYLE[style] }}];
      const osmRoad = osmDatasetToRoadsFit(ways, nodes, centre, {...}).roads[0];
      const manual = makeRoad([0,0,100,0], style);
      // Ignora campos voláteis (id, points, label, subtype, direction, metadata_json)
      expect(strip(osmRoad)).toEqual(strip(manual));
    },
  );
});
```

Se alguém no futuro reintroduzir um override visual no OSM, este teste falha imediatamente. Cobertura: 5 estilos (urban, avenue, highway, dirt, parking).

Mais dois testes que documentam as exceções legítimas:

- "OSM `lanes=4` overrides ONLY lane_count, never width" — garante que dados OSM válidos não comprometem o visual
- "roundabouts are the only deliberate visual divergence" — confirma que o spline_tension alto + `center_line: "none"` SÓ acontece para `junction=roundabout`

### 18.5 Arquivos modificados nesta rodada

- `src/modules/croqui/engine/osm.ts` — `makeOsmRoad` reescrito (remove
  overrides de width e spline_tension); `defaultWidthMeters` e
  `LANE_WIDTH_M` permanecem disponíveis mas não são mais usados no
  fluxo principal (preservados para uma rodada futura que talvez
  reintroduza presets OSM-específicos).
- `src/modules/croqui/editor/OsmImportModal.tsx`:
  - `width: 1080` inline no `.dialog`.
  - `MapInvalidator` com 4 invalidate calls + prop `onReady`.
  - Estado `mapState` (leafletMounted, tileLoadCount, tileErrorCount, lastTileError, lastInvalidateAt).
  - Strip de diagnóstico visível no rodapé do mapa.
  - Botão "Recarregar mapa" (bump em `mapRefreshKey`).
  - TileLayer `tileerror`/`tileload` agora atualizam contadores.
- `src/modules/croqui/engine/osm.test.ts` — bloco novo "Road Engine
  Pro parity" com 7 testes (5 estilos × parity + lanes-only + roundabout).

### 18.6 Resultados das validações

| Verificação | Antes | Depois |
|---|---|---|
| `pnpm typecheck` | ✅ | ✅ |
| `pnpm vitest run` | 260 testes | **267 testes** (+7 paridade) |
| `pnpm build` | ✅ | ✅ |
| `cargo check` | ✅ | ✅ |
| `cargo test --lib` | 88 testes | 88 testes |

### 18.7 Comparação antes/depois (visual esperado)

| Cenário | Round 2 | Round 3 |
|---|---|---|
| Via OSM `residential` (urban preset) | width 13 px, fina, sem curb visível | width 80 px, curb 2 px, eixo tracejado, idêntica ao manual urban |
| Via OSM `primary` (highway preset) | width 21 px, fina | width 180 px, sem curb (highway), eixo amarelo sólido, idêntica ao manual highway |
| Via OSM `secondary` (avenue preset) | width 17 px | width 140 px, curb 3 px, eixo duplo amarelo, lane dividers, idêntica ao manual avenue |
| Rotatória OSM (`junction=roundabout`) | width físico, tensão 0.7 | width do preset (highway/avenue/urban conforme tag), tensão 0.7, sem center line — visualmente "bonita" |

A diferença visual é dramática — o teste de paridade prova matematicamente que OSM e manual produzem o mesmo `SicroRoadObject` (modulo geometria/label/direction).

### 18.8 Compatibilidade

- Schema `.sicrocroqui` continua v0.3 (sem mudanças).
- A função antiga `osmDatasetToRoads(ways, nodes, view)` continua exportada e seus testes seguem verdes.
- Road Engine Pro **intacto** — quem mudou foi o consumer (OSM), não o motor.
- `defaultWidthMeters` e `LANE_WIDTH_M` permanecem exportados, sem uso atual no fluxo padrão, prontos para reuso futuro caso queiramos um modo "OSM físico" opt-in.
- Importar Drone (MVP 9 R4) intacto.
- Backend Rust intocado.
- Outros módulos (Laudo / Evidências / Dossiê / Vídeo / Imagem / Home / Importador) não foram tocados.

### 18.9 Limitações remanescentes

1. **Tiles ainda dependem de rede.** O diagnóstico avisa, o
   contador de erros aparece, o botão "Recarregar mapa" tenta de
   novo. Cache local de tiles continua sendo spike futuro.
2. **Roundabout é a única exceção visual.** Se OSM trouxer uma via
   com perfil incomum (ex: faixa de 12 m mapeada com `lanes=2`), o
   width permanece do preset urban (80 px) e o usuário pode ajustar
   manualmente arrastando as alças do Transformer.
3. **`junction=roundabout` é detectado apenas pela tag.** Anéis
   geométricos sem essa tag não recebem o tratamento especial.
4. **Sem busca textual (Nominatim).** Coordenadas + clique no
   mapa + "Do Dossiê" continuam sendo os 3 caminhos.

### 18.10 Roteiro de validação (executar)

> Execute antes de aprovar o fechamento desta rodada.

**A — Mapa visível**
1. Toolbar do Croqui → "Importar OSM…".
2. **Conferir:** o mapa **aparece** no modal com tiles do OSM
   carregados. O strip de diagnóstico mostra `● leaflet OK` em
   verde e `tiles ✓ N` com N > 0.
3. Pan/zoom funcionam.
4. Clique no mapa → marcador vermelho + coordenada atualiza no
   input + círculo de raio aparece.
5. (Opcional) Clicar "Recarregar mapa" → `resize @ HH:MM:SS`
   atualiza no strip.

**B — Coordenadas**
1. Colar `-0.0345, -51.0694` → mapa centraliza.
2. Coord inválida → erro claro.

**C — Paridade visual**
1. **Desenhar manualmente** uma via urbana usando o toolbar (botão
   "Via" → "Via urbana" → clicar 2 pontos no canvas → Enter).
2. **Importar do OSM** uma via `residential` (a maioria das ruas de
   bairro em Macapá vai cair aqui).
3. **Comparar lado-a-lado.** As duas vias DEVEM ter:
   - mesmo `width` na tela;
   - mesmo padrão de borda branca;
   - mesmo eixo central tracejado amarelo/branco;
   - mesmo curb;
   - mesma cor de asfalto.
4. Se forem **iguais**: ✅ unificação OK.

**D — Rotatória**
1. Buscar OSM em um local com rotatória.
2. Importar a via com `junction=roundabout`.
3. **Conferir:** spline suave (não polígono octogonal feio), sem
   eixo central, preserva ring fechado.

**E — Persistência + Exportação**
1. Salvar (Ctrl+S).
2. Fechar Croqui, reabrir → vias OSM continuam idênticas.
3. Exportar PNG técnico/limpo → vias OSM aparecem.
4. "Abrir Laudo" → painel de evidências vê PNG atualizado.
5. PDF do Laudo → croqui correto.

**F — Robustez**
1. Desconectar a rede → "Buscar vias" → mensagem de falha; app
   não trava.
2. Tiles ainda assim aparecem ou contador de tile errors aparece
   no strip.
3. Botão "Recarregar mapa" funciona após reconectar.

**G — Outros módulos**
1. Laudo / Evidências / Dossiê / Vídeo / Imagem / Home / Importador
   continuam abrindo.

### 18.11 Comparação com SICRO 1.0

Esta é a comparação que o usuário pediu. A meta é "igualar ou
superar o SICRO 1.0".

- **Largura de vias:** O SICRO 1.0 usa larguras visuais largas
  parecidas com nossos presets (urban ≈ 80 px). Após Round 3, as
  vias OSM do SICRO 2.0 **usam exatamente esses presets** — então a
  comparação visual com SICRO 1.0 fica imediatamente parelha.
- **Interseções:** Road Engine Pro tem detecção automática de
  junções + clipping de marcações (junction polygon). O SICRO 1.0
  fazia algo similar via stencil; o SICRO 2.0 faz por geometria. O
  resultado em vias OSM deve ser igual ou superior (depende do
  caso particular).
- **Rotatórias:** SICRO 1.0 trata como arc dedicado; o SICRO 2.0
  usa spline com tensão 0.7. Para a vasta maioria dos casos
  visuais o resultado é equivalente; rotatórias muito grandes/
  irregulares podem precisar de tratamento por arc dedicado no
  futuro.

### 18.12 Próximos passos sugeridos

1. **Validação visual lado-a-lado com SICRO 1.0** no mesmo local.
2. **Tile cache em disco** para uso offline parcial.
3. **Provider de tiles configurável** (Carto / Stamen / institucional).
4. **Busca textual (Nominatim)** com aviso de privacidade.
5. **Tratamento dedicado para arcs e rotatórias muito grandes**.

---

**Reiterando a instrução do usuário:** esta terceira rodada
**não cria commit**, **não faz merge** e **não cria tag**.
Aguardando nova validação visual antes do fechamento do MVP 10.

---

## 19. Correção crítica — Travamento ao abrir Importar OSM

> **Status desta rodada (quarta):** entregue para nova validação.
> O modal abre instantaneamente, mapa só carrega sob demanda.
> Sem commit/merge/tag.

### 19.1 O problema reportado

> "Quando clico no botão Importar OSM, nada acontece, o programa
> trava, a janela nova que deveria mostrar ele nunca carrega/aparece."

Não era "tile não carrega" nem "qualidade visual": o **clique
trava o app inteiro** e o modal nem pinta. Toda a análise da Round 3
sobre largura/CSP/aspect estava operando num modo em que o modal
sequer alcançava o paint phase.

### 19.2 Diagnóstico — onde travava

Auditoria do código que a Round 3 deixou no ar identificou **dois
loops infinitos** disparando simultaneamente no momento que o
`<OsmImportModal>` entrava em `commit`:

**Loop A — `MapInvalidator.onReady`**

```tsx
<MapInvalidator
  refreshKey={mapRefreshKey}
  onReady={(when) =>             // ⚠ NOVO arrow a cada render do pai
    setMapState((s) => ({ ... })) // ⚠ chama setState do pai
  }
/>
```

Dentro do `MapInvalidator`:

```tsx
useEffect(() => {
  ...
  onReady(stamp());              // chama o callback do pai
}, [map, refreshKey, onReady]);  // ⚠ `onReady` está nos deps
```

Sequência:
1. Modal monta → `onReady` é um closure novo (id A).
2. `MapInvalidator` mounta → effect roda → chama `onReady(A)`.
3. `onReady(A)` faz `setMapState` → pai re-renderiza.
4. Render do pai cria `onReady` com id B (closure novo).
5. `MapInvalidator` re-renderiza com `onReady=B` → useEffect dep
   array mudou → effect re-fire.
6. Effect chama `onReady(B)` → `setMapState` → pai re-renderiza.
7. Volta para passo 4 → **infinito**.

**Loop B — `TileLayer.eventHandlers`**

```tsx
<TileLayer
  ...
  eventHandlers={{
    tileload: () => setMapState((s) => ({ ...s, tileLoadCount: s.tileLoadCount + 1 })),
    tileerror: (e) => setMapState((s) => ({ ... })),
  }}
/>
```

Cada tile carregado (dezenas por segundo quando 50+ tiles entram)
disparava `setState` → re-render → novo objeto `eventHandlers` →
react-leaflet possivelmente re-binda → cascata.

Os dois loops combinados saturavam a thread do WebView **antes** do
React conseguir pintar o modal. Por isso o usuário via o app travar
sem nenhuma janela aparecer.

### 19.3 Solução — abordagem em etapas exigida pelo usuário

**Etapa 1 — Modal mínimo, sem Leaflet.**

`OsmImportModal.tsx` reescrito. Imports do topo NÃO incluem mais
`react-leaflet` nem `leaflet` — toda a parte Leaflet vive em um
componente separado, mountado só sob demanda. O render inicial do
modal contém:

- título
- input de coordenadas + botão "Usar coordenadas" + botão "Do Dossiê"
- presets de raio (25/50/100/200 + custom)
- botão "Buscar vias"
- placeholder do mapa com botão **"Carregar mapa"**
- painel de lista de vias (vazio até o usuário buscar)
- footer (Cancelar / Importar selecionadas)

Resultado: clicar "Importar OSM" agora abre o modal **instantaneamente**.

**Etapa 2 — Leaflet sob demanda + ErrorBoundary.**

Novo arquivo `OsmMapPanel.tsx` contém TODA a parte Leaflet. Ele
só é renderizado quando o usuário clica "Carregar mapa" (state
`mapEnabled = true` em `OsmImportModal`). Envolvido num
`LazyMapBoundary` (componente `Component` com `getDerivedStateFromError`):

- Se qualquer coisa Leaflet falhar (tile error fatal, missing CSS,
  react-leaflet exception, WebView block), o boundary captura o
  erro e mostra: "Falha ao carregar o mapa" + mensagem técnica +
  botão "Voltar para o modo sem mapa".
- O modal **continua aberto e funcional**. Coordenadas e busca por
  bbox continuam disponíveis.

**Loops do Round 3 corrigidos:**

- `MapInvalidator` agora tem `useEffect(() => {...}, [])` (mount-only)
  e usa `useRef` para `onReady` — id do callback é congelado, deps
  não mudam, sem re-fire.
- "Recarregar mapa" não mexe em deps; ele apenas bumpa um
  `refreshNonce` e usa `key={refreshNonce}` no `MapInvalidator` →
  React remonta o componente do zero quando necessário.
- `TileLayer` **não tem mais `eventHandlers`**. Contadores de
  tile foram removidos do state (eram puramente diagnóstico e
  custavam re-render por tile). O painel de diagnóstico agora só
  mostra "leaflet OK/carregando" — atualizado uma única vez via
  `onReady`.
- `MapClickHandler` também usa ref pattern: `onClick` vai num ref,
  o `useMapEvents` callback lê do ref → o handler do mapa nunca
  precisa rebindar.

**Etapa 3 — Busca Overpass sob demanda.**

`fetchOverpassBBox` continua sendo chamado **só** dentro de
`handleSearch`, que só dispara quando o usuário clica "Buscar
vias". Nenhum `useEffect` chama fetch automaticamente.

**Etapa 4 — Conversão sob demanda.**

`osmDatasetToRoadsFit` continua sendo chamado **só** dentro de
`handleConfirm`, que só dispara quando o usuário clica "Importar
selecionadas".

### 19.4 Logs de tracing

Console logs adicionados para diagnosticar futuras regressões
(podem permanecer; são informativos, não pesados):

```
[OSM] modal mounted (safe mode)
[OSM] user requested map
[OSM] OsmMapPanel mounting (Leaflet starts now)
[OSM] MapInvalidator effect — scheduling invalidateSize
[OSM] handleSearch start { centre, radius }
[OSM] handleSearch ok { nodes, ways, from_cache }
[OSM] handleConfirm start { selected }
[OSM] handleConfirm ok { roads }
[OSM] manual refresh requested
[OSM] user closed map panel
[OSM] map panel crashed (apenas via ErrorBoundary)
```

### 19.5 Arquivos modificados nesta rodada

- `src/modules/croqui/editor/OsmImportModal.tsx` — reescrita
  completa em "safe mode": shell sem imports Leaflet, sub-panels
  `LeftPanel`/`CentrePanel`/`RightPanel`, placeholder do mapa,
  ErrorBoundary `LazyMapBoundary`, logs de tracing.
- `src/modules/croqui/editor/OsmMapPanel.tsx` — **arquivo novo**.
  Toda parte Leaflet vive aqui. Refs estáveis em todos os
  callbacks que interagem com `useEffect`/`useMapEvents`. Sem
  `eventHandlers` em `TileLayer`. Único re-render do strip
  diagnóstico = `setMapReady(true)` (uma vez na vida do mount).

Nenhum outro arquivo precisou mudar (osm.ts continua com o
converter unificado da Round 3; coordinates.ts intacto; outros
módulos intactos).

### 19.6 Resultados das validações

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` | ✅ |
| `pnpm vitest run` | ✅ **267 testes** |
| `pnpm build` | ✅ |
| `cargo check` | ✅ |
| `cargo test --lib` | ✅ **88 testes** |

Os testes existentes seguem todos verdes — a refatoração foi
puramente estrutural na UI; nada de motor (engine/ road / coord
/ overpass / converter / fitOsmRoadsToCanvas) mudou.

### 19.7 Modo seguro do modal — comportamento

| Estado | UI | Comportamento |
|---|---|---|
| Modal abre | Placeholder do mapa + lista vazia + botão "Buscar vias" desabilitado | Modal pinta em < 50 ms. Zero rede, zero Leaflet. |
| Usuário digita coords + "Usar coordenadas" | Marcador conceitual (sem mapa) + botão "Buscar vias" habilitado | Pura validação local. |
| Usuário clica "Buscar vias" sem mapa | Overpass call → lista preenche | Funciona perfeitamente sem mapa visual. |
| Usuário clica "Carregar mapa" | `OsmMapPanel` monta dentro de ErrorBoundary | Se Leaflet OK: mapa aparece. Se falhar: card de erro com botão para voltar ao modo sem mapa. |
| Usuário clica "Esconder mapa" | Volta ao placeholder | Útil se o mapa estiver gastando recursos. |
| Usuário clica "Importar selecionadas" | Conversão + `onConfirm` | Acontece em qualquer modo (com ou sem mapa visível). |

### 19.8 Limitações remanescentes

1. **Modo sem mapa não tem preview visual.** A lista do canto
   direito mostra nomes, tipo, lanes — mas não desenha as vias.
   Suficiente para fluxo "vi onde é, importo tudo do raio".
2. **Tile cache continua em memória apenas.** Se "Carregar mapa"
   falhar em uma sessão e o usuário tentar de novo na próxima,
   tiles serão re-baixados.
3. **Bundle inclui Leaflet mesmo no modo sem mapa.** Foi uma
   escolha deliberada — `React.lazy` introduziria assincronia que
   complicaria o ErrorBoundary. O custo é ~150 KB extra no bundle
   inicial. Aceitável.
4. **O usuário só pode ter um modal por vez** (já era o caso). Não
   muda nada nesta rodada.

### 19.9 Roteiro de validação manual

> Execute este roteiro antes de aprovar o fechamento.

**A — Modal abre instantâneo**
1. Toolbar do Croqui → "Importar OSM…".
2. **Conferir:** modal aparece **imediatamente** (< 100 ms).
   Não há frame travado, não há spinner, não há atraso visível.
3. Conferir aba do Devtools (Ctrl+Shift+I) → mensagem
   `[OSM] modal mounted (safe mode)` aparece.

**B — Modo sem mapa**
1. Sem clicar em "Carregar mapa", colar `-0.0345, -51.0694`.
2. Clicar "Usar coordenadas".
3. Selecionar raio 100 m.
4. Clicar "Buscar vias".
5. **Conferir:** lista de vias preenche normalmente; Devtools
   mostra `[OSM] handleSearch ok {...}`.
6. Selecionar vias, clicar "Importar selecionadas".
7. **Conferir:** vias importam para o croqui.

**C — Carregar mapa sob demanda**
1. Reabrir o modal.
2. Clicar "Carregar mapa".
3. **Conferir:** `OsmMapPanel` aparece, mapa Leaflet com tiles,
   marcador (se já tinha coord), círculo do raio.
4. Devtools: `[OSM] user requested map` e
   `[OSM] OsmMapPanel mounting (Leaflet starts now)`.
5. Clicar no mapa → marcador se atualiza.
6. Clicar "Esconder mapa" → volta para placeholder; modal segue
   aberto.

**D — ErrorBoundary**
1. Pode-se forçar erro temporário editando `OsmMapPanel` (lançar
   uma exceção no render). **Esperado:** modal continua aberto, o
   card de erro aparece, botão "Voltar para o modo sem mapa"
   funciona.

**E — App continua responsivo**
1. Em qualquer momento, abrir outras janelas do SICRO (ActivityRail
   → Laudo etc.). App não trava.
2. Fechar modal com Esc / clique fora / botão Fechar / botão
   Cancelar — tudo funciona.

**F — Validações automáticas**
1. `pnpm typecheck` → 0 erros.
2. `pnpm vitest run` → 267 testes.
3. `pnpm build` → bundle gerado.
4. `cargo check` + `cargo test --lib` → OK.

### 19.10 Próximos passos sugeridos

1. **Confirmar com o usuário** que o modal agora abre em <100 ms
   (rodada anterior travava).
2. **Validar a unificação visual com Road Engine Pro** (Round 3
   §18) — agora que o modal abre, é possível efetivamente importar
   vias e ver se a paridade funciona na prática.
3. **`React.lazy`** para `OsmMapPanel` (deferred — não bloqueia
   esta rodada). Removeria Leaflet do bundle inicial.

---

**Reiterando a instrução do usuário:** esta quarta rodada
**não cria commit**, **não faz merge** e **não cria tag**.
Aguardando nova validação manual antes do fechamento do MVP 10.

---

## 20. Road Geometry Engine para OSM complexo

> **Status desta rodada (quinta):** entregue para nova validação visual.
> Sem commit/merge/tag.

### 20.1 Pontos positivos da rodada anterior + o que ainda incomoda

A Round 4 destravou o modal — ele agora abre, o mapa carrega quando
o usuário pede, a importação por coordenada cria RoadObjects no
croqui. Mas a validação visual identificou:

1. **Mensagem "mapa não carrega automaticamente"** é UX ruim — o
   usuário clicou em "Importar OSM" para ver o mapa.
2. **Rotatórias e loops fechados** ficam deformados (cap arredondado
   na junção do anel, faixa central amarela atravessando o miolo).
3. **Faixa de marcação** sempre amarela em via "primary" mesmo quando
   o município/projeto pede branca — sem controle por via.
4. **Preview do Leaflet** mostra a rua "bonita" do OSM e o usuário
   imagina que será assim no croqui — quando na verdade o desenho
   final passa pelo Road Engine Pro.

### 20.2 Soluções

| Tópico | Solução |
|---|---|
| Mapa não auto-carregava | `OsmImportModal` agora mounta `OsmMapPanel` direto (`mapEnabled` default `true`). Placeholder reformulado: só aparece se o usuário **explicitamente** clicar "Esconder mapa" ou se o ErrorBoundary capturar uma falha. Texto reescrito sem a alegação de que "o mapa não carrega". |
| Rotatórias deformadas | Schema novo: `SicroRoadObject.closed_path?: boolean` (aditivo). OSM converter detecta `junction=roundabout` **e** OSM rings (primeiro `node_ref == último`) → seta `closed_path = true`. RoadNode renderer agora: (a) usa `Konva.Line` com `closed={true}` no curb e no asphalt → anel sem cap; (b) `lineCap="butt"` quando fechado; (c) suprime a center line em qualquer caminho fechado (rotatória nunca tem faixa central). |
| Cor da marcação | Schema novo: `RoadMarkings.color?: "auto" \| "white" \| "yellow"` (aditivo). Default `"auto"` mantém a heurística antiga (yellow em highway/avenue, white nos demais). Branco/amarelo explícitos sobrescrevem. InspectorPanel ganha `RoadProps` com dropdown "Cor da marcação". |
| Preview honesta | Nota fixa no canto superior direito do mapa: "O desenho final é gerado pelo Road Engine do SICRO — o mapa OSM serve apenas para localizar e selecionar as vias." Evita expectativa de paridade pixel com Mapnik. |
| InspectorPanel road tab | Novo componente `RoadProps`: Estilo (read-only), Faixas (number), Cor da marcação (auto/branca/amarela), Caminho fechado (checkbox). |

### 20.3 Mudanças no Road Engine (não-OSM-específicas)

Estas mudanças beneficiam **todas** as vias — manuais, OSM, templates:

- `closed_path: true` → asphalt + curb renderizados como `Konva.Line(closed)` → sem cap; lineCap=butt; lineJoin=round mantém junção visual.
- `closed_path: true` → `showCenter = false` sempre (defesa contra cor amarela inadvertida em loop).
- `markings.color` controla `centerColor` da center line e dos lane dividers; `edgeColor` permanece branco (convenção brasileira para faixa de borda).

### 20.4 Por que estas mudanças resolvem geometrias complexas

| Caso | Antes (R4) | Depois (R5) |
|---|---|---|
| Rotatória OSM (5 nós, último = primeiro) | Polyline aberta com tension 0.7 → caps redondos no "encontro" do anel + faixa central amarela atravessando | `closed_path=true` → Konva.Line closed, sem caps, sem centerline. Resultado: anel limpo. |
| Retorno manual fechado | Sem flag = mesmo problema da rotatória | Marcar "Caminho fechado" no Inspector → mesmo tratamento. |
| Via primary (highway) num projeto que usa marca branca | Forçado amarelo pelo road_style | Inspector → cor "Branca" → centerColor = #f5f5f5. |
| Via OSM fechada sem `junction=roundabout` | Polyline aberta com final≈início | Detecção geométrica (`node_refs[0] == node_refs[N-1]`) seta closed_path=true. |

### 20.5 Limitações remanescentes (documentadas)

1. **Sem ajuste robusto de offset para curvas agudas.** Em curvas
   < 45° as edge lines podem produzir auto-intersecção sutil. Não
   é prático fazer cálculo completo de mitre clipping num MVP; em
   prática, o tension do spline esconde quase tudo.
2. **Y-junctions ainda dependem de endpoints OSM compartilhados.**
   O snap a 1 px já garante isso. Casos em que OSM não compartilha
   node (raros em ways tagged-highway) ainda não fazem fusão.
3. **Sem Road Geometry Engine independente (ribbon polygon).**
   Continuamos usando `Konva.Line(stroke)` ao invés de polígono
   2D real. Para a maioria absoluta dos casos o stroke já é
   visualmente aceitável; um ribbon polygon real seria spike próprio
   (precisa de offset polygon, clipper, mitre joins). Mantido como
   item da pasta de melhorias futuras.
4. **Preview vetorial no modal.** Continua mostrando o tile OSM
   raw com polylines OSM. Não rendera um preview-do-Road-Engine
   miniatura dentro do modal — esse seria um spike próprio
   (Konva-in-modal aninhado). A nota visual atenua a expectativa.

### 20.6 Arquivos modificados nesta rodada

- `src/modules/croqui/engine/schema.ts` — `closed_path?: boolean` no
  `SicroRoadObject`; `color?: RoadMarkingColor` no `RoadMarkings`;
  novo tipo `RoadMarkingColor`. **Aditivo + opcional**.
- `src/modules/croqui/engine/osm.ts` — `makeOsmRoad` detecta
  `junction=roundabout` E OSM ring (geometric closed loop), seta
  `closed_path=true`.
- `src/modules/croqui/editor/CanvasStage.tsx` — `RoadNode` usa
  `closed_path` para Konva.Line(closed) no asphalt + curb;
  `markings.color` override sobre `centerColor`; `showCenter`
  bloqueia para closed paths.
- `src/modules/croqui/editor/InspectorPanel.tsx` — novo `RoadProps`
  + import `SicroRoadObject` + import `RoadMarkingColor`.
- `src/modules/croqui/editor/OsmImportModal.tsx` — `mapEnabled`
  default `true`; placeholder reescrito.
- `src/modules/croqui/editor/OsmMapPanel.tsx` — nota visual
  "O desenho final é gerado pelo Road Engine do SICRO" no topo.
- `src/modules/croqui/engine/osm.test.ts` — 3 testes novos
  (`closed_path=true` para junction=roundabout, para ring fechado
  sem tag, undefined para via aberta).
- `src/modules/croqui/engine/serializer.test.ts` — 2 testes novos
  (legacy road sem novos campos carrega ok; round-trip preserva
  closed_path + markings.color).

### 20.7 Resultados das validações

| Verificação | Antes | Depois |
|---|---|---|
| `pnpm typecheck` | ✅ | ✅ |
| `pnpm vitest run` | 267 testes | **272 testes** (+5) |
| `pnpm build` | ✅ | ✅ |
| `cargo check` | ✅ | ✅ |
| `cargo test --lib` | 88 testes | 88 testes (Rust intocado) |

### 20.8 Compatibilidade

- **Schema `.sicrocroqui`** continua v0.3. As duas adições são
  opcionais: `closed_path` defaulta para `undefined/false`,
  `markings.color` para `undefined`. Croquis antigos abrem
  exatamente como antes.
- **Via manual** se beneficia das mesmas opções (Inspector → cor
  da marcação + caminho fechado).
- **Road Engine Pro** intocado em sua estrutura — só absorveu
  duas novas propriedades opcionais no renderer.
- **Importar Drone** (MVP 9 R4) intacto.
- **Backend Rust** intocado.
- **Outros módulos** (Laudo / Evidências / Dossiê / Vídeo /
  Imagem / Home / Importador) não foram tocados.

### 20.9 Roteiro de validação manual (executar)

> Execute antes de aprovar.

**A — Mapa auto-carrega**
1. Toolbar → "Importar OSM…".
2. **Conferir:** modal abre e o **mapa já está carregando tiles**
   sem clique adicional.
3. Não há mensagem "não carrega automaticamente".
4. Nota no canto superior direito: "O desenho final é gerado pelo
   Road Engine do SICRO — o mapa OSM serve apenas para localizar".
5. Zoom/pan funcionam. Clique no mapa atualiza coordenada.

**B — Rotatória**
1. Importar uma rotatória conhecida (ex.: rotatória da Av. FAB em
   Macapá).
2. **Conferir no croqui:**
   - asfalto fecha como anel (sem "bulbo" no encontro do início/fim);
   - sem faixa central amarela atravessando o miolo;
   - bordas brancas seguem o ring.

**C — Loop fechado sem tag explícita**
1. Buscar em local com `way` cuja `node_refs` começa e termina no
   mesmo node (algumas glorietas, retornos).
2. **Conferir:** `closed_path=true` aparece marcado no Inspector
   após selecionar a via.

**D — Cor da marcação**
1. Selecionar uma via importada do OSM.
2. Inspector → "Cor da marcação" → "Branca" → eixo central muda
   para branco.
3. → "Amarela" → eixo central muda para amarelo.
4. → "Automático" → volta ao padrão por road_style.

**E — Persistência**
1. Importar OSM + ajustar cor + marcar closed_path manual numa
   outra via.
2. Salvar (Ctrl+S).
3. Fechar Croqui, reabrir.
4. **Conferir:** flags + cor preservados.

**F — Exportação**
1. PNG técnico → rotatória aparece fechada, sem faixa amarela
   atravessando.
2. PNG limpo → idem.
3. "Abrir Laudo" → painel de evidências mostra o PNG novo.
4. PDF do Laudo → idem.

**G — ErrorBoundary**
1. (Opcional, dev) Forçar erro no OsmMapPanel → modal mostra
   "Falha ao carregar o mapa" + botão "Voltar para modo sem mapa".

**H — Outros módulos**
1. Laudo / Evidências / Dossiê / Vídeo / Imagem / Home /
   Importador continuam abrindo.

### 20.10 Próximos passos sugeridos

1. **Ribbon polygon real** para os casos onde mitre clipping
   importa (curvas < 45°). Spike próprio.
2. **Preview Konva miniatura** dentro do modal mostrando como
   ficará no croqui. Spike próprio.
3. **Persistência de "endpoint snapping" entre sessões** — atual
   confia no node_id OSM; spike futuro pode salvar adjacências
   no `.sicrocroqui`.

---

**Reiterando a instrução do usuário:** esta quinta rodada
**não cria commit**, **não faz merge** e **não cria tag**.
Aguardando nova validação visual antes do fechamento do MVP 10.

---

## 21. Reprovação visual e reset do Road Engine

> **Status:** MVP 10 **suspenso**. Sem código novo. Auditoria
> publicada em `ROAD_ENGINE_1_PYTHON_AUDIT.md`. Aguardando
> aprovação para escrever o plano de redesign (`ROAD_ENGINE_2_REDESIGN_PLAN.md`).

### 21.1 Validação reprovada

O usuário comparou o mesmo local do sinistro:
- SICRO 1.0 Python: malha viária bonita, rotatórias arredondadas,
  curvas suaves, conexões limpas.
- SICRO 2.0 (atual, após Rounds 1–5): vias tortas, enormes em
  curvas, rotatórias deformadas, conexões com remendos.

Pergunta correta do usuário: **"não dá para copiar o do Python?"**

Resposta: sim. Daí esta etapa.

### 21.2 Causa raiz, depois da auditoria

O Road Engine atual do SICRO 2.0 é fundamentalmente baseado em
**stroke grosso de centerline** (`Konva.Line` com strokeWidth
igual à largura da pista). O SICRO 1.0 Python é baseado em
**polígono ribbon suavizado** (`Tkinter.create_polygon` com
`smooth=True` sobre vértices left/right offset da centerline).

**Estes dois modelos são fundamentalmente diferentes.** Stroke
preserva centro reto e suaviza só visualmente; ribbon mantém a
forma do polígono. Em curvas e junções, o resultado é dramático.

Adicionalmente:

| | Python 1.0 | SICRO 2.0 |
|---|---|---|
| Markings clip | distância real ao centerline alheio | círculos nas interseções |
| Rotatória | objeto dedicado (cx, cy, r) + create_oval | polyline aproximando círculo |
| OSM → road | reduz para Bezier 4-pontos | preserva todos os nós OSM |
| Render | 4 passes globais (calçada / asfalto / marcações / handles) | per-object render |

### 21.3 Decisão

Parar de remendar `Konva.Line(stroke)`. Portar a arquitetura
Python para o TypeScript, mantendo o `SicroRoadObject` aditivo
(documentos antigos abrem sem mudança).

A auditoria completa está em
**`ROAD_ENGINE_1_PYTHON_AUDIT.md`** (15 perguntas respondidas
ponto a ponto + tabela comparativa Python vs 2.0 + lista do que
portar / não portar).

### 21.4 Próximos passos (a aprovar)

1. **Aprovar a auditoria** (ou pedir correções).
2. Escrever `ROAD_ENGINE_2_REDESIGN_PLAN.md` com:
   - novo módulo `src/modules/croqui/engine/road-v2/`
   - schema v2 do RoadObject (4 pontos Bezier + largura + props)
   - novo Konva renderer multi-passada
   - novo OSM converter (4-point Bezier)
   - primitiva `RoundaboutObject` dedicada
   - estratégia de migração para croquis legados
   - testes
3. Implementar Road Engine 2.0.
4. OSM passa a usar Road Engine 2.0 (mesmo motor das vias manuais).
5. Validação visual com o mesmo local que reprovou.

### 21.5 O que NÃO foi feito nesta etapa

- Nenhum código novo.
- Nenhum teste novo.
- Nenhuma mudança em `SicroRoadObject`, `RoadNode`,
  `osmDatasetToRoadsFit`, `OsmImportModal` etc.
- Validações automáticas continuam no estado da Round 5:
  `pnpm typecheck` ✅, `pnpm vitest run` (272) ✅,
  `pnpm build` ✅, `cargo check` ✅, `cargo test --lib` (88) ✅.

### 21.6 O que foi feito

- Localização do codebase Python (5 arquivos-chave identificados).
- Leitura integral de `desenho/spline_via.py`,
  `desenho/osm_via.py`, `desenho/via_elementos.py`,
  `osm_nucleo.py` e do bloco `_desenhar_vias_multipass` em
  `ui/editor_croqui.py:2810`.
- Identificação das 4 diferenças técnicas que fazem o Python
  ficar visualmente superior (polígono vs stroke, mask geométrico
  vs circular, rotatória como primitiva, OSM como 4-point Bezier).
- Resposta às 15 perguntas obrigatórias da FASE 0.
- Publicação de `ROAD_ENGINE_1_PYTHON_AUDIT.md`.

---

**Reiterando a instrução do usuário:** **FASE 0 = auditoria sem
código.** Aguardando validação da auditoria antes de continuar.

---

## 22. Reimplementação OSM sobre Road Engine 2.0 (Fase G)

> **Status:** OSM Adapter 2.0 implementado, integrado ao modal e
> ao editor, com 38 testes novos. `pnpm test` 622 ✓, `pnpm build`
> ✓, `cargo check` ✓, `cargo test --lib` 88 ✓. **Sem commit / sem
> merge / sem tag.** Relatório técnico completo em
> `ROAD_ENGINE_2_IMPLEMENTACAO_RELATORIO.md` §22.

### 22.1 Por que a primeira abordagem foi reprovada

O conversor original `osmDatasetToRoadsFit` (em
`src/modules/croqui/engine/osm.ts`, MVP 10 Rounds 1–5) era pensado
para alimentar o **Road v1** — `Konva.Line` com `strokeWidth =
largura da pista`. O que isso significava na prática:

- **Curvas viravam zigue-zague:** cada nó OSM preservado vira
  um vértice da `Konva.Line`. Em rua residencial com 20+ nós por
  via, o stroke seguia *fielmente* o traçado OSM e amplificava
  todo desvio sub-métrico do dado bruto.
- **Rotatórias deformadas:** OSM modela rotatória como `way`
  com `junction=roundabout` (anel poligonal de 8–16 nós). O
  conversor original tratava isso como uma `Konva.Line` fechada
  — resultado: anel poligonal grosso, sem ilha central, sem
  flares. Nada parecido com rotatória de verdade.
- **Junctions sujas:** sem polígono ribbon, o cruzamento de duas
  vias era simplesmente dois `Konva.Line` se sobrepondo. Sem
  patch de asfalto, sem clipping de marcação contra contexto,
  sem ribbon clipping contra ribbon.
- **Inflexível:** mesmo se o perito quisesse "deixar mais
  bonito", não havia controle de smoothing — era 1 nó OSM = 1
  vértice fixo.

Conclusão honesta da Round 5: **o problema não era do conversor.
Era do motor de renderização.** Daí a auditoria Python (§21),
o Road Engine 2.0 (Ciclos 1 + 2 v1–v10), e agora a Fase G.

### 22.2 Por que o Road Engine 2.0 era pré-requisito

| | Road v1 (stroke) | Road Engine 2.0 |
|---|---|---|
| Centerline | array de pontos crus | Cubic Bezier (4 pontos de controle) + smoothing controlável |
| Largura | `Konva.Line.strokeWidth` | ribbon polygon (offset perpendicular esquerda/direita) |
| Curva suave | nenhum controle | `smoothing.mode = "osm" / "soft" / "bezier"` |
| Rotatória | `Konva.Line` fechada | **primitiva `SicroRoundaboutObject`** com flares, gaps angulares, lane_count |
| Junction | sobreposição visual | **`junction patches`** (X/T/Y), clipping de marcações contra contexto |
| Render | per-object | **`RoadNetworkLayerV2`** multipass global (4 passes: calçada, asfalto, marcações, handles) |

Sem essas peças, OSM "lindo" não era possível — o motor não
sabia desenhar curva, rotatória nem cruzamento direito. Com o
Road v2 pronto (até Ciclo 2 v10), abriu-se o caminho para o
OSM Adapter 2.0.

### 22.3 O que o novo adapter faz (em uma frase)

`convertOsmDatasetToSicroObjects(osmDataset)` → `{ roads:
SicroRoadObject[], roundabouts: SicroRoundaboutObject[],
warnings: string[], stats: {...} }` — onde cada via OSM vira
um `SicroRoadObject` v2 com `smoothing.mode = "osm"` e cada
`junction=roundabout` (ou círculo geométrico detectado) vira
um `SicroRoundaboutObject` proporcionado pelas vias conectadas.

### 22.4 Pipeline OSM 2.0 — passo a passo

```
OsmDataset (lat/lon, OSM raw)
   │
   ├─ filterWaysByHighway()           ← descarta footway/cycleway/service por default
   │
   ├─ projectLatLonToLocalMeters()    ← equirectangular cos-corrigida; preserva proporção
   │                                    em buffer de até 1 km com erro sub-1%
   │
   ├─ Map<osm_node_id, Vec2>          ← cada nó OSM projetado UMA vez
   │                                    duas ways usando o mesmo node compartilham Vec2
   │                                    → endpoints coincidentes → junction detectada
   │
   ├─ simplifyPolylineDP(tol=0.5m)    ← Douglas-Peucker conservador; preserva anel fechado
   │                                    (não simplifica rings de roundabout)
   │
   ├─ classifyOsmWay(tags)            ← highway → road_style, lanes → lane_count,
   │                                    oneway → direction, name → label,
   │                                    sempre smoothing.mode = "osm"
   │
   ├─ isOsmRoundabout(way, points)    ← junction=roundabout OU stddev_raio < 30% do raio médio
   │
   ├─ separateRoadsAndRoundabouts()
   │     ├─ Roads: bbox fit uniforme → SicroRoadObject (Road v2)
   │     └─ Roundabouts: centroid + radius médio + computeAutoDimensions(connected widths)
   │                     → SicroRoundaboutObject (Rotatória 2.0)
   │
   └─ { roads, roundabouts, warnings, stats }
```

### 22.5 Como rotatórias OSM são tratadas agora

Antes (Road v1): `Konva.Line` fechada — anel poligonal feio.

Agora (Road v2):

1. **Detecção** (`isOsmRoundabout`): a) tag `junction=roundabout`
   OU `junction=circular`; b) anel fechado cujo desvio padrão
   do raio é < 30% da média (filtra retângulos e formas
   alongadas que tecnicamente são "fechadas").
2. **Centroide e raio**: média aritmética dos vértices →
   centro; média das distâncias → raio.
3. **Re-proporção**: `computeAutoDimensions(connectedRoadWidths,
   lane_count)` da Rotatória 2.0 calcula `width` (espessura do
   anel) e `r` (raio externo) baseado nas vias **que tocam o
   anel** — o objeto importado fica proporcional ao que está
   conectado, não ao raio "cru" do OSM.
4. **Output**: `SicroRoundaboutObject { kind: "roundabout", cx,
   cy, r, width, lane_count, metadata_json }`. O renderer
   `RoundaboutMeshNode` desenha o anel grosso, a ilha central
   (`Konva.Circle` interno), os flares de entrada (tangenciais
   às vias conectadas) e gaps angulares (7.5° de padding).

### 22.6 Como curvas OSM são suavizadas

Antes (Road v1): nenhum. Cada nó OSM = vértice rígido.

Agora (Road v2):

- Cada `SicroRoadObject` criado pelo adapter recebe
  `smoothing: { mode: "osm", tension: 0.5, preserve_corners:
  true }`.
- O renderer da Road v2 lê esse smoothing e aplica
  `applyCenterlineSmoothing()` (módulo `centerline.ts`, Ciclo 2
  v5) — Catmull-Rom com preservação de quinas reais (ângulos
  agudos) e atenuação de ruído sub-métrico.
- O perito pode trocar manualmente no Inspector: `straight`
  (sem suavização), `soft` (suave moderado), `bezier` (suave
  forte), `osm` (default importado, calibrado para OSM bruto).

### 22.7 Como junctions OSM são preservadas

O segredo é o `Map<osm_node_id, Vec2>`. Cada nó OSM é projetado
**uma única vez** e o `Vec2` resultante é compartilhado entre
todas as ways que referenciam aquele nó. Resultado:

- Duas vias que compartilham um nó OSM têm endpoints
  **literalmente iguais** (mesmo objeto `Vec2`, mesmas
  coordenadas).
- O detector de junction do `RoadNetworkLayerV2`
  (`detectJunctions`) reconhece esses endpoints coincidentes e
  emite um `junctionPatch` (X / T / Y).
- O patch de asfalto desenha o paralelogramo correto no
  cruzamento; as marcações de cada via são clipadas contra o
  contexto (sem stroke atravessando outro stroke).

Sem essa preservação, o ribbon de cada via terminaria em
posições levemente diferentes (mesmo que microscopicamente
diferentes) e nenhum junction seria detectado. Daí o cuidado
em projetar via `node_id` → `Vec2` **antes** do simplify e do
fit.

### 22.8 Integração com o modal OSM

O `OsmImportModal.tsx` (que ainda usa Leaflet para mostrar o
mapa de referência) foi adaptado:

- Removido: `import { osmDatasetToRoadsFit } from "../engine/osm"`.
- Adicionado: `import { convertOsmDatasetToSicroObjects } from
  "../engine/road-v2"`.
- O `handleConfirm` agora chama o novo adapter e devolve
  `OsmImportResult { roads, roundabouts, warnings }`.
- **Novo aviso no footer:** *"Importação OSM 2.0 — O mapa
  acima é apenas referência geográfica. O desenho final será
  convertido para o estilo técnico do SICRO..."* — alinha
  expectativa com o resultado (não é "screenshot do mapa", é
  croqui técnico derivado do OSM).

### 22.9 Integração com o CroquiEditor

`handleOsmImportConfirm` no `CroquiEditor.tsx`:

- Adiciona ao `doc.objects` tanto `result.roads` quanto
  `result.roundabouts`.
- **Força automaticamente `road_engine_version: "v2"`** no
  documento ao importar OSM — não há OSM 2.0 + Road v1; é
  pacote único.
- Seleciona a primeira via OU rotatória importada para feedback
  visual imediato.
- Loga `result.warnings` no console (vias sem highway,
  detecções de geometria, etc.).
- Mensagem de feedback inclui contagem de vias, rotatórias e
  "Road Engine 2.0 ativado".

### 22.10 Arquivos criados / alterados nesta etapa

**Criados:**

- `src/modules/croqui/engine/road-v2/osmAdapter.ts` (~686
  linhas) — adapter puro, sem dependência de Konva nem React.
- `src/modules/croqui/engine/road-v2/__tests__/osmAdapter.test.ts`
  (~908 linhas, 38 testes) — cobre projeção, classificação,
  detecção de rotatória, conversão mínima, integração com
  rotatórias, shared nodes, fit+scale, fixture Macapá-like,
  round-trip pelo serializer.

**Alterados:**

- `src/modules/croqui/engine/road-v2/index.ts` — `export *
  from "./osmAdapter"`.
- `src/modules/croqui/editor/OsmImportModal.tsx` — troca de
  adapter + aviso no footer.
- `src/modules/croqui/editor/CroquiEditor.tsx` —
  `handleOsmImportConfirm` reescrito para v2.
- `ROAD_ENGINE_2_IMPLEMENTACAO_RELATORIO.md` — §22 completa
  (canonical).
- `MVP10_OSM_IMPORT_RELATORIO.md` — esta seção.

**Preservados (intocados):**

- `src/modules/croqui/engine/osm.ts` — `osmDatasetToRoadsFit`,
  `simplifyPolylineDP`, `osmTagToRoadStyle`, `osmLanesHint`,
  `osmOnewayToDirection`, `fetchOverpassBBox` continuam
  funcionando. O novo adapter **reusa** as helpers DP, tag→style,
  lanes-hint e oneway. A função de conversão antiga (`osmDatasetToRoadsFit`)
  não é mais chamada pelo modal, mas o módulo segue exportado
  para compatibilidade.

### 22.11 Testes — 38 novos (584 → 622)

| Bloco | Testes | O que cobre |
|---|---:|---|
| `projectLatLonToLocalMeters` | 5 | projeção cos-corrigida, preservação de proporção, conversão de buffer 1 km |
| `classifyOsmWay` | 8 | highway → road_style, lanes hint, oneway, default smoothing osm |
| `isOsmRoundabout` | 7 | tag-based, geometria circular vs retangular vs cauda longa, ring fechado |
| Conversão mínima | 4 | 1 via reta, 2 vias com shared node, lista vazia, way sem highway |
| Rotatórias integradas | 5 | tag positiva, geometria positiva, re-proporção via connected widths |
| Shared nodes / junctions | 4 | endpoints idênticos, T-junction, X-junction, mesmo Vec2 instance |
| Fit + scale | 3 | bbox uniforme, preserva proporção, centro no canvas |
| Fixture Macapá-like | 1 | rua + travessa + rotatória + shared nodes; passa pipeline completo |
| Serializer round-trip | 1 | adapter output → JSON → parse → adapter output (idempotente) |

### 22.12 Limitações conhecidas (Fase G)

- **Footways e cycleways** continuam descartados por default
  (mesma política do conversor antigo). Spike futuro pode
  separá-los em `road_style` próprios.
- **OSM oneway com restrição de horário** (e.g. `oneway:hour=…`)
  não é interpretado — só lê `oneway=yes/no/-1`.
- **Túneis e pontes** (`tunnel=yes`, `bridge=yes`) não geram
  visual diferenciado — entram como via comum. A tag é
  preservada em `metadata_json.raw_tags` para análise futura.
- **OSM nodes com elevação** (`ele`) são ignorados — Road v2
  é 2D por design.
- A escala sugerida do MVP 10 original continua sendo
  **informativa** — o perito ainda confirma via "Definir
  escala" com lona de 2 m.

### 22.13 Roteiro de validação manual (perito)

1. Abrir SICRO → Croqui → Novo croqui em branco.
2. Toolbar → seção Imagem → "Importar OSM…".
3. Inserir coordenadas de uma região com rotatória conhecida
   (ex: rotatória em Macapá, cruzamento conhecido em Brasília).
4. Definir raio (50 ou 100 m).
5. "Buscar vias" → confirmar que mapa Leaflet mostra a área.
6. "Importar selecionadas".
7. **Conferir no canvas:**
   - Vias OSM apareceram com **curvas suaves** (não zigue-zague).
   - **Rotatória** apareceu como anel grosso + ilha central +
     flares conectados às vias (não polígono cru).
   - **Junctions** (cruzamentos) têm patch de asfalto e
     marcações clipadas.
   - **Editabilidade**: clicar em uma via importada, arrastar
     control point → ribbon recalcula em tempo real.
8. **Salvar** → reabrir → tudo persiste, smoothing aplicado.
9. **Exportar PNG técnico** → curvas suaves no PNG, igual ao
   canvas.
10. **Exportar PNG limpo** → idem.
11. Comparar **lado a lado** com o mesmo local no SICRO 1.0
    Python (referência visual da reprovação original).

Critério de aprovação:
- OSM importado visualmente **igual ou melhor** que vias
  manuais Road v2.
- Rotatória OSM **comparável** à rotatória manual.
- Junctions OSM funcionando como junctions manuais.
- Sem tremulação / sem zigzags / sem rotatória deformada.

### 22.14 O que ficou preservado e o que não foi tocado

- ✅ Road v1 (stroke) segue intacto — documentos antigos com
  `road_engine_version: "v1"` (ou sem o campo) continuam
  abrindo idênticos.
- ✅ `engine/osm.ts` original intocado — `osmDatasetToRoadsFit`
  e helpers seguem exportadas.
- ✅ Schema `.sicrocroqui` v0.3 — aditivo, sem migração.
- ✅ Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home —
  zero modificação.
- ✅ Sem renderer OSM paralelo (OSM usa o mesmo
  `RoadNetworkLayerV2` das vias manuais).
- ✅ Sem rasterização OSM (não viramos screenshot do Leaflet).
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

OSM agora é **dados de entrada**, não motor. O Adapter 2.0
limpa lat/lon do Overpass, classifica tags, detecta rotatórias
(por tag OU por geometria), preserva junctions via
`node_id → Vec2`, e devolve objetos do Road Engine 2.0 com
smoothing pré-calibrado. O motor existente (`RoadNetworkLayerV2`)
desenha tudo — vias OSM e manuais ficam **indistinguíveis no
render**, porque atravessam o mesmo pipeline. Road v1 segue
intacto; OSM força v2 ao importar.

**Aguardando validação visual do perito** com o mesmo local que
reprovou no Round 5 do MVP 10.

---

**Reiterando a instrução do usuário:** Fase G **não cria commit**,
**não faz merge** e **não cria tag**. Aguardando validação visual
antes de avançar para Fase H (debug overlay) ou outro ciclo.
