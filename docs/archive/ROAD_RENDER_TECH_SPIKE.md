# Road Render Tech Spike — Konva vs SVG vs PixiJS

**Data:** 2026-05-26
**Status:** Lab implementado. **Aguardando validação visual do perito** antes de recomendar tecnologia.
**Branch:** `mvp/osm-road-import` (mesmo branch da Fase G; spike é isolado em `src/modules/croqui/spikes/road-render-lab/` e não toca em nada do app real).

---

## 1. Como rodar o lab

1. `pnpm tauri dev` (ou `pnpm dev` para web preview).
2. No navegador / janela Tauri, navegar para a URL com hash:
   - Dev: `http://localhost:1420/#spike=road-render-lab`
   - Em qualquer outra rota, basta adicionar o hash.
3. O lab renderiza em **fullscreen** no lugar do app — zero impacto no resto.
4. Para sair: remover o hash da URL e recarregar.

Acesso é **isolado por feature flag de URL** — não há botão no app real apontando pra cá, e o lab não modifica documentos, settings ou storage.

---

## 2. Modelo simplificado em teste

Os dois renderers compartilham o MESMO modelo de dados (paridade Python):

```typescript
interface LabRoad {
  id: string;
  ax, ay, bx, by: number;        // âncoras (mundo, metros)
  cx1, cy1, cx2, cy2: number;    // controles Bezier
  largura_m: number;              // metros — não pixels
  superficie: "asfalto" | "calcada" | "terra";
  mao_dupla: boolean;
  marcacao: "amarela" | "branca" | "nenhuma";
}

interface LabRoundabout {
  id: string;
  cx, cy: number;
  r_m: number;
  largura_m: number;
  superficie: "asfalto";
}
```

**8 campos por via, 6 por rotatória.** Sem `lane_count`, sem `smoothing.mode`, sem `markings.color`, sem `curb.color`, sem `inner_color`. Cores hardcoded no renderer (paleta SICRO 1.0 do `editor_croqui.py`).

---

## 3. Fixtures de teste (6 cenas obrigatórias)

1. **Via curva única** — Bezier em S. Testa: ribbon polygon em curva, edges suaves, tracejado seguindo curva.
2. **Via em U (retorno)** — Bezier dobra 180°. Testa: auto-cruzamento de ribbon no ápice.
3. **Cruzamento X** — 4 vias arteriais convergindo no centro. Testa: clipping de marcações nas junções.
4. **Cruzamento T** — horizontal contínua + vertical chegando. Testa: clipping do eixo central da contínua.
5. **Rotatória + 4 vias** — anel central + cardeais. Testa: anel + ilha verde, vias clipam contra anel.
6. **Macapá-like** — divided carriageway + rotatória + 4 vias variadas. Testa: caso real reprovado.

---

## 4. As duas implementações em uma frase

### Konva (`spikes/road-render-lab/konva/KonvaRoadRenderer.tsx`)
- `Konva.Line(closed=true, tension=0.5, fill=...)` para polígono suave de asfalto + calçada.
- `Konva.Circle` para anel e ilha da rotatória.
- `Konva.Line(stroke + dash)` para bordas e eixo central.
- **Clipping geométrico** (`clipPolylineAgainstPolygons`) recorta as marcações antes de gerar os `<Line>`.

### SVG (`spikes/road-render-lab/svg/SvgRoadRenderer.tsx`)
- `<path d="M ax,ay C cx1,cy1 cx2,cy2 bx,by">` — **Cubic Bezier nativa** do navegador (sem amostragem).
- `<polygon>` ou `<path>` polígono pra asfalto + calçada (mesma matemática do Konva).
- `<circle>` pra rotatória.
- `<path stroke-dasharray="12 8" vector-effect="non-scaling-stroke">` para marcação tracejada.
- **Mesmo clipping geométrico** que Konva (compartilha `clipping.ts`).

---

## 5. As 10 perguntas — respostas preliminares

Estas respostas são as expectativas técnicas. A coluna "validação visual" será preenchida APÓS o perito rodar o lab. Sem juízo de valor antecipado.

