# MVP 5 — Central de Evidências e Integridade do Workspace

**Branch:** `mvp/central-evidencias-integridade`
**Data:** 2026-05-25
**Status final:** ✅ **APROVADO** em validação manual

---

## 1. Visão geral

O MVP 5 cria a **camada de confiança do workspace**: um módulo
**Evidências** no SICRO Desktop que enxerga, de forma consolidada,
tudo que existe no `.sicro` da ocorrência e responde, em runtime, às
perguntas auditáveis:

> Quais evidências existem? De onde vieram? Onde estão? Qual é o
> hash? Quais já foram inseridas em laudo? Quais arquivos estão
> ausentes? Quais links estão quebrados? Quais derivados existem? O
> workspace está íntegro?

A implementação é deliberadamente **read-only e não-invasiva**:

- não migra tabelas antigas;
- não cria nova fonte da verdade;
- não bloqueia nenhum módulo se um item parecer inconsistente;
- não interpreta evidência (sem IA, sem OCR, sem velocidade).

A Central faz três coisas: consolidar leitura, verificar arquivos no
disco, gerar relatório.

---

## 2. Decisões arquiteturais

### 2.1 Registry como projeção
Em vez de uma nova tabela `evidence_registry`, o MVP introduz a
**estrutura `EvidenceRegistryItem`** (Rust + TS) e um **aggregator**
que projeta cada repo existente nessa estrutura. Vantagens:

- migration zero — risco operacional baixo;
- continua compatível com workspaces antigos;
- cada módulo segue dono dos próprios dados.

A coleção é gerada sob demanda. Custo: O(número de linhas), comportado.

### 2.2 Verificação em duas camadas
A verificação de integridade tem duas estradas distintas:

- **Leve** (padrão, sempre executada): existência do arquivo, sidecar
  esperado, segurança do caminho. Toda a operação é uma `metadata`
  syscall por item. Rodada automaticamente ao abrir a Central.
- **Profunda** (botão): além disso, recomputa SHA-256 com leitura
  streaming. Necessária para detectar corrupção silenciosa, mas
  cara em vídeos grandes — fica como ação explícita.

### 2.3 Helper de path safety unificado
Foi extraído um **único helper** (`crate::filesystem::workspace_paths`)
com `sanitize_relative_path`, `resolve_workspace_relative` e
`probe_workspace_relative`. Todos os módulos antigos passam a poder
consumi-lo; o `evidence_commands` original já foi refatorado para usar
o helper compartilhado (eliminando a duplicação que existia desde o
MVP 4).

### 2.4 Detector de links quebrados in-doc
Em vez de exigir que o Document Engine emita eventos, o detector
**lê cada `.sicrodoc` como JSON e percorre o tree** procurando nodes
com `attrs.relative_path`. Isso cobre:
- `figure` (fotos, croquis, video frames inseridos via MVP 4);
- `storyboardItem` (frames de storyboard);
- qualquer node futuro que adote o mesmo contrato.

Falhas de parser ou leitura viram **um aviso, não um crash**.

### 2.5 Relatório HTML autosuficiente
O relatório é HTML estático sem JavaScript ou CSS externo — para
poder ser arquivado, espelhado em mídia removível ou impresso como
evidência. Arquivado em `<workspace>/reports/workspace_integrity_<TS>.html`.

---

## 3. Arquivos novos / alterados

### 3.1 Backend Rust

**Novos:**
- `src-tauri/src/filesystem/workspace_paths.rs` — sanitize/resolve/probe + 14 testes.
- `src-tauri/src/models/registry.rs` — `EvidenceKind`, `IntegrityStatus`, `EvidenceRegistryItem`, `RegistrySummary`, `BrokenLaudoLink`, `WorkspaceIntegrityReport`, `IntegrityReportArtifact`, `VerifyOptions`.
- `src-tauri/src/registry/mod.rs` — fachada do módulo.
- `src-tauri/src/registry/aggregator.rs` — `build_registry` + `build_summary` + 5 testes.
- `src-tauri/src/registry/integrity.rs` — `verify_workspace` + `verify_one` + 6 testes.
- `src-tauri/src/registry/broken_links.rs` — `detect_broken_laudo_links` + 5 testes.
- `src-tauri/src/registry/report.rs` — `render_html_report` + 5 testes.
- `src-tauri/src/commands/registry_commands.rs` — 7 commands Tauri.

