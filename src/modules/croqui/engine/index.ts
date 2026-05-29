/** Public surface of the Croqui Engine — framework-agnostic.
 *
 * Fase S — Road v1 e Road v2 viraram **stubs no-op**:
 *   - `road.ts` ainda expõe `ClipCircle` + helpers de geometria, mas
 *     todas as funções retornam vazio/no-op.
 *   - `road-v2.ts` ainda expõe `RoadNetworkLayerV2` + `RoundaboutMeshNode`,
 *     mas renderizam `null`.
 *
 * Único renderer de via real agora é `road-parity` (Python Parity Engine).
 * OSM importer também migrou pra `road-parity/osmAdapter.ts`.
 *
 * Os stubs preservam compile compat enquanto migramos CanvasStage,
 * Toolbar, Inspector etc. pra um pipeline parity-only.
 */

export * from "./schema";
export * from "./geometry";
export * from "./serializer";
export * from "./factories";
export * from "./templates";
export * from "./coordinates";
export * from "./osm";
export * from "./road";
