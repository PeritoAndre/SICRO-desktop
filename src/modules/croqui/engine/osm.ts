/**
 * OpenStreetMap utilities — types + projeções compartilhadas pela
 * importação OSM.
 *
 * Fase S — Removidas as funções v1 `osmWayToRoad` e `osmDatasetToRoads`
 * (geravam `SicroRoadObject` do engine v1). A conversão OSM → road
 * agora vive 100% em `road-parity/osmAdapter.ts` (Python Parity Engine).
 *
 * Este módulo retém apenas o que é **fonte-agnóstica de motor**:
 *   - Tipos compartilhados (OsmNode, OsmWay, OsmDataset, OsmViewport)
 *   - Helpers de classificação tag → estilo (osmTagToRoadStyle, osmLanesHint,
 *     osmOnewayToDirection)
 *   - Simplificação Douglas-Peucker (simplifyPolylineDP) — usada pelo
 *     adapter parity para reduzir nodes redundantes
 *   - Projeção lon/lat → canvas (projectLonLat, projectWay)
 *   - Stubs de fetchOverpassBBox / clearOverpassCache (a implementação
 *     real vive no `OsmImportModal`)
 *
 * Tudo aqui é puro — fácil de testar, sem DOM, sem Tauri, sem fetch real.
 */

import type { RoadDirection, RoadStyle, SicroPoint } from "./schema";

// Re-export pros consumers que importavam direto deste módulo.
// `schema.ts` permanece a fonte canônica.
export type { RoadDirection, RoadStyle };

/** A single OSM node — geographic point with stable id. */
export interface OsmNode {
  id: number;
  lat: number;
  lon: number;
}

/** A single OSM way — ordered list of node ids + tag bag. */
export interface OsmWay {
  id: number;
  node_refs: number[];
  tags: Record<string, string>;
}

/**
 * OSM dataset retornado pelo Overpass — bolha de nodes + ways.
 *
 * `from_cache` indica se o dataset veio do cache em memória do modal
 * (sem hit no Overpass). UI usa esse flag para mostrar "carregado do cache"
 * em vez de "baixado".
 */
export interface OsmDataset {
  nodes: OsmNode[];
  ways: OsmWay[];
  from_cache?: boolean;
}

/**
 * Bounding box used to project lon/lat onto canvas coordinates. The box
 * is *inclusive* and assumes a square mercator-ish mapping that's good
 * enough for forensic croquis at city scale (sub-km error tolerated).
 */
export interface OsmViewport {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  /** Canvas width/height in pixels we're projecting into. */
  width_px: number;
  height_px: number;
}

/**
 * Map an OSM `highway=*` tag to one of our `RoadStyle` presets.
 * Conservative — anything we don't recognise becomes `urban`.
 */
export function osmTagToRoadStyle(
  tags: Record<string, string>,
): RoadStyle {
  const h = tags.highway;
  if (!h) return "urban";
  switch (h) {
    case "motorway":
    case "trunk":
    case "primary":
    case "primary_link":
    case "motorway_link":
    case "trunk_link":
      return "highway";
    case "secondary":
    case "secondary_link":
      return "avenue";
    case "tertiary":
    case "tertiary_link":
    case "residential":
    case "living_street":
    case "unclassified":
      return "urban";
    case "service":
    case "parking_aisle":
      return "parking";
    case "track":
    case "path":
    case "footway":
    case "cycleway":
      return "dirt";
    default:
      return "urban";
  }
}

/**
 * Number of lanes hinted by the OSM `lanes=*` tag (when present and
 * parseable). Falls back to the road style's default by returning null.
 */
