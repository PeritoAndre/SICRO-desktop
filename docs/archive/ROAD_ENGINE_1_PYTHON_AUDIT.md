# ROAD ENGINE 1.0 (Python) — Auditoria

**Objetivo:** entender por que o SICRO 1.0 Python desenha vias com qualidade
superior ao SICRO 2.0 TypeScript+Konva atual, **antes** de portar.

**Origem auditada:**
`C:\Users\perit\OneDrive\Documentos\SICRO` (commit local, ~50 arquivos
Python, leitura realizada em 2026-05-25).

**Status:** auditoria entregue para validação. **Sem código novo no
SICRO 2.0 nesta etapa.** Aguardo aprovação do redesign antes de codar.

---

## 1. Onde está o motor Python

Cinco arquivos respondem por TODO o desenho de vias:

| Arquivo | Função |
|---|---|
| `desenho/spline_via.py` | Geometria pura da via (cubic Bezier, offsets, polygon de pista, bordas) |
| `desenho/osm_via.py` | OSM → `_via_spline` (consulta Overpass, projeta, faz fit Bezier, clipa no raio, detecta rotatória) |
| `desenho/via_elementos.py` | Renderer de elementos antigos baseados em rectangle (`_asfalto`, `_calcada`, `_rotatoria`) — caminho legado, não é o "bom" |
| `desenho/superficies.py` | Catálogo de superfícies (asfalto, terra, etc.) com cores + spec de calçada |
| `ui/editor_croqui.py` | **Renderer multi-passada de `_via_spline` + `_rotatoria` — onde a mágica acontece** (`_desenhar_vias_multipass`, linha 2810) |

E o suporte:
- `osm_nucleo.py` — projeção lat/lon → metros + azimute (equiretangular local; ~200 m de raio sem distorção perceptível)
- `config.py` — registro dos tipos de elemento

---

## 2. Modelo de dados da via

A via no SICRO 1.0 é um dicionário **simples e fixo**:

```python
{
  "tipo": "_via_spline",
  "x": ax, "y": ay,       # âncora inicial (mundo, metros)
  "x2": bx, "y2": by,     # âncora final
  "cx1": ..., "cy1": ...,  # controle 1 (Bezier cúbica)
  "cx2": ..., "cy2": ...,  # controle 2
  "largura": 7.0,          # metros
  "superficie": "asfalto",
  "mao_dupla": True,
  "marcacao": "amarela",   # "amarela" | "branca" | "nenhuma"
  "calcada": True,
  "calcada_larg": 2.0,
}
```

**Apenas 4 pontos** descrevem a via toda. Não há "polyline com N nós".

Rotatórias têm modelo separado:

```python
{
  "tipo": "_rotatoria",
  "cx": ..., "cy": ...,    # centro (mundo)
  "r": 30.0,                # raio
  "largura": 8.0,           # largura do anel
  "superficie": "asfalto",
}
```

**Rotatória é objeto geométrico dedicado** — não um polyline aproximando círculo.

---

## 3. Como a spline é calculada

`desenho/spline_via.py:20` — `bezier_pontos(...)` amostra a cúbica em N+1 pontos
(N=24 a 48 conforme o caso):

```python
B(t) = (1-t)³ P0 + 3(1-t)²t P1 + 3(1-t)t² P2 + t³ P3
```

`P0`, `P3` = âncoras; `P1`, `P2` = controles. Resultado: uma lista
flat `[x0,y0,x1,y1,...]` que é a **centerline** da via.

---

## 4. Como a pista (asfalto) é desenhada — o segredo

`spline_via.py:154` — `faixa_para_canvas(el, n=28)`:

```python
def faixa_para_canvas(el, n=28):
    # 1. Amostra a Bezier em (n+1) pontos → centerline
    eixo = bezier_pontos(...)
    pts = [(eixo[i], eixo[i+1]) for i in range(0, len(eixo), 2)]
    meia = el["largura"] / 2.0
    esq, dir_ = [], []

    # 2. Para cada ponto, computa a TANGENTE local (vetor diferença
    #    centrado entre vizinhos) e o NORMAL (perpendicular escalado
    #    pela meia-largura).
    for i, (x, y) in enumerate(pts):
        if i == 0:
            ax, ay = pts[1][0]-x, pts[1][1]-y
        elif i == len(pts)-1:
            ax, ay = x-pts[i-1][0], y-pts[i-1][1]
        else:
            ax = pts[i+1][0]-pts[i-1][0]
            ay = pts[i+1][1]-pts[i-1][1]
        comp = math.hypot(ax, ay) or 1.0
        px, py = -ay/comp*meia, ax/comp*meia
        esq.append((x+px, y+py))
        dir_.append((x-px, y-py))

    # 3. Concatena lado esquerdo + lado direito invertido →
    #    POLÍGONO FECHADO (ribbon).
    poli = esq + dir_[::-1]
    return [coord for p in poli for coord in p]
```

E no renderer (`editor_croqui.py:2942`):

```python
c.create_polygon(tfx, fill=cor_asf, outline="",
                 smooth=True, joinstyle="round")
```

**`smooth=True` no Tkinter aplica interpolação Catmull-Rom à
fronteira do polígono.** O resultado: um polígono fechado cuja
borda é uma curva suave, sem cantos.

**Esta é a chave técnica.** O Python desenha a via como
**ribbon polygon suavizado**. O SICRO 2.0 desenha como
`Konva.Line` stroke grosso — visualmente diferente, principalmente
em curvas e junções.

---

## 5. Como as bordas brancas são desenhadas

`spline_via.py:92` — `bordas_canvas(el, n=30)`:

Mesma matemática que `faixa_para_canvas`, mas devolve as duas
polylines abertas (esquerda e direita) ao invés do polígono
fechado.

No renderer (`editor_croqui.py:2977`):

```python
esq_w, dir_w = _sp.bordas_canvas(el, 48)
for borda_w in (esq_w, dir_w):
    for run in _segs(borda_w, vi):    # 🔑 MASCARAMENTO
        c.create_line(run, fill="#FFFFFF", width=2, capstyle="butt")
```

`_segs` é o **mascaramento geométrico** — segmenta a borda em
"runs" que **NÃO** caem dentro do corpo de outras vias (mais sobre
isso em §7).

---

## 6. Como a marcação central é desenhada

```python
marcacao  = el.get("marcacao", "amarela")
mao_dupla = el.get("mao_dupla", True)
if marcacao != "nenhuma":
    eixo_w = _sp.pontos_para_canvas(el, 48)   # centerline samples
    cor_mc = "#F5C518" if (mao_dupla and marcacao == "amarela") else "#FFFFFF"
    for run in _segs(eixo_w, vi):
        c.create_line(run, fill=cor_mc, width=2,
                      dash=(12, 8), capstyle="butt")
```

A centerline é amostrada da MESMA Bezier (não recalculada). É
**clipada por `_segs`** contra todas as outras vias. Resultado:
no encontro com outra via, a marcação central some
automaticamente sem precisar de "junction polygon".

---

## 7. Interseções — o mecanismo de mascaramento (`_segs`)

`editor_croqui.py:2868`:

```python
def _segs(pts_flat, meu_vi):
    """Divide flat mundo em runs de tela, pulando pontos
       dentro de outras vias."""
    runs = []; run = []
    for ii in range(len(pts_flat) // 2):
        wx, wy = pts_flat[2*ii], pts_flat[2*ii+1]
        sx, sy = self._mt(wx, wy)
        if _em_outra(wx, wy, meu_vi):
            if len(run) >= 4: runs.append(run)
            run = []
        else:
            run.extend([sx, sy])
    if len(run) >= 4: runs.append(run)
    return runs
```

E `_em_outra` (`editor_croqui.py:2851`):

```python
def _em_outra(wx, wy, meu_vi):
    """True se (wx,wy) está dentro da faixa de asfalto de outra via."""
    # Rotatórias: dentro do disco?
    for rcx, rcy, r_out in _rot_mask:
        if (wx-rcx)**2 + (wy-rcy)**2 <= r_out*r_out:
            return True
    # Vias spline: distância ao centerline de outra via < meia-largura?
    for vi2, (pts, meia, ...) in _via_eixos.items():
        if vi2 == meu_vi: continue
        if not_in_aabb(...): continue       # AABB rápido
        for si in range(len(pts) - 1):
            x1,y1 = pts[si]; x2,y2 = pts[si+1]
            if _dist_seg(wx, wy, x1,y1, x2,y2) < meia:
                return True
    return False
```