**Modificados:**
- `src-tauri/src/filesystem/mod.rs` — re-exports.
- `src-tauri/src/models/mod.rs` — registra `registry` + re-exports.
- `src-tauri/src/commands/mod.rs` — registra `registry_commands`.
- `src-tauri/src/lib.rs` — registra `registry` + 7 novos handlers.
- `src-tauri/src/commands/evidence_commands.rs` — adota `sanitize_relative_path` compartilhado (remove duplicação MVP 4).
- `src-tauri/src/database/repositories/export_repo.rs` — `list_by_occurrence`.
- `src-tauri/src/database/repositories/evidence_link_repo.rs` — `list_for_occurrence`.

### 3.2 Frontend (TypeScript / React)

**Novos:**
- `src/types/evidence_registry.ts` — mirrors dos models Rust.
- `src/modules/evidencias/EvidenciasModule.tsx` — shell com 9 abas.
- `src/modules/evidencias/EvidenciasModule.module.css` — estilos.
- `src/modules/evidencias/shared.ts` — utilitários (assetUrl, statusClass, prettyBytes, kindLabel…).
- `src/modules/evidencias/tabs/SummaryTab.tsx`
- `src/modules/evidencias/tabs/AllItemsTab.tsx`
- `src/modules/evidencias/tabs/PhotosTab.tsx`
- `src/modules/evidencias/tabs/CroquisTab.tsx`
- `src/modules/evidencias/tabs/VideosTab.tsx`
- `src/modules/evidencias/tabs/FramesTab.tsx`
- `src/modules/evidencias/tabs/LaudosLinksTab.tsx`
- `src/modules/evidencias/tabs/IntegrityTab.tsx`
- `src/modules/evidencias/tabs/LogsTab.tsx`

**Modificados:**
- `src/app/App.tsx` — rota `/evidencias`.
- `src/app/ActivityRail.tsx` — item *Evidências* (ícone Boxes).
- `src/core/commands.ts` — 7 wrappers TS para os commands Rust.

---

## 4. Commands Tauri adicionados (MVP 5)

| Comando                                  | O que faz                                                |
|------------------------------------------|----------------------------------------------------------|
| `list_evidence_registry_items`           | retorna o registry consolidado sem verificação           |
| `get_evidence_registry_summary`          | contadores + verificação leve                            |
| `verify_workspace_integrity`             | verificação leve OU profunda, conforme `options.deep`    |
| `list_evidence_links`                    | todos os `evidence_links` da ocorrência                  |
| `open_evidence_file`                     | abre o arquivo no app default do SO                      |
| `reveal_evidence_in_folder`              | revela o arquivo no explorer/finder                      |
| `generate_workspace_integrity_report`    | grava `reports/workspace_integrity_<TS>.html` no workspace |

Todos resolvem `workspace_path → Manifest → occurrence_id` (nunca
confiam num occurrence_id vindo do frontend).

---

## 5. Estrutura das abas (UI)

1. **Resumo** — pill de status global + 3 cartões de contadores (kinds, vínculos, saúde). Botão *Gerar relatório*.
2. **Todas** — tabela completa com 5 filtros (tipo, status, módulo, "em laudo", busca livre) + 5 ações por linha (abrir, revelar, copiar caminho, copiar referência JSON, ver metadados).
3. **Fotos** — galeria miniaturada com hash, status, contagem de inserções em laudo.
4. **Croquis** — uma linha por croqui, exibindo `.sicrocroqui` + PNG exportado lado a lado, com status independentes.
5. **Vídeos** — codec, resolução, duração, hash, número de frames coletados, status.
6. **Frames** — miniaturas dos frames extraídos pelo FFmpeg, com filtro "Inseridos em laudo / Não inseridos / Todos".
7. **Laudos & vínculos** — contagem por tipo de evidência (fotos/croquis/frames/storyboard/tabelas/notas/dados) + exportações HTML/PDF/DOCX + links quebrados por laudo.
8. **Integridade** — botões *Verificação leve* / *Verificação profunda* / *Gerar relatório HTML*; tabela só de itens com problema.
9. **Logs** — consolida `video_operation_logs` + `evidence_links` + warnings/errors do `imports`. Documenta a lacuna nos módulos sem log estruturado.

---

## 6. Não fazer (princípios respeitados)

