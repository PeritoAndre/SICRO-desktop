import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// Tauri expects a fixed port and disables HMR overlay during build.
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@app": path.resolve(__dirname, "src/app"),
      "@core": path.resolve(__dirname, "src/core"),
      "@ds": path.resolve(__dirname, "src/design-system"),
      "@components": path.resolve(__dirname, "src/components"),
      "@modules": path.resolve(__dirname, "src/modules"),
      "@stores": path.resolve(__dirname, "src/stores"),
      "@domain": path.resolve(__dirname, "src/types"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: ["es2022", "chrome105", "safari13"],
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // F12.9 — Bundle splitting. Divide o bundle inicial (que estava em
    // ~1.7 MB) em chunks lógicos:
    //   - vendor-react: React + ReactDOM + router (~140 KB)
    //   - vendor-tiptap: TipTap + ProseMirror + extensions (~360 KB)
    //   - vendor-konva: Konva + react-konva (~280 KB) — só usado em
    //     croqui/imagem; carregado on-demand pelo dynamic import.
    //   - vendor-leaflet: Leaflet + react-leaflet (~180 KB) — só no
    //     modal OSM (já lazy desde MVP10).
    //   - vendor-qrcode: lib QR (~30 KB) — só na finalização.
    //   - vendor-misc: zustand + lucide + outras dependências menores.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // F12.9 — Pacotes só são identificados por substring do path
          // de node_modules. @tiptap/pm tem subpath exports (não pode
          // ser citado como entry plano), então casamos pelo prefixo.
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/") ||
            id.includes("/react-router/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          if (id.includes("/@tiptap/") || id.includes("/prosemirror-")) {
            return "vendor-tiptap";
          }
          if (id.includes("/konva/") || id.includes("/react-konva/")) {
            return "vendor-konva";
          }
          if (id.includes("/leaflet/") || id.includes("/react-leaflet/")) {
            return "vendor-leaflet";
          }
          if (id.includes("/qrcode/")) {
            return "vendor-qrcode";
          }
          if (
            id.includes("/zustand/") ||
            id.includes("/lucide-react/") ||
            id.includes("/polygon-clipping/")
          ) {
            return "vendor-misc";
          }
          return undefined; // deixa o Rollup decidir o resto
        },
      },
    },
    // Aumenta o threshold do warning ALÉM do que conseguimos otimizar,
    // mas mantemos visibilidade — qualquer chunk acima de 800 KB deve
    // ser investigado.
    chunkSizeWarningLimit: 800,
  },
}));