export function osmLanesHint(
  tags: Record<string, string>,
): number | null {
  const raw = tags.lanes;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Mapeia a tag `oneway=*` para um valor `RoadDirection`.
 *
 * Tabela OSM (https://wiki.openstreetmap.org/wiki/Key:oneway):
 *   - `yes`, `true`, `1`     → one_way
 *   - `-1`, `reverse`        → one_way (reverso — direction ignorada aqui)
 *   - `no`, `false`, `0`     → two_way
 *   - ausente                → unknown (assume bidirecional por padrão na UI)
 *
 * O sinal de reverso (`-1`) ainda conta como mão única — quem decidir
 * inverter o trace é o consumer (o parity adapter ignora o sinal).
 */
export function osmOnewayToDirection(
  tags: Record<string, string>,
): RoadDirection {
  const raw = tags.oneway;
  if (raw == null) return "unknown";
  const v = String(raw).trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "1" || v === "-1" || v === "reverse") {
    return "one_way";
  }
  if (v === "no" || v === "false" || v === "0") return "two_way";
  return "unknown";
}

/**
 * Project a lon/lat point onto canvas pixel coordinates inside the
 * given viewport. Pure linear interpolation — no projection distortion
 * correction, which is fine at city-block scale.
 */
export function projectLonLat(
  lat: number,
  lon: number,
  view: OsmViewport,
): SicroPoint {
  const dx = (lon - view.min_lon) / (view.max_lon - view.min_lon);
  // y inverted: top of canvas = max_lat (north).
  const dy = (view.max_lat - lat) / (view.max_lat - view.min_lat);
  return {
    x: dx * view.width_px,
    y: dy * view.height_px,
  };
}

/**
 * Project an entire OSM way's geometry onto canvas coordinates, given
 * the lookup table of nodes. Skips any node_ref that isn't present in
 * the index (defensive — OSM dumps are sometimes truncated).
 */
export function projectWay(
  way: OsmWay,
  nodes: Map<number, OsmNode>,
  view: OsmViewport,
): number[] {
  const out: number[] = [];
  for (const ref of way.node_refs) {
    const n = nodes.get(ref);
    if (!n) continue;
    const p = projectLonLat(n.lat, n.lon, view);
    out.push(p.x, p.y);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Douglas-Peucker — simplificação de polyline genérica.
//
// O algoritmo recursivo encontra o ponto mais distante do segmento entre
// os endpoints; se a distância > epsilon, divide e recurse; senão, descarta
// todos os intermediários. Preserva endpoints exatos — essencial para que
// o parity adapter mantenha ring fechado de rotatórias.
//
// Implementação iterativa via stack para evitar stack-overflow em ways
// gigantes (raro em OSM mas defensivo).

/** Ponto 2D mínimo — compatível com Vec2M do parity adapter. */
interface Vec2Like {
  x: number;
  y: number;
}

/**
 * Distância perpendicular do ponto `p` ao segmento `a→b`. Se `a == b`,
 * cai pra distância euclidiana ao ponto.
 */
function perpendicularDistance(p: Vec2Like, a: Vec2Like, b: Vec2Like): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return Math.hypot(px, py);
  }
  // Projeção escalar sobre o segmento, clampada a [0, 1] não é necessária
  // aqui — queremos a distância perpendicular à reta, não ao segmento.
  const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return num / Math.sqrt(lenSq);
}

/**
 * Simplifica uma polilinha pelo algoritmo de Douglas-Peucker.
 *
 * - `epsilon` < 0 ou polyline com < 3 pontos → retorna cópia rasa intacta.
 * - Preserva primeiro e último ponto sempre.
 * - Genérico sobre `T extends Vec2Like` para que o adapter possa passar
 *   seus Vec2M sem coerções.
 */
export function simplifyPolylineDP<T extends Vec2Like>(
  points: ReadonlyArray<T>,
  epsilon: number,
): T[] {
  if (points.length < 3 || epsilon <= 0) {
    return points.slice();
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // Stack de pares (lo, hi) — usa Int32Array seria mais rápido, mas
  // number[] é suficiente pra ways OSM (geralmente < 1000 nodes).
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const [lo, hi] = top;
    if (hi - lo < 2) continue;
    const a = points[lo] as T;
    const b = points[hi] as T;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpendicularDistance(points[i] as T, a, b);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx >= 0 && maxDist > epsilon) {
      keep[maxIdx] = 1;
      stack.push([lo, maxIdx]);
      stack.push([maxIdx, hi]);
    }
  }

  const out: T[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i] as T);
  }
  return out;
}

/**
 * Stub. A implementação real do fetch Overpass vive no modal `OsmImportModal`
 * (com cache em memória e timeout). Esta função fica aqui só pra preservar
 * o contrato esperado por código legado que ainda importa.
 */
export async function fetchOverpassBBox(_bbox: {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}): Promise<OsmDataset> {
  throw new Error(
    "OSM fetch stub — Overpass real impl é feita inline no OsmImportModal. " +
      "Importe diretamente lá se precisar.",
  );
}

/**
 * Cache opcional (limpa via `clearOverpassCache`) usado pelo modal — função
 * stub aqui pra preservar a API. O cache real está dentro do modal.
 */
export function clearOverpassCache(): void {
  // no-op: cache fica no modal
}