| # | Critério | Konva — expectativa | SVG — expectativa | Validação visual |
|---|---|---|---|---|
| 1 | A curva fica bonita? | Boa via amostragem 48 pontos + `tension=0.5` (Catmull-Rom interno). Mas curva é **aproximada** por polyline. | **Perfeita** — Cubic Bezier nativa do path. Browser rasteriza vetorialmente. | A definir |
| 2 | A rotatória fica bonita? | Boa — `Konva.Circle` é antialiased nativo. | Igualmente boa — `<circle>` antialiased. | A definir — esperado empate |
| 3 | A interseção fica limpa? | Depende do `clipPolylineAgainstPolygons`. Funciona se polígonos estão corretos. | Idem — mesmo algoritmo. | A definir |
| 4 | O tracejado fica proporcional? | `Konva.Line.dash=[12,8]` em **px de tela** — escala com zoom Konva. | `stroke-dasharray="12 8"` + `vector-effect="non-scaling-stroke"` — **fixo em px**. | Konva pode escalar; SVG não. A validar comportamento sob zoom. |
| 5 | Dá pra exportar PNG com qualidade? | `stage.toDataURL()` nativo Konva. Pixel ratio configurável. | `<svg>` → serialize → `Image` → `<canvas>.drawImage` → `toDataURL`. Mais código mas funciona. | A definir |
| 6 | Dá pra selecionar e editar handles? | `Konva.Line.onClick` + drag em `Konva.Circle`. Nativo. | `<path onClick>` + drag em `<circle>` via React state. Funciona, mas event model do React é menos fluido em drag contínuo de alta freq. | Konva tem vantagem em interação interativa. |
| 7 | Dá pra manter performance? | Bom para 100+ objetos. Layer system + hit caching nativo. | Bom para 10-50 objetos (o caso de croqui). 100+ vias começa a lentar (cada `<path>` é elemento DOM). | Para 10-50 vias típicas → ambos OK. |
| 8 | Dá pra integrar ao Tauri/React? | Já está integrado no app — zero fricção. | Nativo do navegador, sem deps. Trivial em React (JSX). | Empate. |
| 9 | Dá pra integrar ao laudo/exportação? | PNG técnico/limpo via `stage.toDataURL()`. Funciona hoje. | PNG via serialize + canvas. Funciona, mas requer adapter. SVG nativo também pode ir DIRETO pro PDF do laudo (mais leve que PNG raster). | SVG tem upside no PDF do laudo. |
| 10 | Qual é o risco real? | Curva amostrada (não vetorial). Em zoom alto pode aparecer "facetada". Componentização React-Konva tem overhead em re-renders. | Performance com muitos objetos. Comportamento de `vector-effect` em export PNG (pixel ratio do canvas pode escalar dash inesperado). | A validar. |

---

## 6. PixiJS — por que não está no spike

PixiJS é WebGL/Canvas2D híbrido voltado para:
- jogos 2D com 1000+ sprites.
- visualização de dados pesada (gráficos com 10⁵ pontos).
- animação intensiva 60fps com filtros GPU.

**Croqui pericial tem:** 10-50 objetos, sem animação contínua (só drag esporádico), exportação PNG limpa, integração React.

**O ganho de PixiJS sobre Konva nesse cenário é zero.** O custo de integração é alto:
- API mais low-level (sem scene graph high-level como Konva).
- `pixi-react` existe mas é menos maduro que `react-konva`.
- Export PNG via WebGL canvas precisa de cuidado com pixel ratio + premultiplied alpha.
- Hit testing manual (Pixi tem mas a integração com React state é menos natural).

**Decisão:** **não implementar PixiJS no spike.** Se durante a validação tanto Konva quanto SVG falharem em algum critério crítico (o que é improvável), eu volto, codo PixiJS de igual pra igual, e reabro o spike. Mas começar com os 2 que têm maior probabilidade de vencer.

Se você discordar e quiser PixiJS implementado, me avise — adiciono.

---

## 7. O que cada renderer mostra (descrição visual textual)

Como gerar prints automaticamente não faz parte do meu output, descrevo o que cada implementação produz visualmente para cada fixture. **A validação real do perito vai confirmar/refutar.**

### Fixture 1 — Via curva
- **Konva:** ribbon suavizado por Catmull-Rom. 48 pontos amostrados + `tension=0.5` no `Konva.Line(closed=true)`. O navegador rasteriza um polígono fechado de 96 vértices com smooth — visualmente uma curva contínua, mas tecnicamente discretizada.
- **SVG:** path com `C` (cubic Bezier) — **uma única curva vetorial**. O navegador rasteriza no momento do paint, sempre na resolução nativa do canvas. Em zoom out parece igual ao Konva; em zoom **muito** alto, SVG mantém suavidade enquanto Konva pode mostrar facetas dos 48 pontos.

### Fixture 2 — Via em U
- **Konva:** o ribbon offset perpendicular pode auto-cruzar no ápice do U se a curvatura for forte. O `buildEdges` simples não corrige isso.
- **SVG:** mesmo problema, mesma matemática. Ambos sofrem igualmente.
- **Diferença crítica:** se decidirmos depois usar `buildRibbonPolygonRobust` (loop removal), ambos passam a funcionar.

### Fixture 3 — Cruzamento X
- **Konva:** marcação amarela tracejada de cada via, clipada contra os polígonos das outras 3 vias via `clipPolylineAgainstPolygons` — vira segmentos curtos com gaps no centro do X.
- **SVG:** idêntico — mesmo algoritmo.
- **Bordas brancas das vias:** também clipadas — recortam-se no centro do X.

