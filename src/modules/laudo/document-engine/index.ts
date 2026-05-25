export { laudoExtensions } from "./extensions";
export {
  coerceSicroDoc,
  emptyDocContent,
  SCHEMA_VERSION,
  type SicroDoc,
  type SicroDocLayout,
  type SicroDocMetadata,
  type SicroDocPage,
  type SicroDocPageMargins,
} from "./schema";
export {
  A4_PAGE,
  DEFAULT_PAGE_MARGINS,
  formatCm,
  marginsInCm,
  parseLengthCm,
  resolveEffectiveMargins,
} from "./page-layout";
export { buildSicroDoc, unwrapContent } from "./serializer";
export { renderSicroDocToHtml, type RenderOptions } from "./renderer";
export { numberFigures } from "./numbering";
export {
  validateSicroDoc,
  type DocumentWarning,
  type WarningSeverity,
} from "./validators";
export {
  TEMPLATES,
  findTemplate,
  type LaudoTemplate,
  type OccurrenceContext,
} from "./templates";
export {
  INSTITUTIONAL_TEMPLATES,
  PCA_PADRAO_V1,
  findInstitutionalTemplate,
  resolveHeaderField,
  type InstitutionalTemplate,
  type InstitutionalTemplateId,
} from "./institutional-templates";
export {
  brandingPaths,
  getCachedBrandingAssets,
  invalidateBrandingCache,
  loadBrandingAssets,
  type BrandingAssets,
} from "./branding";
export {
  Figure,
  FigCaption,
  Storyboard,
  StoryboardItem,
  SystemData,
  QuesitoList,
  QuesitoItem,
  QuesitoQuestion,
  QuesitoAnswer,
  Signature,
  type SystemDataReviewStatus,
} from "./nodes";
