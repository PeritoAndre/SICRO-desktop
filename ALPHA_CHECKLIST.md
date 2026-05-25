# Checklist Alpha — SICRO Desktop 2.0

Última atualização: 2026-05-25 (MVP 8).

Roteiro mínimo para validar que o app está operacional como Alpha em
testes reais controlados. Cada item deve ser executado em sequência,
em um workspace de teste (NÃO usar dados periciais reais ainda).

---

## A. Fundamentos

- [ ] App abre normalmente (`pnpm tauri dev` ou binário Alpha).
- [ ] Tela inicial (Home) carrega.
- [ ] ActivityRail mostra: Início · Dossiê · Laudo · Croqui · Vídeo ·
      Evidências · Imagem · (placeholders Mídias / Estatísticas /
      Configurações).
- [ ] Status bar inferior visível.

## B. Workspace

- [ ] Criar nova ocorrência (botão "Nova ocorrência").
- [ ] OU abrir workspace existente (botão "Abrir workspace…").
- [ ] OU importar `.sicroapp` (botão "Importar .sicroapp…").
- [ ] AlphaDashboard aparece na Home com:
  - workspace ativo;
  - BO / tipo / município;
  - contadores;
  - status de integridade;
  - status de `ffmpeg` / `ffprobe`;
  - atalhos para módulos;
  - botões "Verificar integridade", "Relatório de saúde", "Gerar backup".

## C. Dossiê

- [ ] Abrir aba Dossiê.
- [ ] Sumário aparece (quando houver `.sicroapp` importado).
- [ ] Aba Fotos lista fotos.
- [ ] Aba Checklist / Vestígios / Medições / Observações / Linha do
      tempo renderizam.
- [ ] Botão "Recarregar pacote" funciona quando há `.sicroapp` staged.

## D. Laudo

- [ ] Criar laudo novo (template Documento Livre).
- [ ] Editor abre, EditorPage com folha A4.
- [ ] Inspector lateral com 6 abas (Validações / Estrutura /
      Evidências / Cabeçalho / Página / Dados).
- [ ] Aba Evidências mostra os 6 sub-tabs (Dados / Fotos / Croquis /
      Vídeo / Dossiê / Tabelas).
- [ ] Inserir foto via Inspector → Evidências → Fotos.
- [ ] Inserir tabela (checklist / vestígios / medições).
- [ ] Salvar (Ctrl+S).
- [ ] Exportar PDF (botão Exportar na toolbar).
- [ ] Conferir PDF aberto fora do SICRO.

## E. Croqui

- [ ] Criar croqui novo (módulo Croqui).
- [ ] Inserir modelo de via (via_reta / cruzamento_x / etc.).
- [ ] Adicionar veículo (sedan, SUV…).
- [ ] R1 / R2.
- [ ] Definir escala.
- [ ] Medida.
- [ ] Salvar.
- [ ] Exportar PNG (deve abrir fora do SICRO com carimbo técnico).
- [ ] Inserir o PNG no Laudo via Inspector → Evidências → Croquis.

## F. Vídeo

- [ ] Registrar vídeo (módulo Vídeo).
- [ ] Coletar 1 frame.
- [ ] Inserir storyboard ou frame no Laudo via Inspector →
      Evidências → Vídeo.

## G. Imagem (MVP 7)

- [ ] Criar análise a partir de foto do Dossiê.
- [ ] Criar análise a partir de frame do vídeo.
- [ ] Criar análise a partir de arquivo local.
- [ ] Anotar (seta, retângulo, texto, marcador numerado).
- [ ] Ajustar brilho/contraste/gamma/saturação.
- [ ] Definir escala + medida.
- [ ] Tarja.
- [ ] Salvar.
- [ ] Fechar e reabrir — anotações e ajustes preservados.
- [ ] Exportar derivado (PNG + sidecar JSON).
- [ ] PNG derivado abre fora do SICRO.
- [ ] Inserir derivado no Laudo via Inspector → Evidências.

## H. Central de Evidências (MVP 5)

- [ ] Abrir módulo Evidências.
- [ ] Aba Resumo mostra contadores.
- [ ] Aba Todas lista evidências.
- [ ] Aba Imagem (via aggregator) mostra análises e derivados.
- [ ] Verificação leve passa.
- [ ] Verificação profunda (botão) executa SHA-256.
- [ ] Gerar relatório de integridade (HTML salvo em
      `reports/workspace_integrity_*.html`).
- [ ] Teste controlado: renomear um arquivo fora do app — verificação
      reporta `missing_file`.

## I. Consolidação Alpha (MVP 8)

- [ ] **Backup**: na Home → "Gerar backup". Conferir
      `<workspace>/backups/backup_BO_<id>_<TS>.sicrobackup`.
- [ ] **Relatório de saúde**: na Home → "Relatório de saúde".
      Conferir `<workspace>/reports/system_health_<TS>.html`.
- [ ] HTML abre fora do SICRO com contadores, dependências, status.
- [ ] **Verificação rápida** (botão "Verificar integridade" na Home)
      navega para a Central de Evidências.

## J. Persistência + Consistência

- [ ] Fechar o app inteiro.
- [ ] Reabrir o app.
- [ ] Abrir o workspace recente.
- [ ] Tudo (laudos, croquis, vídeos, análises de imagem, exports)
      preservado.
- [ ] Atualizar via botão "Atualizar" no AlphaDashboard — contadores
      batem.

## K. Regressão

- [ ] Dossiê continua funcionando.
- [ ] Laudo continua funcionando.
- [ ] Croqui continua funcionando.
- [ ] Vídeo continua funcionando.
- [ ] Imagem continua funcionando.
- [ ] Evidências continua funcionando.
- [ ] Importador continua funcionando.

---

## Critério de aprovação Alpha

Todos os itens acima ✅ → o SICRO está operacional para Alpha
controlado (testes internos com workspace descartável; não usar dados
periciais reais até validação humana do perito).

Itens vermelhos / falhas → registrar em `KNOWN_LIMITATIONS.md` ou
abrir issue no GitHub.