- ❌ Não cria módulo de análise pericial.
- ❌ Não implementa IA / OCR / análise automática.
- ❌ Não interpreta evidência.
- ❌ Não edita foto, vídeo ou croqui.
- ❌ Não tenta corrigir o DOCX (a ressalva do MVP 4 fica para um Spike).
- ❌ Não refatora tabelas antigas (apenas adiciona dois `list_for_occurrence`).
- ❌ Não cria migration destrutiva (nenhuma migration foi criada — só código).
- ❌ Não quebra Laudo / Dossiê / Croqui / Vídeo / Importador (cargo test 77/77 ok, vitest 24/24 ok).
- ❌ Não versionou dado real, foto, vídeo, frame PNG ou workspace `.sicro`.

---

## 7. Segurança de caminhos

Todos os caminhos vindos da UI passam por **`sanitize_relative_path`**:

- rejeita vazios;
- rejeita absolutos (`/foo`, `\\foo`);
- rejeita drive-anchored (`C:\foo`, `d:/tmp`);
- rejeita `..` em qualquer posição;
- normaliza separadores;
- colapsa `.` e segmentos vazios.

`probe_workspace_relative` faz a checagem de existência sem uma única
syscall a mais que o necessário, e classifica o resultado em
`Ok / Missing / Unsafe / Empty` — usado pela verificação leve.

`resolve_workspace_relative` apenas combina sanitize + join sem
filesystem I/O — seguro de chamar em loops.

---

## 8. Verificador de integridade — comportamento

Para cada item do registry, em uma passada:

1. Probe do `relative_path` (existência + segurança).
2. Probe do `sidecar_relative_path`, se presente.
3. (Modo profundo) recompute SHA-256 e compara.

Status possíveis (matching `IntegrityStatus`):
- `ok`
- `missing_file`
- `hash_mismatch`
- `missing_sidecar`
- `broken_link` (figura/storyboard no .sicrodoc que não bate)
- `unsafe_path`
- `unknown` (item sem caminho — ex.: campo de ocorrência)

O agregado (overall) é:
- **crítico** se houver `unsafe_path` ou `hash_mismatch`;
- **atenção** se houver `missing_file` ou `broken_link`;
- **íntegro** caso contrário.

Falhas individuais nunca abortam o lote — viram `integrity_detail` e
seguem.

---

## 9. Testes automatizados

| Suíte                                            | Resultado |
|--------------------------------------------------|-----------|
| `cargo test --lib filesystem::workspace_paths`   | 14/14     |
| `cargo test --lib registry::*`                   | 21/21     |
| `cargo test` (libs + integration completos)      | 77/77     |
| `pnpm test` (Vitest)                             | 24/24     |
| `pnpm typecheck`                                 | ok        |
| `pnpm build`                                     | ok (1.17 MB / gzip 358 KB) |
| `cargo check`                                    | ok        |

**Cobertura por área:**

- *Path safety:* 14 testes cobrindo todas as classes de payload malicioso.
- *Aggregator:* contagem de kinds, agregação de status, dedupe de
  links em múltiplos laudos, mapeamento de croqui→PNG.
- *Integrity verifier:* arquivo existente, ausente, traversal, sidecar
  ausente, hash conferindo, hash divergindo.
- *Broken-link detector:* nenhum laudo, .sicrodoc ausente, figure
  pontuando para arquivo ausente, figure pontuando para arquivo OK,
  path inseguro dentro do .sicrodoc, .sicrodoc malformado.
- *HTML report:* DOCTYPE, pill de status, escape, presença do item,
  bloco vazio de links quebrados, padrão de nome de arquivo por
  timestamp.

---

## 10. Limites conhecidos / dívida técnica

1. **Logs**: somente Vídeo (via `video_operation_logs`), Laudo (via
   `evidence_links`) e Importador (via `warnings_json`/`errors_json` em
   `imports`) emitem entrada. Croqui, Dossiê e o pipeline de export
   não geram log estruturado por enquanto — a aba *Logs* documenta a
   lacuna na própria UI.
2. **Lista de eventos por vídeo**: a Central exibe contagem de frames
   por vídeo, mas a contagem de **eventos** (`video_events`) só
   aparece se o usuário abrir o módulo Vídeo — o agregador atual não
   chama `list_events_for_media` para evitar mais um round-trip por
   vídeo. Pode entrar no MVP 6 se for considerado essencial.
3. **Performance da verificação profunda**: leitura streaming via
   `sha256_file`, mas em vídeos grandes (> 1 GB) o operador deve
   esperar. Não há cancelamento. Documentado como `reservado para a
   botão "Verificação profunda"`.
