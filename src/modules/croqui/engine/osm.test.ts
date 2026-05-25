/**
 * OSM scaffold — unit tests (MVP 9 Road Engine Pro).
 */

import { describe, expect, it } from "vitest";
import {
  fetchOverpassBBox,
  osmDatasetToRoads,
  osmLanesHint,
  osmTagToRoadStyle,
  osmWayToRoad,
  projectLonLat,
  projectWay,
  type OsmNode,
  type OsmViewport,
  type OsmWay,
} from "./osm";

const VIEW: OsmViewport = {
  min_lat: 0,
  max_lat: 1,
  min_lon: 0,
  max_lon: 1,
  width_px: 100,
  height_px: 100,
};

describe("osmTagToRoadStyle", () => {
  it("maps motorway/primary to highway", () => {
    expect(osmTagToRoadStyle({ highway: "motorway" })).toBe("highway");
    expect(osmTagToRoadStyle({ highway: "primary" })).toBe("highway");
    expect(osmTagToRoadStyle({ highway: "trunk_link" })).toBe("highway");
  });
  it("maps secondary to avenue", () => {
    expect(osmTagToRoadStyle({ highway: "secondary" })).toBe("avenue");
  });
  it("maps residential / tertiary to urban", () => {
    expect(osmTagToRoadStyle({ highway: "residential" })).toBe("urban");
    expect(osmTagToRoadStyle({ highway: "tertiary" })).toBe("urban");
  });
  it("maps track/path/footway to dirt", () => {
    expect(osmTagToRoadStyle({ highway: "track" })).toBe("dirt");
    expect(osmTagToRoadStyle({ highway: "footway" })).toBe("dirt");
  });
  it("falls back to urban for unknown / missing tags", () => {
    expect(osmTagToRoadStyle({})).toBe("urban");
    expect(osmTagToRoadStyle({ highway: "weird_new_tag" })).toBe("urban");
  });
});

describe("osmLanesHint", () => {
  it("parses an integer when present", () => {
    expect(osmLanesHint({ lanes: "4" })).toBe(4);
  });
  it("returns null when absent or unparseable", () => {
    expect(osmLanesHint({})).toBeNull();
    expect(osmLanesHint({ lanes: "abc" })).toBeNull();
    expect(osmLanesHint({ lanes: "0" })).toBeNull();
  });
});

describe("projectLonLat", () => {
  it("projects the bbox top-left to (0,0)", () => {
    const p = projectLonLat(1, 0, VIEW);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
  it("projects the bbox bottom-right to (width,height)", () => {
    const p = projectLonLat(0, 1, VIEW);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
  });
  it("projects the bbox center to canvas center", () => {
    const p = projectLonLat(0.5, 0.5, VIEW);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(50);
  });
});

describe("projectWay / osmWayToRoad", () => {
  const nodes = new Map<number, OsmNode>([
    [1, { id: 1, lat: 0.25, lon: 0.25 }],
    [2, { id: 2, lat: 0.75, lon: 0.75 }],
  ]);
  const way: OsmWay = {
    id: 100,
    node_refs: [1, 2],
    tags: { highway: "residential", lanes: "2", name: "Rua A" },
  };

  it("projects a way's nodes into the flat canvas array", () => {
    const flat = projectWay(way, nodes, VIEW);
    expect(flat).toHaveLength(4);
    expect(flat[0]).toBeCloseTo(25);
    expect(flat[2]).toBeCloseTo(75);
  });

  it("converts a residential way into an urban-style RoadObject", () => {
    const road = osmWayToRoad(way, nodes, VIEW);
    expect(road).not.toBeNull();
    expect(road!.road_style).toBe("urban");
    expect(road!.subtype).toBe("osm_way");
    expect(road!.lane_count).toBe(2); // matches the OSM hint
    expect(road!.metadata_json).toContain('"osm_id":100');
    expect(road!.metadata_json).toContain('"name":"Rua A"');
  });

  it("returns null for ways without a highway tag", () => {
    const benched: OsmWay = { id: 200, node_refs: [1, 2], tags: { bench: "yes" } };
    expect(osmWayToRoad(benched, nodes, VIEW)).toBeNull();
  });

  it("returns null when too few nodes survive projection", () => {
    const short: OsmWay = {
      id: 300,
      node_refs: [9999], // unknown ref → dropped
      tags: { highway: "residential" },
    };
    expect(osmWayToRoad(short, nodes, VIEW)).toBeNull();
  });
});

describe("osmDatasetToRoads", () => {
  it("returns one road per highway-tagged way", () => {
    const nodes: OsmNode[] = [
      { id: 1, lat: 0.1, lon: 0.1 },
      { id: 2, lat: 0.2, lon: 0.2 },
      { id: 3, lat: 0.8, lon: 0.8 },
    ];
    const ways: OsmWay[] = [
      { id: 10, node_refs: [1, 2], tags: { highway: "primary" } },
      { id: 11, node_refs: [2, 3], tags: { highway: "residential" } },
      { id: 12, node_refs: [1, 3], tags: { amenity: "park" } }, // ignored
    ];
    const roads = osmDatasetToRoads(ways, nodes, VIEW);
    expect(roads).toHaveLength(2);
    expect(roads.map((r) => r.road_style).sort()).toEqual([
      "highway",
      "urban",
    ]);
  });
});

describe("fetchOverpassBBox", () => {
  it("throws — the scaffold makes the contract explicit but does not fetch yet", async () => {
    await expect(
      fetchOverpassBBox({
        min_lat: 0,
        max_lat: 1,
        min_lon: 0,
        max_lon: 1,
      }),
    ).rejects.toThrow(/not implemented/i);
  });
});
