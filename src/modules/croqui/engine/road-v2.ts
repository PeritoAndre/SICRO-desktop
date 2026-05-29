/**
 * Road v2 — STUB pós-Fase S.
 *
 * O Road Engine 2.0 (ribbon polygon + junction patches + roundabout
 * meshes + smoothing) foi removido na Fase S em favor do Python Parity
 * Engine (`./road-parity`).
 *
 * Este arquivo existe apenas pra:
 *
 *   - Não quebrar imports legados em `CanvasStage.tsx`, `CroquiEditor.tsx`,
 *     `OsmImportModal.tsx` (que serão refatorados gradualmente).
 *   - Expor stubs no-op pra que o app compile e rode sem v2 ativo.
 *
 * Comportamento:
 *
 *   - `RoadNetworkLayerV2` renderiza `null` (nada de v2 no canvas).
 *   - `RoundaboutMeshNode` renderiza `null`.
 *   - `computeAutoDimensions` retorna defaults conservadores —
 *     mantém o handler de "Recalcular proporção" do Inspector
 *     funcionando pra rotatórias v2 herdadas (até elas serem
 *     migradas para parity).
 *   - `convertOsmDatasetToSicroObjects` retorna resultado vazio —
 *     o modal OSM agora roteia tudo pra parity adapter, então
 *     esta função nunca é chamada na prática.
 *
 * NÃO ADICIONE nova lógica aqui. Migre tudo pra `./road-parity`.
 */

import type { ReactElement } from "react";
import type {
  SicroRoadObject,
  SicroRoundaboutObject,
} from "./schema";

// ---------------------------------------------------------------------------
// Renderer stubs — sempre null.

interface RoadNetworkLayerV2Props {
  roads: ReadonlyArray<SicroRoadObject>;
  roundabouts: ReadonlyArray<SicroRoundaboutObject>;
  selectedId: string | null;
  draggable: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<SicroRoadObject | SicroRoundaboutObject>) => void;
  debugEnabled?: boolean;
}

export function RoadNetworkLayerV2(_props: RoadNetworkLayerV2Props): ReactElement | null {
  return null;
}

interface RoundaboutMeshNodeProps {
  obj: SicroRoundaboutObject;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<SicroRoundaboutObject>) => void;
}

export function RoundaboutMeshNode(_props: RoundaboutMeshNodeProps): ReactElement | null {
  return null;
}

// ---------------------------------------------------------------------------
// Geometry stub — preserva proporções básicas pra rotatórias v2 herdadas.

export interface AutoDimensionsInput {
  /** Larguras (em px) das vias conectadas ao anel. */
  roadWidths: number[];
  /** Número de faixas (lanes) da pista circular. Default 1. */
  laneCount: number;
}

export interface AutoDimensionsResult {
  /** Raio externo do anel (px). */
  outerRadius: number;
  /** Largura da pista circular (px). */
  circulatingWidth: number;
}

/**
 * Algoritmo simplificado de proporção de rotatória. Paridade aproximada
 * com o `computeAutoDimensions` original do Road v2 — calcula raio e
 * largura a partir das larguras das vias conectadas + número de faixas.
 *
 * Mantido só pra que o botão "Recalcular proporção" do Inspector ainda
 * faça algo útil em rotatórias v2 herdadas. Rotatórias novas devem ser
 * criadas via `road-parity/makeParityRoundabout`.
 */
export function computeAutoDimensions(
  input: AutoDimensionsInput,
): AutoDimensionsResult {
  const lanes = Math.max(1, input.laneCount);
  const maxRoadWidth =
    input.roadWidths.length > 0 ? Math.max(...input.roadWidths) : 24;
  // Largura da circulação: cresce com nº de faixas, com mínimo da via mais larga.
  const circulatingWidth = Math.max(maxRoadWidth, lanes * 12);
  // Raio externo: ~2.5x a largura → proporção típica SICRO.
  const outerRadius = Math.max(40, circulatingWidth * 2.5);
  return { outerRadius, circulatingWidth };
}

// ---------------------------------------------------------------------------
// OSM stub — adapter v2 sempre retorna vazio. O fluxo real é parity.

export interface OsmConvertOptions {
  margin?: number;
  simplify_tolerance_m?: number;
  min_way_length_m?: number;
  snap_px?: number;
  smoothing_mode?: string;
  preserve_roundabouts?: boolean;
}

export interface OsmConvertStats {
  imported_road_count: number;
  imported_roundabout_count: number;
  skipped_count: number;
  px_per_m: number;
}

export interface OsmConvertResult {
  roads: SicroRoadObject[];
  roundabouts: SicroRoundaboutObject[];
  warnings: string[];
  stats: OsmConvertStats;
}

/**
 * STUB pós-Fase S. O modal OSM nunca chama esta função (roteia tudo
 * pra `convertOsmDatasetToParityObjects`). Mantida só pra compile compat
 * caso algum teste ou import legado ainda exista.
 */
export function convertOsmDatasetToSicroObjects(
  _input: unknown,
): OsmConvertResult {
  return {
    roads: [],
    roundabouts: [],
    warnings: [
      "Road v2 OSM adapter foi removido na Fase S — use o adapter parity.",
    ],
    stats: {
      imported_road_count: 0,
      imported_roundabout_count: 0,
      skipped_count: 0,
      px_per_m: 1,
    },
  };
}