4. **Hash mismatch quando o arquivo é regravado pelo SICRO**: alguns
   módulos (Laudo ao salvar `.sicrodoc`) reescrevem o arquivo
   atomicamente; nesses casos `media_assets.sha256` não muda (e nem
   deve) porque ele é o hash do arquivo na importação, não do estado
   atual. O verificador respeita isso — só compara hash em itens cuja
   tabela armazena hash do conteúdo presente (vídeo, pacote
   importado).
5. **Open/Reveal no Linux GUI-less**: a implementação usa `xdg-open`
   / `explorer /select,` / `open -R`. Em ambientes sem desktop ela
   silenciosamente falha com mensagem clara via `SicroError`.

---

## 11. Validação manual — concluída em 2026-05-25 ✅

| Critério verificado em runtime                                                  | Resultado |
|---------------------------------------------------------------------------------|-----------|
| Módulo Evidências abriu dentro do SICRO                                         | ✅ ok     |
| Aba *Resumo* apareceu                                                           | ✅ ok     |
| Aba *Todas as evidências* apareceu                                              | ✅ ok     |
| Aba *Fotos* apareceu                                                            | ✅ ok     |
| Aba *Croquis* apareceu                                                          | ✅ ok     |
| Aba *Vídeos* apareceu                                                           | ✅ ok     |
| Aba *Frames/Storyboard* apareceu                                                | ✅ ok     |
| Aba *Laudos/Vínculos* apareceu                                                  | ✅ ok     |
| Aba *Integridade* apareceu                                                      | ✅ ok     |
| Aba *Logs* apareceu                                                             | ✅ ok     |
| Resumo exibiu contadores                                                        | ✅ ok     |
| Listagem consolidada de evidências funcionou                                    | ✅ ok     |
| Fotos importadas do SICRO Operacional apareceram                                | ✅ ok     |
| Croquis apareceram                                                              | ✅ ok     |
| Vídeos apareceram                                                               | ✅ ok     |
| Frames / storyboard apareceram                                                  | ✅ ok     |
| Laudos e vínculos apareceram                                                    | ✅ ok     |
| Verificação de integridade funcionou                                            | ✅ ok     |
| Detecção de arquivo ausente / link quebrado (teste controlado) funcionou        | ✅ ok     |
| Relatório HTML de integridade foi gerado                                        | ✅ ok     |
| Relatório abriu fora do SICRO (browser do SO)                                   | ✅ ok     |
| Copiar caminho relativo funcionou                                               | ✅ ok     |
| Copiar referência técnica (JSON) funcionou                                      | ✅ ok     |
| Revelar arquivo na pasta funcionou                                              | ✅ ok     |
| Laudo / Dossiê / Croqui / Vídeo / Importador continuaram funcionando            | ✅ ok     |

## 12. Roteiro de validação manual (referência)

1. **Abrir workspace existente** com fotos + croqui exportado + vídeo
   com storyboard + laudo com evidências.
2. Clicar em **Evidências** no ActivityRail.
3. Conferir a aba **Resumo** — contadores devem bater com a realidade
   do workspace; pill deve dizer "íntegro" se não há quebras.
4. Aba **Todas** — testar os 5 filtros + busca + as 5 ações
   (Abrir/Revelar/Copiar/JSON/Ver metadados).
5. Aba **Fotos** — miniaturas devem aparecer; "Abrir" deve abrir no
   visualizador do SO.
6. Aba **Croquis** — fonte e PNG aparecem em colunas separadas;
   "Revelar PNG na pasta" abre o explorer corretamente.
7. Aba **Vídeos** — codec/resolução/duração presentes; contagem de
   frames bate.
8. Aba **Frames** — miniaturas + filtro Linked/Unlinked.
9. Aba **Laudos & vínculos** — para um laudo recém-criado com fotos
   e storyboard, as contagens devem mostrar fotos/storyboards
   inseridos.
10. Aba **Integridade** — `Verificação leve` → `Verificação profunda`
    → `Gerar relatório HTML` → `Abrir relatório salvo` (HTML deve
    abrir no navegador).
11. Aba **Logs** — eventos do importador + inserções em laudo +
    operações de vídeo aparecem ordenados por timestamp desc.
12. **Cenário negativo controlado** (workspace descartável):
    - Renomear/mover uma foto que esteja inserida em laudo;
    - Voltar à Central → Resumo deve sair de `íntegro` → `atenção`;
    - Aba *Integridade* deve listar o item como `missing_file`;
    - *Laudos & vínculos* deve listar o link quebrado;
    - Gerar relatório HTML — abrir e conferir a lista de problemas.
