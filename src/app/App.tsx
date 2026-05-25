import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { HomeView } from "@modules/home/HomeView";
import { PlaceholderModule } from "@modules/placeholders/PlaceholderModule";

export function App() {
  return (
    <WorkspaceProvider>
      <HashRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route
              path="/dossie"
              element={
                <PlaceholderModule
                  module="Dossiê"
                  scheduled="MVP 3 (após Spike D — Importador .sicroapp)"
                />
              }
            />
            <Route
              path="/laudo"
              element={
                <PlaceholderModule
                  module="Laudo"
                  scheduled="MVP 2 (após Spike B — Document Engine)"
                />
              }
            />
            <Route
              path="/croqui"
              element={
                <PlaceholderModule
                  module="Croqui"
                  scheduled="MVP 4 (após Spike E — Croqui Engine)"
                />
              }
            />
            <Route
              path="/video"
              element={
                <PlaceholderModule
                  module="Vídeo"
                  scheduled="MVP 5 (após Spike F — Video Engine)"
                />
              }
            />
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