**Esta é a outra diferença crítica.** O SICRO 1.0:
- pré-computa centerlines + meia-largura + AABB de TODAS as vias
- para cada ponto de uma borda ou centerline de uma via, testa se
  ele cai dentro de **qualquer outra via** (geométrico real, não
  círculo)
- segmenta a polyline em "runs" — só desenha onde NÃO há
  sobreposição
- AABB pré-filter dá performance aceitável para ~50 vias

O SICRO 2.0 atual usa `clipPolylineAgainstCircles` com **círculos**
em torno dos pontos de cruzamento. Aproximação grosseira: o círculo
às vezes corta menos do que deveria (deixa "marcação atravessando"
no encontro Y) ou mais (some marcação útil).

---

## 8. Rotatórias

`osm_via.py:230` — `_rotatoria_da_way(v, lat, lon, raio_cena)`:

```python
# Centroide + raio médio dos nós do way circular
cx = sum(x for x,y in pts) / len(pts)
cy = sum(y for x,y in pts) / len(pts)
r  = sum(math.hypot(x-cx, y-cy) for x,y in pts) / len(pts)
```

Resultado: rotatória vira **objeto geométrico** (`_rotatoria` com
`cx`, `cy`, `r`, `largura`), não polyline aproximando círculo.

Renderer (`editor_croqui.py:2954`):

```python
# Asfalto: dois ovais concêntricos
r_out = (el["r"] + meia_rot) * zoom
r_in  = max(0, el["r"] - meia_rot) * zoom
c.create_oval(sx-r_out, sy-r_out, sx+r_out, sy+r_out,
              fill="#1C1C1C", outline="")
if r_in > 1:
    c.create_oval(sx-r_in, sy-r_in, sx+r_in, sy+r_in,
                  fill="#3A6535", outline="")   # ilha verde
```

E bordas (`editor_croqui.py:2999`):

```python
# Borda externa amostrada em 72 pontos, mascarada por _segs_circ
# (mascara contra ways que conectam à rotatória)
for ii in range(N_CIRC + 1):
    ang = 2*pi*ii / N_CIRC
    flat_out.extend([cx + r_out*cos(ang), cy + r_out*sin(ang)])
for run in _segs_circ(flat_out):
    c.create_line(run, fill="#FFFFFF", width=2)
```

**Por isso a rotatória do Python fica limpa.** Ela é um **círculo
real** (Tkinter `create_oval` desenha primitiva geométrica), não
um polígono aproximado.

---

## 9. OSM → `_via_spline` (`osm_via.py`)

Para cada way OSM:

1. **Projeta** todos os nós para coordenadas planas locais
   (`_projetar`, equiretangular com correção `cos(lat0)`).
2. **Clipa ao raio** (`_clipar_no_raio`) — calcula entrada/saída do
   círculo da cena para que vias com nós esparsos não sumam.
3. **Reduz para 4 pontos** (`_pontos_para_spline`):
   - Pega o primeiro e o último ponto da polyline clipada
     → âncoras A e B.
   - Calcula tangente inicial (1º segmento) e tangente final
     (último segmento).
   - **Comprimento total do arco** = soma dos segmentos.
   - Controles: `C1 = A + tan_A · arc/3`, `C2 = B − tan_B · arc/3`.
   - Esta é a fórmula clássica Hermite→Bezier que minimiza
     desvio para vias razoavelmente retas ou levemente curvas
     (típico em 50-200 m de raio).

Cada way OSM vira **1 spline** com 4 pontos. **Não preserva todos
os nós OSM.** Essa redução é o que torna a forma final "limpa" —
em vez de respeitar o trêmulo do OSM, o Python suaviza para uma
curva pura.

Rotatórias: detectadas por `tags.junction == "roundabout"` e
viram objeto `_rotatoria` (não spline).

