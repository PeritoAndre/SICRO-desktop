/**
 * Subsistema de tabelas (F7) — barrel público.
 */

export {
  TABLE_TEMPLATES,
  TABLE_TEMPLATES_BY_ID,
  findTableTemplate,
  type TableTemplateDefinition,
} from "./templates";
export {
  extractTables,
  buildTableList,
  type TableEntry,
  type NumberedTableEntry,
} from "./extractTables";
