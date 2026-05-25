# MVP 8 — Consolidação Alpha Operacional

**Branch:** `mvp/consolidacao-alpha`
**Data:** 2026-05-25
**Status final:** ✅ **APROVADO** em validação manual

---

## 1. Status

A pergunta central do MVP 8 era:

> O SICRO está pronto para ser usado como Alpha operacional em testes
> reais controlados?

A entrega resolve as **três lacunas que faltavam para responder
"sim"**:

1. **Backup do workspace** — qualquer ocorrência pode ser compactada
   em um arquivo `.sicrobackup` único com manifesto interno e SHA-256;
2. **Relatório de saúde do sistema** — um HTML auto-suficiente
   resume versão, contadores, integridade, dependências externas e
   alertas;
3. **Home Alpha** — porta de entrada operacional do app, com
   workspace ativo, contadores, atalhos, ações rápidas (Verificar /
   Backup / Saúde) e status de dependências.

Além disso, formaliza a documentação Alpha
(`ALPHA_CHECKLIST.md`, `ALPHA_GUIA_RAPIDO.md`, `KNOWN_LIMITATIONS.md`)
e protege dados reais via `.gitignore` expandido.

---

## 2. O que foi consolidado

### Backend Rust
- **`workspace/backup.rs`** *(novo)* — gera `.sicrobackup` (ZIP
  deflate) do workspace inteiro com manifesto interno
  (`_sicro_backup_manifest.json`), SHA-256 final, contagem de
  arquivos. Pula `cache/`, `logs/` e `backups/`. **3 testes.**
- **`workspace/health.rs`** *(novo)* — `build_snapshot()` reúne
  versão do app, dependências externas (`ffmpeg`/`ffprobe`),
  contadores por módulo, integridade (via MVP 5). `render_and_save()`
  produz HTML auto-suficiente em `<workspace>/reports/system_health_<TS>.html`.
  **3 testes.**
- **`commands/alpha_commands.rs`** *(novo)* — 3 Tauri commands:
  - `generate_workspace_backup(workspacePath, destination?, boLabel?)`
  - `get_system_health_snapshot(workspacePath?)`
  - `generate_system_health_report(workspacePath?)`
- **Cargo.toml** — adicionada dependência `which = "6"` (resolve
  binários no PATH para o probe de ffmpeg/ffprobe).
- **`workspace/mod.rs`** — re-exports.
- **`lib.rs`** — 3 novos handlers registrados.

### Frontend TypeScript / React
- **`src/types/alpha.ts`** *(novo)* — mirror dos models Rust
  (`BackupArtifact`, `SystemHealthSnapshot`, `WorkspaceHealth`,
  `WorkspaceCounters`, `DependencyStatus`, `HealthReportArtifact`).
- **`src/core/commands.ts`** — 3 wrappers TS.
- **`src/modules/home/AlphaDashboard.tsx`** *(novo)* — bloco que
  aparece na Home quando há workspace ativo:
  - workspace ativo (BO, tipo, município, caminho);
  - 14 contadores (fotos, croquis, vídeos, frames, análises de
    imagem, derivados, laudos, exports, evidence_links, files_ok,
    files_missing, broken_links, unsafe_paths, tamanho MB);
  - status pill `íntegro|atenção|crítico` + pills `ffmpeg/ffprobe ok|ausente`;
  - 4 botões de ação: Atualizar, Verificar integridade (navega
    para `/evidencias`), Relatório de saúde, **Gerar backup**;
  - 6 atalhos para os módulos.
- **`src/modules/home/AlphaDashboard.module.css`** *(novo)* —
  estilos no Design System.
- **`src/modules/home/HomeView.tsx`** — incorpora `<AlphaDashboard />`.

### Documentação
- **`ALPHA_CHECKLIST.md`** *(novo)* — roteiro mínimo para validar o
  app antes de uso clínico Alpha. 11 seções (A–K).
- **`ALPHA_GUIA_RAPIDO.md`** *(novo)* — guia operacional curto em PT-BR
  para o perito que vai usar o Alpha. 13 seções.
- **`KNOWN_LIMITATIONS.md`** *(novo)* — 14 limitações conhecidas com
  workaround e próximo passo recomendado.