---

## 10. Escala / projeção

`osm_nucleo.py` e `osm_via.py` usam projeção **equiretangular local**:

```python
x = R_TERRA * radians(lon - lon0) * cos(rlat0)
y = R_TERRA * radians(lat - lat0)
```

Resultado em **metros** (não pixels). A escala visual vem do
`zoom` aplicado no momento do render, não da projeção. Centralização
faz subtração simples do centroide da bbox.

Inversão Y aplicada (`y = -y`) para que Norte fique no topo.

---

## 11. Por que o SICRO 1.0 fica melhor (resumo técnico)

| Aspecto | Python 1.0 (bom) | TS 2.0 (atual, ruim) |
|---|---|---|
| **Modelo de via** | Cubic Bezier 4-pontos (A, B, C1, C2) | Polyline N-pontos (preserva todos os nós OSM) |
| **Asfalto** | **Polígono ribbon fechado** com `smooth=True` (cubic interpolation na borda) | `Konva.Line(stroke)` grosso com `tension` (suaviza só visualmente, geometria é stroke center) |
| **Bordas** | Polylines abertas (esquerda/direita) **mascaradas** por distância a outros centerlines | Polylines com clipping circular nos pontos de cruzamento |
| **Mascaramento** | **Geométrico real:** distância a centerline alheio < meia-largura → drop | Aproximação por **círculos** nas interseções |
| **Marcação central** | Mesmo amostragem da centerline + mesmo mascaramento | Idem (correto em conceito, mas o mask é o circular) |
| **Rotatória** | **Primitiva geométrica** (`create_oval` = círculo real) | Polyline aproximando círculo + closed=true |
| **Roundabout border** | Amostrada em 72 pontos + mascarada contra vias conectadas | Stroke da Konva.Line(closed) com cap=butt |
| **Smoothing OSM** | Reduz para 4 pontos → curva pura | Mantém todos os pontos → trêmulo OSM aparece |
| **Render strategy** | **4 passadas** (calçada → asfalto → marcações → handles), com ordem garantida | Camadas Konva, mas asfalto e markings ficam sobrepostos sem mask geométrico |

### A diferença visual em 3 frases

1. **Polígono vs stroke.** Python desenha pista como polígono
   suavizado; TS desenha como stroke grosso. Em curvas e junções
   o polígono mantém forma e o stroke distorce.
2. **Mask geométrico vs mask circular.** Python descobre "este
   pixel está em outra via?" por distância real ao centerline
   alheio. TS descobre por "está dentro deste círculo?".
3. **Spline 4-pontos vs polyline N-pontos.** Python reduz cada
   way OSM a uma curva limpa. TS preserva o trêmulo OSM original.

---

## 12. O que portar para o SICRO 2.0

Em ordem de prioridade visual:

1. **`faixa_para_canvas` (ribbon polygon).** Substituir
   `Konva.Line(stroke)` por `Konva.Line(closed, smooth?)` ou
   `Konva.Path` com geometria de polígono ribbon. Cada via vira
   um polígono fechado de (2·N) vértices.
2. **`_segs` (mask geométrico).** Substituir
   `clipPolylineAgainstCircles` por
   `clipPolylineAgainstRoads(point → distance-to-other-centerlines)`.
   Pré-computar centerlines + AABBs para performance.
3. **Rotatória como primitiva.** Adicionar tipo
   `kind: "roundabout"` ou flag dedicada com (cx, cy, r, largura).
   Renderer usa `Konva.Circle` ou anel via dois `Konva.Arc`.
4. **OSM → 4-point Bezier.** Substituir `osmDatasetToRoadsFit` que
   preserva todos os nós por um conversor que computa A, B, C1,
   C2 conforme `_pontos_para_spline` (tangente inicial + tangente
   final + arc/3).
5. **Multi-pass renderer.** Reorganizar `RoadNode` em 4 passes
   explícitos: calçada → asfalto → marcações → handles. Cada
   pass desenha TODAS as vias antes de a próxima começar (não é o
   z-order natural por objeto).

---

## 13. O que NÃO portar

