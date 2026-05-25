/**
 * Figure — block node that wraps an image with a caption.
 *
 * Used by `image` and `croqui` blocks in the doc 04 schema. Numbering is
 * not stored — it is computed at render time based on document order
 * (see `renderer.ts`).
 *
 * Structure on the wire:
 *   {
 *     "type": "figure",
 *     "attrs": { "src": "...", "alt": "...", "kind": "image|croqui" },
 *     "content": [{ "type": "figcaption", "content": [{ "type": "text", "text": "..." }] }]
 *   }
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface FigureOptions {
  /** Default placeholder src for spike-time inserts. */
  placeholderSrc: string;
}

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs?: {
        src?: string;
        alt?: string;
        kind?: "image" | "croqui";
        caption?: string;
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
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-sicro-figure]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-sicro-figure": "true",
        "data-kind": node.attrs.kind ?? "image",
      }),
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
