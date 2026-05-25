/**
 * Storyboard — pericial block reproducing the canonical pattern from doc 04 §17:
 *   "imagem à esquerda, tempo/frame/descrição à direita".
 *
 * Structure:
 *   storyboard (block)
 *     └── storyboardItem (1+) — each item carries:
 *           - attrs: { src, timestamp, frame_label }
 *           - content: description (paragraph-like inline)
 *
 * In Spike B the storyboard does NOT bind to a real video evidence — the
 * `video_id` and `media_hash` from doc 04 are reserved for later spikes.
 */

import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    storyboard: {
      insertStoryboard: (initialItems?: number) => ReturnType;
      appendStoryboardItem: () => ReturnType;
    };
  }
}

export const Storyboard = Node.create({
  name: "storyboard",
  group: "block",
  content: "storyboardItem+",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      caption: { default: "Sequência observada no vídeo." },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-sicro-storyboard]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-sicro-storyboard": "true" }),
      0,
    ];
  },

  addCommands() {
    return {
      insertStoryboard:
        (initialItems = 2) =>
        ({ commands }) => {
          const items = Array.from({ length: Math.max(1, initialItems) }, (_, i) =>
            defaultStoryboardItem(i + 1),
          );
          return commands.insertContent({
            type: this.name,
            attrs: { caption: "Sequência observada no vídeo." },
            content: items,
          });
        },
      appendStoryboardItem:
        () =>
        ({ chain, state }) => {
          // Find the closest enclosing storyboard at the selection.
          const { $from } = state.selection;
          let depth = $from.depth;
          while (depth > 0 && $from.node(depth).type.name !== "storyboard") {
            depth -= 1;
          }
          if (depth === 0) return false;
          const sbNode = $from.node(depth);
          const insertAt = $from.before(depth) + sbNode.nodeSize - 1;
          return chain()
            .insertContentAt(insertAt, defaultStoryboardItem(sbNode.childCount + 1))
            .run();
        },
    };
  },
});

export const StoryboardItem = Node.create({
  name: "storyboardItem",
  content: "paragraph+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: null },
      timestamp: { default: "00:00:00.000" },
      frame_label: { default: "Frame: 0" },
    };
  },

  parseHTML() {
    return [{ tag: "article[data-sicro-storyboard-item]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "article",
      mergeAttributes(HTMLAttributes, {
        "data-sicro-storyboard-item": "true",
        "data-timestamp": node.attrs.timestamp ?? "",
        "data-frame": node.attrs.frame_label ?? "",
      }),
      [
        "div",
        { "data-sicro-storyboard-image": "true" },
        ["img", { src: node.attrs.src ?? PLACEHOLDER_FRAME, alt: "Frame placeholder" }],
      ],
      [
        "div",
        { "data-sicro-storyboard-meta": "true" },
        ["div", { "data-sicro-storyboard-time": "true" }, node.attrs.timestamp ?? ""],
        ["div", { "data-sicro-storyboard-frame": "true" }, node.attrs.frame_label ?? ""],
        ["div", { "data-sicro-storyboard-description": "true" }, 0],
      ],
    ];
  },
});

const PLACEHOLDER_FRAME =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
       <rect width="100%" height="100%" fill="#1a1f2b"/>
       <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
             font-family="Inter, sans-serif" font-size="14" fill="#a9b6c7">
         Frame placeholder
       </text>
     </svg>`,
  );

function defaultStoryboardItem(index: number) {
  const seconds = (index - 1) * 5;
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return {
    type: "storyboardItem",
    attrs: {
      src: null,
      timestamp: `00:${mm}:${ss}.000`,
      frame_label: `Frame: ${index * 24}`,
    },
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Descrição do evento ${index}.`,
          },
        ],
      },
    ],
  };
}