1. **Tkinter `smooth=True`.** Não existe equivalente direto no
   Konva. Será necessário **pré-amostrar a Bezier em N pontos**
   (`bezier_pontos`) e desenhar o polígono com `Konva.Line(closed,
   tension=0)` sobre os pontos amostrados — a suavização vem da
   AMOSTRAGEM densa, não de uma flag de render.
2. **`create_polygon` com outline diferente de fill.** Konva
   trata stroke/fill separadamente; usamos `stroke=null` para
   manter mesmo efeito.
3. **Layout de "elementos" do `editor_croqui.py`.** A arquitetura
   TS já tem `SicroRoadObject` + `RoadNode`. Não vamos copiar a
   dict-based-elements; só portar os algoritmos.
4. **Algumas constantes de cor.** O TS já tem paleta própria. Os
   tons exatos (#1C1C1C asfalto, #F5C518 marcação amarela, etc.)
   podem ser portados como defaults se ajudarem a chegar próximo
   do visual do Python.

---

## 14. Resposta direta às 15 perguntas pedidas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Arquivos que desenham vias | `desenho/spline_via.py`, `desenho/osm_via.py`, `ui/editor_croqui.py:_desenhar_vias_multipass` |
| 2 | Classe/função que representa a via | `nova_spline(...)` retorna dict; `_via_spline` é o "tipo" |
| 3 | Como armazena | Dict de 4 pontos (A, B, C1, C2) + largura + superfície + marcação |
| 4 | Como calcula spline | Cubic Bezier amostrada em N pontos via `bezier_pontos(t)` |
| 5 | Como aplica largura | Para cada ponto amostrado, normal perpendicular escalado por `largura/2` |
| 6 | Bordas | `bordas_canvas` retorna polylines E/D; renderizadas como `create_line` mascaradas |
| 7 | Linha central | Amostragem da Bezier + cor amarela/branca + dash (12, 8) + mask |
| 8 | Interseções | **Mascaramento geométrico**: cada ponto da borda/centerline testa distância a TODOS os outros centerlines |
| 9 | Rotatórias | Objeto dedicado `_rotatoria(cx, cy, r, largura)` desenhado como 2 ovais concêntricos + 1 borda amostrada mascarada |
| 10 | Importação OSM | `osm_via.gerar_vias_osm`: Overpass → projeta → clipa raio → 1 spline por way (4 pontos) |
| 11 | OSM → desenho | Way OSM vira `_via_spline` (Bezier 4-pontos) ou `_rotatoria` (cx, cy, r) |
| 12 | Técnica | **Polígono ribbon + smooth=True** (Tkinter cubic interpolation) com **multi-pass + mask geométrico** |
| 13 | Por que ficou melhor | (a) Polígono em vez de stroke, (b) mask por distância real em vez de círculo, (c) rotatória como primitiva, (d) OSM reduzido a 4 pontos |
| 14 | O que portar | Ribbon polygon, mask geométrico, rotatória como tipo dedicado, OSM 4-point Bezier, multi-pass |
| 15 | O que NÃO portar | `smooth=True` (substituir por amostragem densa), arquitetura dict-based-elements (usar SicroRoadObject existente), algumas constantes de cor (manter paleta SICRO 2.0) |

---

## 15. Próximos passos (a aprovar antes de codar)

A próxima ação será escrever `ROAD_ENGINE_2_REDESIGN_PLAN.md`
detalhando:

- novo módulo `src/modules/croqui/engine/road-v2/`
- novo schema `SicroRoadObject` v2 (4 pontos Bezier + largura + ...)
- novo `Konva` renderer multi-pass
- novo OSM converter que produz Bezier 4-pontos
- nova primitiva `RoundaboutObject`
- testes
- estratégia de migração de croquis salvos (manter compat com
  RoadObject atual de polyline N-pontos)

**Não vou começar a codar até esse plano estar aprovado.**

---

**Reiterando a instrução do usuário:** esta etapa é só auditoria.
**Sem commit, sem merge, sem tag, sem código novo no SICRO 2.0.**
Aguardando aprovação da auditoria + autorização para escrever
o plano de redesign.