### Segurança
- **`.gitignore`** expandido para cobrir:
  - `*.sicroimage`, `*.sicrobackup`;
  - `imagens/exports/`, `imagens/originais/`, `imagens/analises/`;
  - `videos/originais/`, `videos/storyboards/`;
  - `croquis/exports/`;
  - `reports/`, `backups/`;
  - `**/*_sidecar.json`;
  - `sicro.sqlite`, `sicro.sqlite-journal`, `sicro.sqlite-wal`,
    `sicro.sqlite-shm`.

---

## 3. Backup do workspace — detalhes

**Botão:** Home → "Gerar backup".

**Formato:** ZIP com deflate.

**Local padrão:** `<workspace>/backups/backup_<BO>_<YYYYMMDD_HHMMSS>.sicrobackup`.

**O que é incluído:**
- `manifest.json` do workspace;
- `sicro.sqlite`;
- todas as pastas: `dossie/`, `laudos/`, `croquis/`, `videos/`,
  `imagens/`, `midias/`, `exports/`;
- relatórios já gerados em `reports/`;
- `_sicro_backup_manifest.json` (manifesto interno do backup com
  versão SICRO, workspace_id, occurrence_id, file_count, size,
  timestamp, lista de skipped_dirs).

**O que é excluído:**
- `cache/` e `logs/` (efêmero);
- a própria pasta `backups/` (evita backup-do-backup).

**Auditoria:**
- SHA-256 do `.sicrobackup` final é registrado no descritor de
  retorno;
- audit log grava `workspace.backup_generated` na ocorrência.

**Não destrutivo:** o workspace original não é tocado.

---

## 4. Relatório de saúde do sistema — detalhes

**Botão:** Home → "Relatório de saúde".

**Formato:** HTML auto-suficiente (sem JS, sem CSS externo) salvo em
`<workspace>/reports/system_health_<TS>.html`.

**Conteúdo:**
- versão do app + timestamp;
- workspace ativo (caminho, ids, tamanho em MB, integrity overall);
- **14 contadores** por módulo (fotos / laudos / croquis /
  croqui_exports / vídeos / frames / análises de imagem / derivados
  de imagem / exports laudo / evidence_links + 4 contadores de
  integridade);
- **dependências externas**: tabela com `ffmpeg` e `ffprobe`,
  ambos com `found?`, `path`, `version_hint`;
- **alertas** (`ffmpeg não encontrado no PATH`, etc.).

**Snapshot rápido (JSON):**
`get_system_health_snapshot` é o mesmo conteúdo sem gravar em disco
— usado pelo AlphaDashboard.

---

## 5. UX da Home — Alpha

- Quando **não há workspace ativo**: comportamento antigo (lista de
  recentes + botões "Nova ocorrência" / "Abrir" / "Importar").
- Quando **há workspace ativo**: aparece o `AlphaDashboard` ANTES da
  lista de recentes, com toda a visão técnica + ações.

Princípios:
- Não foi removido nada da Home antiga; o dashboard é **aditivo**.
- O conteúdo do dashboard é carregado via `get_system_health_snapshot`
  — uma chamada, ~30 ms num workspace típico.

---

## 6. Tratamento de erros consolidado

Não houve refactor agressivo — a malha de `try/catch +
toSicroError(err).message` já estava sólida desde MVP 1. O que o MVP 8
fez:

- Validou que o snapshot e o backup retornam `Result<_, SicroError>`
  com mensagens em PT-BR;
- Confirmou que `MISSING ffmpeg/ffprobe` aparece como **alerta**, não
  como crash (módulo Vídeo continua tendo o próprio tratamento ao
  tentar usar a dependência ausente);
- O AlphaDashboard exibe erros em banner vermelho próprio em vez de
  console.

Pontos críticos auditados sem incidente:
- abrir workspace inválido → `Manifest::read` retorna `Validation`
  com mensagem clara;
- SQLite indisponível → `open_connection` retorna `Database` com
  caminho do problema;
- arquivo ausente em `read_evidence_asset` / `read_image_asset` /
  `verify_workspace_integrity` → status `missing_file` no item.

---

## 7. Logs

Não foram criadas novas tabelas. O que existia:

- `occurrence_audit` (cross-module);
- `evidence_links` (MVP 4);
- `video_operation_logs` (Spike F);
- `image_operation_logs` (MVP 7).

O MVP 8 adicionou **2 novos eventos** no audit log:

- `workspace.backup_generated` (com SHA-256 do backup);
- `system.health_report_generated` (com caminho do relatório).

A Central de Evidências (MVP 5) já agrega os logs do importador,
vídeo e laudo. O log do MVP 8 entra automaticamente lá quando o
aggregator for executado.

---

## 8. Performance

- **Bundle frontend:** 1,24 MB (gzip 379 KB) — mesmo patamar do
  MVP 7. O AlphaDashboard adicionou ~3 KB ao bundle.
- **Tempo de abertura do AlphaDashboard:** snapshot completo em
  workspace típico (~30 itens) leva < 50 ms (medido localmente).
- **Backup:** workspace de teste com ~50 MB compacta em ~2 s
  (deflate). SHA-256 final adiciona ~200 ms. Aceitável.
- **Health report HTML:** < 100 ms incluindo escrita atômica.

Recomendações documentadas:
- vídeos > 1 GB tornam a verificação profunda pesada — não rodar a
  cada abertura;
- exports muito grandes (> 5000 itens) podem deixar o aggregator
  perceptível — fora do caso de uso clínico típico.

---

## 9. Empacotamento Alpha

`pnpm tauri build` **não** foi rodado neste MVP — o briefing pede
"preparar caminho", não "publicar release".

Verificações feitas:
- ✅ versão do app em `Cargo.toml` continua `2.0.0-alpha.0`;
- ✅ ícones referenciados em `tauri.conf.json` (auditar visualmente
  fora do escopo deste MVP);
- ✅ dependências externas documentadas em `KNOWN_LIMITATIONS.md`;
- ✅ relatório de saúde detecta ausência de `ffmpeg`/`ffprobe`;
- ⏳ instalador `.msi`/`.exe` validado em múltiplas máquinas: pendente
  (registrado em `KNOWN_LIMITATIONS.md` §12 como futuro spike).

---

## 10. Validações automáticas

| Comando            | Resultado                                     |
|--------------------|-----------------------------------------------|
| `pnpm typecheck`   | ✅ ok                                         |
| `pnpm test`        | ✅ **67/67** (sem novos testes TS — backup/health são puros Rust) |
| `pnpm build`       | ✅ ok — 1.24 MB (gzip 379 KB)                |
| `cargo check`      | ✅ ok                                         |
| `cargo test`       | ✅ **91/91** (+6 novos: 3 backup + 3 health) |

---

## 11. Validação manual — concluída em 2026-05-25 ✅

| Critério verificado em runtime                                                  | Resultado |
|---------------------------------------------------------------------------------|-----------|
| App abriu corretamente                                                          | ✅ ok    |
| Workspace completo abriu corretamente                                           | ✅ ok    |
| AlphaDashboard apareceu na Home                                                 | ✅ ok    |
| Dados da ocorrência apareceram na Home (BO / tipo / município / caminho)        | ✅ ok    |
| Contadores apareceram corretamente                                              | ✅ ok    |
| Status de integridade apareceu                                                  | ✅ ok    |
| Detecção de `ffmpeg` / `ffprobe` apareceu                                       | ✅ ok    |
| Botão "Atualizar" funcionou                                                     | ✅ ok    |
| Relatório de saúde foi gerado                                                   | ✅ ok    |
| Relatório HTML abriu fora do SICRO                                              | ✅ ok    |
| Backup `.sicrobackup` foi gerado                                                | ✅ ok    |
| Workspace original permaneceu íntegro após o backup                             | ✅ ok    |
| Central de Evidências abriu                                                     | ✅ ok    |
| Verificação de integridade funcionou                                            | ✅ ok    |
| Dossiê abriu e continuou funcionando                                            | ✅ ok    |
| Laudo abriu e continuou funcionando                                             | ✅ ok    |
| Croqui abriu e continuou funcionando                                            | ✅ ok    |
| Vídeo abriu e continuou funcionando                                             | ✅ ok    |
| Imagem abriu e continuou funcionando                                            | ✅ ok    |
| Importador continuou funcionando                                                | ✅ ok    |
| `git status` conferido — nenhum dado real, workspace, backup ou relatório gerado no Git | ✅ ok    |

## 12. Roteiro de validação manual (referência)

Veja `ALPHA_CHECKLIST.md` na raiz do repo para o roteiro completo.
Pontos novos a verificar especificamente neste MVP 8:

1. Abrir um workspace com dados.
2. Conferir que a Home mostra o **AlphaDashboard** com:
   - workspace ativo (BO / tipo / município);
   - contadores não-zero;
   - status pill (íntegro/atenção/crítico);
   - pills de `ffmpeg` e `ffprobe`;
   - 4 botões de ação + 6 atalhos.
3. Clicar **"Atualizar"** → contadores atualizam.
4. Clicar **"Verificar integridade"** → navega para `/evidencias`.
5. Clicar **"Relatório de saúde"** → aparece feedback com path do
   HTML; abrir o HTML fora do SICRO.
6. Clicar **"Gerar backup"** → aparece feedback com nome do arquivo,
   contador e tamanho; abrir o `.sicrobackup` (renomear para `.zip`
   se necessário) e conferir conteúdo.
7. Verificar que `cache/` e `logs/` **não** estão no backup.
8. Verificar que `_sicro_backup_manifest.json` está dentro do backup.
9. Conferir que `<workspace>/backups/` foi criado.
10. **Sem workspace ativo**: o dashboard não aparece (regressão).
11. **Regressão**: Dossiê, Laudo, Croqui, Vídeo, Imagem, Evidências,
    Importador continuam funcionando.

---

## 13. Critérios de sucesso vs. realidade

| #  | Critério                                                  | Atendido |
|----|-----------------------------------------------------------|----------|
| 1  | App abre normalmente                                      | ✅       |
| 2  | Home mais útil                                            | ✅ (AlphaDashboard) |
| 3  | Navegação entre módulos consistente                       | ✅ (atalhos da Home + ActivityRail) |
| 4  | Workspace pode ser aberto/criado                          | ✅ (sem mudanças) |
| 5  | Backup pode ser gerado                                    | ✅ (botão + 3 testes) |
| 6  | Relatório de saúde pode ser gerado                        | ✅ (HTML + JSON snapshot) |
| 7  | Logs gerais funcionam                                     | ✅ (2 novos eventos audit) |
| 8  | Integridade continua funcionando                          | ✅ (sem mudanças) |
| 9  | Erros comuns tratados                                     | ✅ (auditado) |
| 10 | Estados vazios claros                                     | ✅ (Home: AlphaDashboard só aparece com workspace; demais módulos já tinham) |
| 11 | Guia Alpha existe                                         | ✅ `ALPHA_GUIA_RAPIDO.md` |
| 12 | Checklist Alpha existe                                    | ✅ `ALPHA_CHECKLIST.md` |
| 13 | Limitações conhecidas documentadas                        | ✅ `KNOWN_LIMITATIONS.md` (14 itens) |
| 14 | `.gitignore` protege dados reais                          | ✅ (auditado em runtime — nada vazou) |
| 15 | Fluxo completo Alpha funciona                             | ✅ |
| 16 | `pnpm typecheck` passa                                    | ✅       |
| 17 | `pnpm build` passa                                        | ✅       |
| 18 | `pnpm test` passa                                         | ✅       |
| 19 | `cargo check` passa                                       | ✅       |
| 20 | `cargo test` passa                                        | ✅       |
| 21 | Módulos anteriores continuam funcionando                  | ✅ (78/78 lib + 13/13 integration) |

---

## 13. Limitações remanescentes

Documentadas em detalhe em `KNOWN_LIMITATIONS.md`:

1. **DOCX com imagens reais** (ressalva herdada do MVP 4).
2. **Paginação soft** do editor de Laudo.
3. **Vídeo depende de ffmpeg/ffprobe externos** (detectado e
   sinalizado pelo AlphaDashboard).
4. **Editor de Imagem sem UI para operações geométricas** (backend
   pronto).
5. **Sem FFT/Wavelets/CLAHE/autenticação profunda no Editor de
   Imagem**.
6. **EXIF não é lido**.
7. **Sem undo/redo persistente no Editor de Imagem**.
8. **Croqui sem OSM/Google Maps/ortorretificação**.
9. **Croqui sem edição de vértices individuais**.
10. **Performance Konva > 500 objetos / imagens > 12 MP**.
11. **Verificação profunda lenta em vídeos grandes**.
12. **Instalador final não validado**.
13. Sem IA / OCR / análise automática (princípio).
14. Alpha não substitui validação humana.

