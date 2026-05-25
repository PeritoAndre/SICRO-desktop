/**
 * Road templates (MVP 6).
 *
 * A template is a function that, given an anchor point in canvas
 * coordinates, returns a *set of editable objects* the perito can move
 * and customise. Templates are not images and not frozen groups — they
 * just save the perito from drawing common road skeletons by hand.
 *
 * Every template stays inside `category: "vias"` so the layer panel can
 * group them. Lines are emitted as `SicroLineObject` (subtype road /
 * lane / lane_separator / sidewalk) so the rest of the engine keeps
 * working — no special-case rendering required.
 */

import type {
  SicroLineObject,
  SicroObject,
  SicroPoint,
} from "./schema";
import { makeLine } from "./factories";

export type TemplateId =
  | "via_reta"
  | "cruzamento_x"
  | "cruzamento_t"
  | "mao_dupla"
  | "mao_unica"
  | "rotatoria_simples"
  | "curva_simples";

export interface RoadTemplate {
  id: TemplateId;
  label: string;
  description: string;
  build(anchor: SicroPoint): SicroObject[];
}

const DEFAULT_LANE_WIDTH = 60; // px (~3.5 m com ~17 px/m)

/** Single-lane straight road (one road centerline). */
export const TEMPLATES: Record<TemplateId, RoadTemplate> = {
  via_reta: {
    id: "via_reta",
    label: "Via reta",
    description:
      "Segmento reto horizontal com bordas e divisão central tracejada.",
    build(anchor) {
      const length = 400;
      const half = DEFAULT_LANE_WIDTH;
      const xL = anchor.x - length / 2;
      const xR = anchor.x + length / 2;
      const yT = anchor.y - half;
      const yB = anchor.y + half;
      return [
        roadEdge({ x: xL, y: yT }, { x: xR, y: yT }),
        roadEdge({ x: xL, y: yB }, { x: xR, y: yB }),
        laneSeparator({ x: xL, y: anchor.y }, { x: xR, y: anchor.y }),
      ];
    },
  },

  cruzamento_x: {
    id: "cruzamento_x",
    label: "Cruzamento em X",
    description: "Dois eixos perpendiculares com via dupla cada.",
    build(anchor) {
      const arm = 240;
      const half = DEFAULT_LANE_WIDTH;
      const objs: SicroObject[] = [
        // Eixo horizontal — duas bordas + divisão
        roadEdge(
          { x: anchor.x - arm, y: anchor.y - half },
          { x: anchor.x + arm, y: anchor.y - half },
        ),
        roadEdge(
          { x: anchor.x - arm, y: anchor.y + half },
          { x: anchor.x + arm, y: anchor.y + half },
        ),
        laneSeparator(
          { x: anchor.x - arm, y: anchor.y },
          { x: anchor.x + arm, y: anchor.y },
        ),
        // Eixo vertical
        roadEdge(
          { x: anchor.x - half, y: anchor.y - arm },
          { x: anchor.x - half, y: anchor.y + arm },
        ),
        roadEdge(
          { x: anchor.x + half, y: anchor.y - arm },
          { x: anchor.x + half, y: anchor.y + arm },
        ),
        laneSeparator(
          { x: anchor.x, y: anchor.y - arm },
          { x: anchor.x, y: anchor.y + arm },
        ),
      ];
      return objs;
    },
  },

  cruzamento_t: {
    id: "cruzamento_t",
    label: "Cruzamento em T",
    description: "Via horizontal contínua com derivação vertical descendente.",
    build(anchor) {
      const arm = 240;
      const half = DEFAULT_LANE_WIDTH;
      return [
        // Horizontal
        roadEdge(
          { x: anchor.x - arm, y: anchor.y - half },
          { x: anchor.x + arm, y: anchor.y - half },
        ),
        roadEdge(
          { x: anchor.x - arm, y: anchor.y + half },
          { x: anchor.x + arm, y: anchor.y + half },
        ),
        laneSeparator(
          { x: anchor.x - arm, y: anchor.y },
          { x: anchor.x + arm, y: anchor.y },
        ),
        // Vertical descendente (a partir do eixo inferior)
        roadEdge(
          { x: anchor.x - half, y: anchor.y + half },
          { x: anchor.x - half, y: anchor.y + arm },
        ),
        roadEdge(
          { x: anchor.x + half, y: anchor.y + half },
          { x: anchor.x + half, y: anchor.y + arm },
        ),
        laneSeparator(
          { x: anchor.x, y: anchor.y + half },
          { x: anchor.x, y: anchor.y + arm },
        ),
      ];
    },
  },

  mao_dupla: {
    id: "mao_dupla",
    label: "Via de mão dupla",
    description:
      "Como `via_reta`, mas com divisória dupla contínua — destaca-se a separação de fluxos.",
    build(anchor) {
      const length = 400;
      const half = DEFAULT_LANE_WIDTH;
      const xL = anchor.x - length / 2;
      const xR = anchor.x + length / 2;
      const yT = anchor.y - half;
      const yB = anchor.y + half;
      const sep = 4;
      return [
        roadEdge({ x: xL, y: yT }, { x: xR, y: yT }),
        roadEdge({ x: xL, y: yB }, { x: xR, y: yB }),
        solidLane(
          { x: xL, y: anchor.y - sep },
          { x: xR, y: anchor.y - sep },
        ),
        solidLane(
          { x: xL, y: anchor.y + sep },
          { x: xR, y: anchor.y + sep },
        ),
      ];
    },
  },

  mao_unica: {
    id: "mao_unica",
    label: "Via de mão única",
    description:
      "Via reta horizontal sem divisória central, com seta indicando o sentido.",
    build(anchor) {
      const length = 360;
      const half = DEFAULT_LANE_WIDTH;
      const xL = anchor.x - length / 2;
      const xR = anchor.x + length / 2;
      const yT = anchor.y - half;
      const yB = anchor.y + half;
      return [
        roadEdge({ x: xL, y: yT }, { x: xR, y: yT }),
        roadEdge({ x: xL, y: yB }, { x: xR, y: yB }),
        arrowSegment(
          { x: anchor.x - 60, y: anchor.y },
          { x: anchor.x + 60, y: anchor.y },
        ),
      ];
    },
  },

  rotatoria_simples: {
    id: "rotatoria_simples",
    label: "Rotatória simples",
    description: "Octógono regular como aproximação técnica de uma rotatória.",
    build(anchor) {
      const radius = 90;
      const sides = 8;
      const points: SicroPoint[] = Array.from({ length: sides }, (_, i) => {
        const ang = (i / sides) * Math.PI * 2 - Math.PI / 2;
        return {
          x: anchor.x + Math.cos(ang) * radius,
          y: anchor.y + Math.sin(ang) * radius,
        };
      });
      const out: SicroObject[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        out.push(roadEdge(a, b));
      }
      return out;
    },
  },

  curva_simples: {
    id: "curva_simples",
    label: "Curva simples",
    description:
      "Curva discretizada em 8 segmentos (~90°) para representar uma curva moderada.",
    build(anchor) {
      const radius = 200;
      const segments = 8;
      const startAngle = Math.PI;
      const endAngle = Math.PI / 2; // 180° → 90°
      const half = DEFAULT_LANE_WIDTH;
      const outer = sampleArc(anchor, radius + half, startAngle, endAngle, segments);
      const inner = sampleArc(anchor, radius - half, startAngle, endAngle, segments);
      const out: SicroObject[] = [];
      for (let i = 0; i < segments; i++) {
        out.push(roadEdge(outer[i]!, outer[i + 1]!));
        out.push(roadEdge(inner[i]!, inner[i + 1]!));
      }
      return out;
    },
  },
};

export function findTemplate(id: TemplateId): RoadTemplate | undefined {
  return TEMPLATES[id];
}

// ---------------------------------------------------------------------------
// Internal helpers

function roadEdge(a: SicroPoint, b: SicroPoint): SicroLineObject {
  return makeLine(a, b, "road");
}
function laneSeparator(a: SicroPoint, b: SicroPoint): SicroLineObject {
  return makeLine(a, b, "lane_separator");
}
function solidLane(a: SicroPoint, b: SicroPoint): SicroLineObject {
  return makeLine(a, b, "lane");
}
function arrowSegment(a: SicroPoint, b: SicroPoint): SicroLineObject {
  return makeLine(a, b, "arrow");
}

function sampleArc(
  center: SicroPoint,
  radius: number,
  start: number,
  end: number,
  segments: number,
): SicroPoint[] {
  const out: SicroPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = start + (end - start) * t;
    out.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
    });
  }
  return out;
}
