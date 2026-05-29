/**
 * Road Render Lab — adapter para o renderer Python Parity REAL.
 *
 * Converte `LabScene` (modelo do lab) em `SicroRoadObject_parity[]` +
 * `SicroRoundaboutObject_parity[]` (modelo real do app) e instancia
 * o `RoadParityRenderer` de produção. Permite validação visual lado a
 * lado com Konva e SVG sem precisar tocar no app real.
 *
 * Importante: este wrapper NÃO é o renderer real — é um adapter.
 * Quem renderiza é o `RoadParityRenderer` exportado por
 * `engine/road-parity/`.
 */

import { Layer, Stage } from "react-konva";
import {
  makeParityRoad,
  makeParityRoadBezier,
  makeParityRoundabout,
  RoadParityRenderer,
  type SicroParityObject,
} from "../../../engine/road-parity";
import type { LabScene } from "../model";

export interface ParityLabRendererProps {
  scene: LabScene;
  selectedRoadId?: string | null;
  onSelectRoad?: (id: string | null) => void;
}

/**
 * Converte a fixture do lab no shape parity real.
 */
function sceneToParity(scene: LabScene): SicroParityObject[] {
  const objs: SicroParityObject[] = [];
  for (const road of scene.roads) {
    // Lab usa controles explícitos sempre — usamos makeParityRoadBezier.
    objs.push(
      makeParityRoadBezier(
        road.ax,
        road.ay,
        road.cx1,
        road.cy1,
        road.cx2,
        road.cy2,
        road.bx,
        road.by,
        {
          id: road.id, // preserva ids do lab
          largura_m: road.largura_m,
          superficie: road.superficie,
          mao_dupla: road.mao_dupla,
          marcacao: road.marcacao,
          ...(road.label ? { label: road.label } : {}),
        },
      ),
    );
  }
  for (const rb of scene.roundabouts) {
    objs.push(
      makeParityRoundabout(rb.cx, rb.cy, rb.r_m, {
        id: rb.id,
        largura_m: rb.largura_m,
        ...(rb.label ? { label: rb.label } : {}),
      }),
    );
  }
  // Silencia warnings de helper não usado.
  void makeParityRoad;
  return objs;
}

export function ParityLabRenderer({
  scene,
  selectedRoadId = null,
  onSelectRoad,
}: ParityLabRendererProps) {
  const { width_px, height_px, zoom, offset_x, offset_y } = scene.canvas;
  const parityObjects = sceneToParity(scene);

  return (
    <Stage width={width_px} height={height_px}>
      <Layer>
        <RoadParityRenderer
          objects={parityObjects}
          pxPerM={zoom}
          offsetX={offset_x}
          offsetY={offset_y}
          selectedId={selectedRoadId}
          onSelect={onSelectRoad ?? undefined}
        />
      </Layer>
    </Stage>
  );
}