### Fixture 4 — Cruzamento T
- **Konva:** eixo da horizontal é cortado no ponto onde a vertical chega. Eixo da vertical termina exato na borda da horizontal.
- **SVG:** idem.

### Fixture 5 — Rotatória + 4 vias
- **Konva:** 4 vias arteriais terminam no perímetro do anel (start/end definidos nas fixtures). Marcações clipadas contra o disco da rotatória. Ilha verde sólida.
- **SVG:** idem. `<circle>` nativo SVG produz anel perfeito (sem amostragem).

### Fixture 6 — Macapá-like
- **Konva:** Avenida Manoel Torrinha aparece como 2 ribbons paralelos com gap de 6 m entre (canteiro). Rua Renascimento curva pro NE. Rua Principal sul. Rua Socialismo SE. Rotatória centro com ilha verde + bordas brancas. **Tracejado amarelo APENAS** na Av. Renascimento e (se mão_dupla=true) na Av. Manoel Torrinha; brancas nas residenciais.
- **SVG:** idem. **Provável vantagem visual:** as curvas da Renascimento ficam mais suaves em zoom alto.

---

## 8. Recomendação preliminar (a ser validada pelo perito)

Olhando os 10 critérios e o caso de uso (croqui pericial, 10-50 vias, exportação PNG/PDF, edição interativa):

**Empate técnico em 8 dos 10 critérios.** As diferenças:

- **Crit. 1 (curva)** — SVG vence pela Bezier nativa em zoom alto.
- **Crit. 9 (laudo/PDF)** — SVG pode ir DIRETO pro PDF do laudo via `<embed>` ou rasterização do renderer PDF. Konva exige passagem por PNG.

**Konva vence em:**
- Crit. 6 (handles interativos): event model nativo, drag fluido.
- Custo de migração: zero (já está integrado).

**A recomendação técnica neutra é:** Konva atende. SVG **provavelmente** entrega visual ligeiramente melhor em zoom alto + integração mais natural com export PDF. **A decisão final é visual** — quando você rodar o lab e ver lado a lado, vai dar pra dizer qual parece "rua de verdade".

**Se as duas implementações empatarem visualmente:** mantém Konva, simplifica o motor (Fase H propriamente dita).

**Se SVG vencer claramente:** migra para SVG. Custo: ~3-5 dias adicionais de port do app real (não do lab).

**Se Konva vencer claramente:** mantém Konva, simplifica o motor.

---

## 9. Próximos passos (após validação visual)

Independentemente da tecnologia escolhida, a próxima fase é a **simplificação do motor**:

1. Reduzir `SicroRoadObject` para os 8 campos do lab.
2. Reduzir `SicroRoundaboutObject` para os 6 campos do lab.
3. Substituir `junctionPatches` + `network` pelo `clipPolylineAgainstPolygons`.
4. Forçar `largura_m` (metros) em vez de `width` (pixels) no schema.
5. Migration coerciva pros documentos antigos.
6. Remover Road v1 + Road v2 quando o novo motor estiver aprovado.

Estimativa: ~7-12 dias úteis. Pode estourar.

---

## 10. Limitações honestas do spike

- **Sem teste de performance real.** O lab roda 1 cena de cada vez; em produção pode ter 30+ vias + R1/R2 + veículos + vestígios simultaneamente.
- **Sem teste de export PDF** integrado ao laudo (apenas PNG isolado).
- **Sem teste de drag de handle ao vivo** — Konva e SVG estão estaticamente renderizados; o lab não implementa drag (apenas seleção via clique).
- **Sem fixtures patológicas** (vias paralelas extremamente próximas, retornos apertados, mais de 6 vias no mesmo cruzamento).
- **`bezierToSvgPathD`** está exposto mas o renderer SVG atual usa polygon offset (igual Konva) para o asfalto — não usa o path Bezier diretamente para o ribbon. **Próxima iteração:** usar `<path>` com offset stroke (`stroke-width="largura_m × zoom"`, `stroke-linecap="butt"`) que renderiza o ribbon como traço da Bezier nativa, sem polygon offset. Pode ser mais limpo.

---

## 11. Como você decide

Rode o lab. Olhe as 6 fixtures em "Konva | SVG (lado a lado)". Olhe especialmente a Macapá-like, que é o caso real. Considere:

1. **Qual lado parece mais "rua de verdade"?** Não "qual é mais técnico" — qual parece mais um croqui pericial pronto.
2. **Qual lado tem visual mais limpo nas junções?**
3. **Qual lado tem tracejado mais coerente?**
4. **Qual lado tem rotatória mais convincente?**
5. **Qual lado responde melhor ao zoom?**

Sua resposta vai me dizer a tecnologia. Não vou recomendar pré-aprovação sem você ver.

**Aguardando validação visual.**
