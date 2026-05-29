/**
 * O — Tipos do drag & drop de fotos no editor de laudo.
 *
 * Espelham 1:1 as structs Rust em `src-tauri/src/commands/laudo_photo_drop.rs`.
 * As `field_names` usam snake_case porque serde-json preserva os nomes
 * dos campos Rust.
 */

export interface ImportedPhoto {
  /** Path relativo ao workspace (sempre forward slashes), ex:
   *  `laudos/<id>/evidencias/photos/<hash12>_<safe>.jpg`. */
  relative_path: string;
  /** Nome original do arquivo no disco do user. Útil pra usar como `alt`. */
  original_filename: string;
  /** Tamanho em bytes da foto importada. */
  size_bytes: number;
  /** SHA-256 hex completo (64 chars). */
  sha256: string;
  /** Largura em pixels (0 quando a libimage não conseguiu parsear). */
  width: number;
  /** Altura em pixels (0 quando a libimage não conseguiu parsear). */
  height: number;
  /** MIME inferido pelo formato detectado. */
  mime: string;
  /** EXIF cru em JSON (texto). `null` quando a foto não tem. */
  exif_json: string | null;
  /** Data de captura parseada do EXIF (string ISO ou EXIF original). */
  date_taken: string | null;
}

export interface PhotoImportError {
  /** Path original que falhou. */
  source_path: string;
  /** Mensagem de erro humana (i18n não aplicado). */
  reason: string;
}

export interface PhotoImportResult {
  /** Fotos que foram copiadas com sucesso. */
  imported: ImportedPhoto[];
  /** Fotos que falharam (extensão não suportada, arquivo não existe, etc). */
  errors: PhotoImportError[];
}