13. **Caminho inseguro** (manual): editar o `.sicrodoc` à mão para
    incluir `attrs.relative_path: "../etc/passwd"` em uma figura.
    Central deve marcar o link como `unsafe_path` e o status global
    cair para `crítico`.

---

## 13. Critérios de sucesso vs. realidade

| # | Critério                                                | Atendido |
|---|---------------------------------------------------------|----------|
| 1 | Módulo Evidências abrir no SICRO                        | ✅       |
| 2 | Resumo da ocorrência aparecer                           | ✅       |
| 3 | Fotos listadas                                          | ✅       |
| 4 | Croquis listados                                        | ✅       |
| 5 | Vídeos listados                                         | ✅       |
| 6 | Frames/storyboard listados                              | ✅       |
| 7 | Laudos listados                                         | ✅       |
| 8 | Vínculos com laudo aparecem                             | ✅       |
| 9 | Status de integridade aparece                           | ✅       |
| 10 | Arquivos ausentes detectados                           | ✅ (testes + verificação leve real) |
| 11 | Links quebrados em laudo detectados                    | ✅       |
| 12 | Caminhos inseguros bloqueados                          | ✅ (14 testes de path safety) |
| 13 | Relatório de integridade gerado                        | ✅ (HTML em `reports/`) |
| 14 | Abrir/revelar arquivo funciona                         | ✅ (Windows/macOS/Linux) |
| 15 | Copiar caminho relativo funciona                       | ✅       |
| 16 | Copiar referência técnica funciona                     | ✅ (JSON na aba Todas) |
| 17 | App permanece rápido                                   | ✅ (sem hash automático, sem mutação) |
| 18 | Laudo, Dossiê, Croqui, Vídeo, Importador continuam     | ✅ (cargo test + vitest 100%) |
| 19 | Validações automáticas passam                          | ✅ (tabela §9) |

---

## 14. Recomendação final

**Recomendação: APROVADO.**

A validação manual em runtime cumpriu todos os 25 critérios listados
em §11. A Central de Evidências resolve o objetivo declarado —
transformar o `.sicro` em um *workspace auditável* — sem invadir o
domínio de nenhum módulo existente. O risco operacional é baixo:

- nenhuma tabela foi migrada;
- nenhum dado é mutado;
- todos os módulos antigos continuam funcionando.

Limitações remanescentes (§10) são incrementais e **não bloqueiam o
uso clínico** do MVP 5:

1. **Logs**: Croqui, Dossiê e pipeline de export ainda não emitem log
   estruturado. A aba *Logs* mostra a lacuna na própria UI.
2. **Contagem de eventos de vídeo** na aba *Vídeos*: só aparece se o
   perito abrir o módulo Vídeo (evita N+1 query desnecessário).
3. **Verificação profunda**: leitura streaming via `sha256_file`, mas
   sem cancelamento. Vídeos > 1 GB demoram.
4. **DOCX com imagens reais**: pendência herdada do MVP 4, não tocada
   neste MVP por design.

**Próximo passo recomendado** (sob autorização):
- **MVP 6** — Imagens & Mídias (visualização avançada / lightbox / EXIF
  / categorização), aproveitando o registry recém-construído como
  fonte única; OU
- **Spike DOCX-imagens** — fechar a ressalva técnica do MVP 4 sem
  acoplar a um novo MVP, conforme plano em
  `MVP4_EVIDENCIAS_NO_LAUDO_RELATORIO.md` §7.

---

## 15. Estado de entrega

- ✅ Backend Rust + 7 commands Tauri prontos.
- ✅ Frontend TS + 9 abas prontas.
- ✅ Helper de path safety + 14 testes.
- ✅ Verificador de integridade + 6 testes.
- ✅ Detector de links quebrados + 5 testes.
- ✅ Relatório HTML autosuficiente + 5 testes.
- ✅ Aggregator + 5 testes.
- ✅ `pnpm typecheck` / `pnpm build` / `pnpm test` / `cargo check` /
  `cargo test` — todos verdes.
- ✅ Validação manual concluída — 25/25 critérios.
- ✅ Branch `mvp/central-evidencias-integridade` → merge na `main` →
  tag `v0.10.0-mvp5-central-evidencias-integridade`.
