/**
 * Figure — block node that wraps an image with a caption.
 *
 * Used by `image`, `croqui` and `video_frame` blocks in the doc 04
 * schema. Numbering is computed at render time based on document order
 * (see `renderer.ts`).
 *
 * MVP 4 — evidence provenance: when a figure represents an evidence
 * inserted from the Dossiê / Croqui / Vídeo, the following extra
 * attributes are populated so the `.sicrodoc` stays auditable:
 *
 *   - `evidence_id`     — UUID of the source entity (media_asset_id,
 *                          croqui_id, video_storyboard_frame_id, etc.)
 *   - `evidence_kind`   — discriminator (photo|croqui|video_frame|...)
 *   - `relative_path`   — workspace-relative path of the asset (PNG/JPG)
 *   - `source_hash`     — SHA-256 when available
 *   - `metadata_json`   — opaque JSON (categoria, timestamp, etc.)
 *
 * Authoring (text / drawings) still uses `src` directly; the evidence
 * fields default to null. Existing `.sicrodoc` envelopes keep loading.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface FigureOptions {
  /** Default placeholder src for spike-time inserts. */
  placeholderSrc: string;
}

export type FigureKind = "image" | "croqui" | "video_frame";

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs?: {
        src?: string;
        alt?: string;
        kind?: FigureKind;
        caption?: string;
        evidence_id?: string | null;
        evidence_kind?: string | null;
        relative_path?: string | null;
        source_hash?: string | null;
        metadata_json?: string | null;
      }) => ReturnType;
    };
  }
}

export const Figure = Node.create<FigureOptions>({
  name: "figure",
  group: "block",
  content: "figcaption",
  draggable: true,
  isolating: true,

  addOptions() {
    return {
      placeholderSrc:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
             <rect width="100%" height="100%" fill="#e8eaee"/>
             <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
                   font-family="Inter, sans-serif" font-size="20" fill="#5a6471">
               Imagem placeholder
             </text>
           </svg>`,
        ),
    };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      kind: { default: "image" },
      // ----- MVP 4 evidence provenance -----
      evidence_id: { default: null },
      evidence_kind: { default: null },
      relative_path: { default: null },
      source_hash: { default: null },
      metadata_json: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-sicro-figure]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const extra: Record<string, string> = {
      "data-sicro-figure": "true",
      "data-kind": (node.attrs.kind as string) ?? "image",
    };
    if (node.attrs.evidence_id)
      extra["data-evidence-id"] = String(node.attrs.evidence_id);
    if (node.attrs.evidence_kind)
      extra["data-evidence-kind"] = String(node.attrs.evidence_kind);
    if (node.attrs.relative_path)
      extra["data-relative-path"] = String(node.attrs.relative_path);
    if (node.attrs.source_hash)
      extra["data-source-hash"] = String(node.attrs.source_hash);
    return [
      "figure",
      mergeAttributes(HTMLAttributes, extra),
      [
        "img",
        {
          src: node.attrs.src ?? this.options.placeholderSrc,
          alt: node.attrs.alt ?? "",
        },
      ],
      ["div", { "data-sicro-figcaption-slot": "true" }, 0],
    ];
  },

  addCommands() {
    return {
      insertFigure:
        (attrs) =>
        ({ commands }) => {
          const src = attrs?.src ?? this.options.placeholderSrc;
          const caption = attrs?.caption ?? "Descrição da figura.";
          return commands.insertContent({
            type: this.name,
            attrs: {
              src,
              alt: attrs?.alt ?? "",
              kind: attrs?.kind ?? "image",
              evidence_id: attrs?.evidence_id ?? null,
              evidence_kind: attrs?.evidence_kind ?? null,
              relative_path: attrs?.relative_path ?? null,
              source_hash: attrs?.source_hash ?? null,
              metadata_json: attrs?.metadata_json ?? null,
            },
            content: [
              {
                type: "figcaption",
                content: [{ type: "text", text: caption }],
              },
            ],
          });
        },
    };
  },
});

/**
 * Inline caption that sits inside `<figure>`. Plain block of text only.
 */
export const FigCaption = Node.create({
  name: "figcaption",
  content: "inline*",
  marks: "_",
  defining: true,

  parseHTML() {
    return [{ tag: "figcaption" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figcaption", mergeAttributes(HTMLAttributes), 0];
  },
});
