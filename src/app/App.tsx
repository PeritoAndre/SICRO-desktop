import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { HomeView } from "@modules/home/HomeView";
import { LaudoModule } from "@modules/laudo/LaudoModule";
import { DossieModule } from "@modules/dossie/DossieModule";
import { EvidenciasModule } from "@modules/evidencias/EvidenciasModule";
import { PlaceholderModule } from "@modules/placeholders/PlaceholderModule";
import { Toaster } from "@/components/toast/Toaster";

// F12.9 — Bundle splitting:
//   - Croqui carrega Konva (~280 KB) + Leaflet (~180 KB) → lazy.
//   - Imagem carrega Konva → lazy.
//   - Video / Lab spike → lazy.
// Home, Laudo, Dossiê e Evidências ficam no main bundle pois são
// frequentemente usados juntos em um fluxo pericial.
const CroquiModule = lazy(() =>
  import("@modules/croqui/CroquiModule").then((m) => ({
    default: m.CroquiModule,
  })),
);
const VideoModule = lazy(() =>
  import("@modules/video/VideoModule").then((m) => ({
    default: m.VideoModule,
  })),
);
const ImagemModule = lazy(() =>
  import("@modules/imagem/ImagemModule").then((m) => ({
    default: m.ImagemModule,
  })),
);
/** Spinner mínimo enquanto chunks carregam. */
function ModuleLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--sicro-fg-dim, #94a3b8)",
        fontSize: 13,
      }}
    >
      Carregando módulo…
    </div>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <Toaster />
      <HashRouter>
        <AppShell>
          <Suspense fallback={<ModuleLoading />}>
            <Routes>
              <Route path="/" element={<HomeView />} />
              <Route path="/dossie" element={<DossieModule />} />
              <Route path="/laudo" element={<LaudoModule />} />
              <Route path="/croqui" element={<CroquiModule />} />
              <Route path="/video" element={<VideoModule />} />
              <Route path="/evidencias" element={<EvidenciasModule />} />
              <Route path="/imagem" element={<ImagemModule />} />
              <Route
                path="/imagens"
                element={<Navigate to="/imagem" replace />}
              />
              <Route
                path="/midias"
                element={
                  <PlaceholderModule
                    module="Mídias"
                    scheduled="MVP 6 (Imagens e Mídias)"
                  />
                }
              />
              <Route
                path="/estatisticas"
                element={
                  <PlaceholderModule
                    module="Estatísticas"
                    scheduled="MVP 7 (Estatísticas e Busca)"
                  />
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <PlaceholderModule
                    module="Configurações"
                    scheduled="MVP 8 (Produto Consolidado)"
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
      </HashRouter>
    </WorkspaceProvider>
  );
}
