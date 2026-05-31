export { Figure, FigCaption, type FigureKind, type FigureAlign } from "./Figure";
// Q — Shape: formas geométricas (rectangle, ellipse, arrow, line)
// pra anotação sobre fotos em laudos.
export { Shape, type ShapeKind, type ShapeWrapMode } from "./Shape";
// U — TextBox: caixa de texto editável estilo Word (objeto, fora do flow).
export {
  TextBox,
  type TextBoxWrapMode,
  type TextBoxBorderStyle,
} from "./TextBox";
export { Storyboard, StoryboardItem, type StoryboardEvidenceItem } from "./Storyboard";
export { SystemData, type SystemDataReviewStatus } from "./SystemData";
// F6 — Prancha fotográfica (1/2/4/6 fotos por página).
export {
  PhotoPlate,
  photoPlateSlots,
  photoPlateColumns,
  type PhotoPlateLayout,
  type PhotoPlateEntry,
} from "./PhotoPlate";
export {
  EvidenceTable,
  type EvidenceTableKind,
  type EvidenceTableColumn,
  type EvidenceTableRow,
} from "./EvidenceTable";
export {
  QuesitoList,
  QuesitoItem,
  QuesitoQuestion,
  QuesitoAnswer,
} from "./Quesito";
export { Signature } from "./Signature";
export { CrossReference } from "./CrossReference";
export {
  DynamicSummary,
  DynamicFigureList,
  DynamicTableList,
} from "./DynamicList";
