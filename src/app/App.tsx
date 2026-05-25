import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { HomeView } from "@modules/home/HomeView";
import { LaudoModule } from "@modules/laudo/LaudoModule";
import { DossieModule } from "@modules/dossie/DossieModule";
import { CroquiModule } from "@modules/croqui/CroquiModule";
import { VideoModule } from "@modules/video/VideoModule";
import { EvidenciasModule } from "@modules/evidencias/EvidenciasModule";
import { PlaceholderModule } from "@modules/placeholders/PlaceholderModule";

export function App() {
  return (
    <WorkspaceProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/dossie" element={<DossieModule />} />
            <Route path="/laudo" element={<LaudoModule />} />
            <Route path="/croqui" element={<CroquiModule />} />
            <Route path="/video" element={<VideoModule />} />
            <Route path="/evidencias" element={<EvidenciasModule />} />
            <Route
              path="/imagens"
              element={
                <PlaceholderModule
                  module="Imagens"
                  scheduled="MVP 6 (Imagens e Mídias)"
                />
              }
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
        </AppShell>
      </HashRouter>
    </WorkspaceProvider>
  );
}