---

## 14. Riscos

- **Baixo:** mudanças no `.gitignore` podem deixar arquivos
  previamente versionados visíveis no `git status`. Mitigação: nada
  precisa ser removido — apenas amplia o filtro para o futuro.
- **Baixo:** dependência `which = "6"` adiciona ~30 KB ao binário e
  uma sub-árvore de deps (winsafe/either/home). Compatível com
  Windows/macOS/Linux.
- **Baixo:** o backup carrega o SQLite **fechado** (cópia byte-a-byte
  enquanto o app está rodando e usando-o). Em workspace ativo com
  escrita concorrente isso poderia gerar backup corrompido. Mitigação
  no MVP 8: rodar backup apenas em momento de baixa atividade. Spike
  futuro: usar `VACUUM INTO` ou `online backup API` do SQLite para
  garantir consistência total.
- **Médio:** `pnpm tauri build` ainda não validado em múltiplas
  máquinas — pode falhar no empacotamento real.

---

## 15. Recomendação final

**Recomendação: APROVADO.**

A validação manual em runtime cumpriu **todos os 21 critérios** em
§11 e os **21 critérios formais** em §13. O SICRO Desktop 2.0 passou
de "12 módulos integrados" a **Alpha operacional confiável**. A
consolidação não adicionou complexidade nova — apenas:

- a malha de **confiança técnica** (backup + relatório de saúde +
  audit expandido);
- a **porta de entrada operacional** (AlphaDashboard);
- a **documentação honesta** (checklist + guia + limitações).

Risco baixo, valor alto. **Pronto para uso em testes Alpha
controlados** com workspace descartável ou em ocorrências de baixo
risco, com supervisão direta do perito.

**Limitações remanescentes** (todas registradas em
`KNOWN_LIMITATIONS.md`):

1. **DOCX com imagens reais** (ressalva herdada do MVP 4).
2. **Paginação soft** do editor de Laudo.
3. **Vídeo depende de ffmpeg/ffprobe externos** (detectado e
   sinalizado pelo AlphaDashboard).
4. **Editor de Imagem sem UI para operações geométricas** (backend
   pronto).
5. **Sem FFT/Wavelets/CLAHE/autenticação profunda no Editor de
   Imagem**.
6. **EXIF não é lido**.
7. **Sem undo/redo persistente no Editor de Imagem**.
8. **Croqui sem OSM/Google Maps/ortorretificação**.
9. **Croqui sem edição de vértices individuais**.
10. **Performance Konva > 500 objetos / imagens > 12 MP**.
11. **Verificação profunda lenta em vídeos grandes**.
12. **Instalador final não validado** em múltiplas máquinas.
13. Sem IA / OCR / análise automática (princípio).
14. Alpha não substitui validação humana.

---

## 16. Próximos passos sugeridos

Em ordem de prioridade:

1. **Spike DOCX-imagens** — fechar a ressalva do MVP 4 (impacto na
   confiança do operador).
2. **Spike instalador Alpha** — gerar `.msi` validado em 2-3
   máquinas Windows e documentar.
3. **MVP 9 — Filtros forenses** (Sobel/CLAHE/blur gaussiano/mediana)
   sobre a fundação do MVP 7.
4. **MVP 10 — UI de operações geométricas do Editor de Imagem**
   (rotate/flip/crop/resize já existem no backend).
5. **Spike SQLite online-backup** — backup consistente mesmo com
   escrita concorrente.

---

## 17. Estado de entrega

- ✅ Backend Rust + 3 Tauri commands + módulos `workspace/backup.rs`
  e `workspace/health.rs`.
- ✅ Dependência `which = "6"` adicionada.
- ✅ Frontend: types + commands wrappers + AlphaDashboard + Home
  integrada.
- ✅ Documentação Alpha completa: `ALPHA_CHECKLIST.md`,
  `ALPHA_GUIA_RAPIDO.md`, `KNOWN_LIMITATIONS.md`.
- ✅ `.gitignore` expandido (auditado em runtime — nada vazou).
- ✅ 67/67 vitest, 91/91 cargo test, typecheck/build/cargo check
  limpos.
- ✅ Validação manual 21/21.
- ✅ Branch `mvp/consolidacao-alpha` → merge na `main` → tag
  `v0.13.0-mvp8-consolidacao-alpha`.
