/**
 * OpenStreetMap scaffold (MVP 9 Road Engine Pro).
 *
 * This module defines the data structures and pure converters needed to
 * turn an OSM dataset (queried via Overpass or similar) into a list of
 * `SicroRoadObject`s. It deliberately does NOT make any network call —
 * that's a follow-up spike. The point of this scaffold is:
 *
 *   - Lock the type contract of an OSM ingest so the rest of the engine
 *     can be built against it before networking lands.
 *   - Provide a deterministic `highway=*` → `RoadStyle` mapping covering
 *     the most common Brazilian classifications.
 *   - Project lon/lat to canvas coordinates given a bounding box (the
 *     "viewport" the user pans/zooms to in the future map widget).
 *
 * Everything here is pure — easy to test, no DOM, no Tauri, no fetch.
 */

import { makeRoad } from "./factories";
import type {
  RoadStyle,
  SicroPoint,
  SicroRoadObject,
} from "./schema";

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

/**
 * Convert one OSM way into a `SicroRoadObject` ready to drop into the
 * croqui. Returns null when the way is too short to be a road
 * (fewer than 2 nodes after projection) or doesn't have a `highway` tag
 * — we ignore non-roads here on purpose, the caller can filter the
 * way list before calling.
 */
export function osmWayToRoad(
  way: OsmWay,
  nodes: Map<number, OsmNode>,
  view: OsmViewport,
): SicroRoadObject | null {
  if (!way.tags.highway) return null;
  const points = projectWay(way, nodes, view);
  if (points.length < 4) return null;
  const style = osmTagToRoadStyle(way.tags);
  const lanes = osmLanesHint(way.tags);
  const road = makeRoad(points, style, {
    subtype: "osm_way",
    metadata_json: JSON.stringify({
      osm_id: way.id,
      tags: way.tags,
    }),
  });
  if (lanes && lanes !== road.lane_count) {
    return { ...road, lane_count: lanes };
  }
  return road;
}

/**
 * Convert a complete OSM dataset (nodes + ways) into a list of road
 * objects projected to canvas. Ways without a `highway` tag are
 * silently dropped.
 */
export function osmDatasetToRoads(
  ways: OsmWay[],
  nodes: OsmNode[],
  view: OsmViewport,
): SicroRoadObject[] {
  const nodeIndex = new Map<number, OsmNode>();
  for (const n of nodes) nodeIndex.set(n.id, n);
  const out: SicroRoadObject[] = [];
  for (const w of ways) {
    const r = osmWayToRoad(w, nodeIndex, view);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Reserved for a future spike: query the Overpass API for a bounding
 * box and return parsed nodes + ways. Kept here as a stub so the rest
 * of the engine can reference the contract.
 *
 * @example
 *   const data = await fetchOverpassBBox({
 *     min_lat: -0.34, max_lat: -0.32,
 *     min_lon: -51.07, max_lon: -51.05,
 *   });
 */
export async function fetchOverpassBBox(_bbox: {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}): Promise<{ nodes: OsmNode[]; ways: OsmWay[] }> {
  throw new Error(
    "OSM fetch not implemented yet — this is the Road Engine Pro scaffold. " +
      "See `osm.ts` for the contract; wire Overpass in a follow-up spike.",
  );
}
