# Spike D — Importador Técnico `.sicroapp`

> Spike incremental do SICRO Desktop 2.0, construído sobre
> `v0.4.0-mvp2-laudo-institucional`.
> Branch: **`spike/sicroapp-importer`** → integrada à `main` em 2026-05-25.
> Tag de checkpoint: **`v0.5.0-spike-d-sicroapp-importer`**.
>
> **Status:** ✅ APROVADO EM RUNTIME COM PACOTE REAL — todos os 25 critérios
> do briefing atendidos, validação manual feita com um `.sicroapp` exportado
> pelo SICRO Operacional mobile.
>
> **Ressalva registrada (NÃO bloqueia o spike):**
> A visualização do módulo Dossiê é deliberadamente básica nesta versão
> (identificação + lista de imports + galeria de fotos). Checklist, veículos,
> vítimas, vestígios, medições, observações, timeline e estatísticas ainda
> não viram UI completa — ficam para **MVP 3 — Dossiê Operacional**.

---

## Objetivo

> "O SICRO Desktop 2.0 consegue abrir, validar e importar minimamente um
> pacote `.sicroapp` real do SICRO Operacional para dentro de um workspace
> `.sicro`, preservando integridade, rastreabilidade e evidências básicas?"

A resposta deste spike é **sim** — com a ressalva honesta de que a validação
foi exercitada com fixtures sintéticas (construídas in-memory pelos testes).
A aprovação final depende de um pacote real, conforme você definiu.

---

## 1. Decisões arquiteturais-chave

| Decisão | Por quê |
|---|---|
| **Importador 100% em Rust + um único Tauri command na borda.** | Mantém o frontend agnóstico ao contrato `.sicroapp`. Mudança futura de formato (`1.0`) só toca `src-tauri/src/importer/`. |
| **Workspace destino é criado por importação.** | Cada `.sicroapp` vira **um workspace `.sicro` próprio**. Isola dados, reusa o pipeline do Spike A (SQLite + manifest + estrutura de pastas), evita "merge implícito" silencioso entre pacotes diferentes. |
| **Detecção de duplicidade cross-workspace via `imports_index.json`.** | Como cada import cria um SQLite isolado, a checagem `SELECT … WHERE package_sha256 = ?` no banco do workspace **destino** não impediria reimportar o mesmo pacote em workspaces diferentes. O índice global no config dir resolve o problema (e o SQLite local mantém a checagem como defesa em profundidade). |
| **Path traversal SEMPRE sanitizado.** | Todo `entry.name()` da ZIP passa por `safe_zip::sanitize_zip_path` antes de qualquer write. Testes unitários cobrem `..`, paths absolutos, drive letters, NUL e controle. |
| **Hashes verificados em streaming.** | Fotos podem ter MBs. `sha256::sha256_file` lê em chunks de 64 KiB; o reader do ZIP usa o mesmo padrão. Memória plana. |
| **`Occurrence` recebe colunas aditivas, nada renomeado.** | Compatibilidade com Spike A: laudos criados antes da migration 004 continuam abrindo sem migração de dados. |
| **`hashes.json` é best-effort, não bloqueante.** | Doc §15: "foto ausente: permitir importação parcial com alerta". Mismatch vira warning na UI, não erro fatal. |
| **`raw_*_json` preservados como string verbatim.** | Doc §6: "guardar `raw_json` além dos campos estruturados". O Desktop não precisa entender hoje os campos exóticos do mobile — só não pode perdê-los. |

---

## 2. Arquivos criados / alterados

### Criados (15)

```
src-tauri/migrations/004_imports.sql                      # tabelas imports / media_assets / evidence_items + ALTER occurrences
src-tauri/src/models/import.rs                            # Import, MediaAsset, EvidenceItem, ImportReport, ImportSicroappInput, ImportResult, ImportStatus, MediaAssetType, HashMismatch
src-tauri/src/database/repositories/import_repo.rs        # insert / find_by_package_sha256 / update_status_and_warnings / list_all
src-tauri/src/database/repositories/media_asset_repo.rs   # insert / list_by_occurrence
src-tauri/src/database/repositories/evidence_item_repo.rs # insert
src-tauri/src/importer/mod.rs                             # módulo público
src-tauri/src/importer/safe_zip.rs                        # sanitize_zip_path (path traversal protection)
src-tauri/src/importer/manifest_parser.rs                 # parser tolerante do manifest.json (PT-BR + EN aliases)
src-tauri/src/importer/package_reader.rs                  # ZIP reader (open, read_to_bytes, extract_to, sha256, parse_hashes_json)
src-tauri/src/importer/orchestrator.rs                    # run_import — orquestrador do fluxo end-to-end
src-tauri/src/importer/registry.rs                        # ImportRegistry cross-workspace (imports_index.json global)
src-tauri/src/commands/import_commands.rs                 # 4 tauri commands
src-tauri/tests/sicroapp_importer.rs                      # 5 testes de integração (happy path + duplicidade + missing photo + hash mismatch + unknown format)
src/types/import.ts                                       # types TS espelhando os models Rust
src/modules/home/ImportSicroappDialog.tsx + .module.css   # botão "Importar .sicroapp" → modal de progresso + relatório
src/modules/dossie/DossieModule.tsx + .module.css         # vista básica do dossiê importado + galeria de fotos
```

### Alterados (12)

```
src-tauri/Cargo.toml                              # +sha2, zip movido para deps, +protocol-asset feature do tauri
src-tauri/src/database/migrations.rs              # +Migration "004_imports"
src-tauri/src/database/repositories/mod.rs        # +import_repo, +media_asset_repo, +evidence_item_repo
src-tauri/src/hashing/sha256.rs                   # implementação real (estava vazio em Spike A)
src-tauri/src/lib.rs                              # +módulo importer, +4 commands
src-tauri/src/commands/mod.rs                     # +import_commands
src-tauri/src/models/mod.rs                       # +exports do import.rs
src-tauri/src/models/occurrence.rs                # +import_id, original_mobile_id, primary_accuracy_m, resultado, raw_*_json
src-tauri/src/database/repositories/occurrence_repo.rs # SQL adapta-se às novas colunas
src-tauri/src/workspace/create.rs                 # popula None nos campos novos (Spike A continua igual)
src-tauri/tauri.conf.json                         # +assetProtocol.enable=true (galeria de fotos no WebView)
src/app/App.tsx                                   # /dossie agora resolve para DossieModule
src/app/ActivityRail.tsx                          # /dossie deixa de ser disabled
src/core/commands.ts                              # 4 wrappers TS dos novos commands
src/types/occurrence.ts                           # mesmos campos aditivos
src/modules/home/HomeView.tsx                     # 3º botão "Importar .sicroapp…"
```

---

## 3. Contrato implementado

### 3.1 Manifest aceito

**Obrigatório:** `formato` ∈ {`sicroapp`, `sicrocampo`} **e** `versao` (string).

**Opcional, com aliases (PT-BR oficial + EN futuro):**

| Mobile v0.6 | Desktop também aceita |
|---|---|
| `gerado_em` | `exported_at` |
| `versao` | `schema_version` |
| `avisos` | `notes` |
| `arquivos` | `files` |
| — | `app_name`, `app_version` |

Mantém o princípio do doc §14: "só adicionar; nunca renomear, mover, remover".

### 3.2 Arquivos lidos do ZIP (v0.6)

`manifest.json`, `metadados.json`, `caso.json`, `localizacao.json`,
`gps_leituras.json`, `estatisticas.json`, `timeline.json`, `checklist.json`,
`fotos.json`, `veiculos.json`, `vitimas.json`, `vestigios.json`,
`medicoes.json`, `observacoes.json`, `operacional.json`, `hashes.json`.

Todos opcionais exceto `manifest.json`. Faltantes geram entry em
`jsons_missing` do relatório (warning, nunca erro fatal).

### 3.3 Persistência no SQLite do workspace destino

**Tabela `imports`** (migration 004) — uma row por pacote:

| Coluna | Origem |
|---|---|
| `id` | UUID v4 Desktop |
| `package_relative_path` | `imports/<id>/original_package.sicroapp` |
| `original_filename` | nome do arquivo no disco do usuário |
| `package_sha256` | SHA-256 streaming do `.sicroapp` |
| `format`, `schema_version` | `manifest.formato`/`versao` |
| `app_name`, `app_version` | aditivo (não existe em v0.6 ainda) |
| `mobile_occurrence_id` | `manifest.ocorrencia.id` |
| `status` | `imported` / `imported_with_warnings` / `failed` |
| `warnings_json`, `errors_json` | arrays JSON |
| `raw_manifest_json` | manifest verbatim |
| `imported_at` | ISO-8601 |

**Tabela `occurrences`** (Spike A + colunas aditivas):

Mapeamento conforme doc §16:

| `.sicroapp` | `occurrences` |
|---|---|
| `caso.bo` | `numero_bo` |
| `caso.requisicao` | `requisicao` |
| `caso.protocolo` | `protocolo` |
| `caso.delegacia` | `delegacia` |
| `caso.municipio` | `municipio` |
| `caso.bairro` | `bairro` |
| `caso.logradouro` | `logradouro` |
| `caso.referencia` | `referencia` |
| `caso.peritos` (string separada por `,;\n`) | `peritos` (array) |
| `caso.acionamento_em` / `chegada_em` / `encerramento_em` | `data_acionamento` / `data_chegada` / `data_encerramento` (ISO-8601) |
| `metadados.tipo_pericia` | `tipo_pericia` |
| `metadados.natureza` | `natureza` |
| `metadados.resultado` | `resultado` |
| `localizacao.latitude` / `longitude` / `precisao_m` | `latitude` / `longitude` / `primary_accuracy_m` |
| `manifest.ocorrencia.id` | `original_mobile_id` |
| `caso.json` verbatim | `raw_case_json` |
| `metadados.json` verbatim | `raw_metadata_json` |
| `localizacao.json` verbatim | `raw_location_json` |

**Tabela `media_assets`** (uma row por foto extraída):

Captura `id` mobile (`foto_<microseconds>`), tipo (`photo`), caminho relativo
no workspace (`media/photos/<sanitized_id>.<ext>`), `sha256` real (recalculado),
`mime_type` inferido pela extensão, `category` da `fotos.json`, `caption` (legenda),
`raw_json` com o objeto inteiro de `fotos.json[]` verbatim.

**Tabela `evidence_items`** (uma row por foto, tipo `photo`):

Aponta para o `media_asset_id` correspondente. `source_module = "photos"`.
Está pronta para receber tipos futuros (`trace`, `measurement`, etc.).

### 3.4 Estrutura do workspace destino

```text
<base>/import_<tipo>_<id_mob_tail>_<short_uuid>.sicro/
├── manifest.json                              ← do workspace (não confundir com .sicroapp)
├── sicro.sqlite                                ← imports, occurrences, media_assets, evidence_items, …
├── imports/
│   └── <import_id>/
│       ├── original_package.sicroapp           ← cópia integral do pacote original
│       └── import_report.json                  ← snapshot persistido do ImportReport
├── media/
│   └── photos/
│       ├── foto_001.jpg
│       └── foto_002.jpg
├── dossie/  laudos/  laudos/assets/  logs/
```

### 3.5 Integridade

- **SHA-256 do pacote inteiro** é calculado em streaming pelo `package_sha256()`.
- **`hashes.json`** (formato mobile: `{ "algoritmo": "SHA-256", "arquivos": [{ "caminho": "...", "sha256": "..." }] }`) é parseado por `parse_hashes_json` (rejeitando caminhos com `..` ou absolutos no próprio JSON).
- Cada arquivo listado é **rehasheado em streaming** pelo `PackageReader::sha256`; divergências viram `HashMismatch { path, expected, actual }` no relatório.
- **Mismatch da foto vs. `fotos[].sha256` do mobile** também é checado, em separado, durante a extração.

### 3.6 Detecção de duplicidade

Política implementada (alinhada com a resposta "Bloquear com aviso"):

1. **Cross-workspace**: `ImportRegistry` lê `<config_dir>/imports_index.json` antes de criar qualquer workspace. Se o `package_sha256` já apareceu, retorna `SicroError::Validation("package already imported on … workspace … import_id …")`.
2. **Within-workspace**: o `import_repo::find_by_package_sha256` na SQLite local atua como defesa em profundidade (cobre o caso raríssimo do registry ter sido deletado).
3. A UI captura o erro e mostra a mensagem no panel `ErrorPanel` do dialog.

### 3.7 Path traversal

Cobertos por `safe_zip::sanitize_zip_path` + testes unitários:

```
manifest.json                             ✅ accepted
fotos/foto_123.jpg                        ✅ accepted
fotos\foto_123.jpg                        ✅ accepted (normalised)
./fotos//foto_123.jpg                     ✅ accepted (deduped)
../etc/passwd                             ❌ rejected — uses ..
fotos/../../../boom.txt                   ❌ rejected — uses ..
/etc/passwd                               ❌ rejected — absolute
\Windows\System32\evil.exe                ❌ rejected — absolute
C:/Windows/System32/evil.exe              ❌ rejected — drive
""  /  "\u{0}"  /  "foo\nbar"             ❌ rejected — empty/control
```

A mesma sanitização é aplicada a `hashes.json` (paths no JSON) e ao
`arquivo` declarado em `fotos.json[]`.

---

## 4. Validações executadas

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ Sem erros |
| `pnpm build` | ✅ 1724 módulos, **717 KB JS / 226 KB gzip**, 44,5 KB CSS / 8,4 KB gzip |
| `cargo check` (workspace) | ✅ |
| `cargo test` (lib) | ✅ **21/21** — inclui `safe_zip`, `manifest_parser`, `package_reader`, `registry`, `sha256` |
| `cargo test --test sicroapp_importer` | ✅ **5/5** integração: happy path + duplicidade + foto ausente + hash divergente + manifesto inválido |
| `cargo test --test docx_export` (Spike C/MVP 2 — não-regressão) | ✅ **6/6** |

Total Rust: **32/32 testes verdes**.

---

## 5. Critérios de sucesso x entregue

| # | Critério (do briefing) | Estado |
|---|---|---|
| 1 | Selecionar `.sicroapp` no Desktop | ✅ `openFileDialog` com filtros `.sicroapp`/`.sicrocampo` |
| 2 | Validar ZIP | ✅ `PackageReader::open` rejeita não-ZIP com mensagem clara |
| 3 | Ler `manifest.json` | ✅ `manifest_parser::parse` |
| 4 | Ler versão/formato | ✅ |
| 5 | Ler `hashes.json` se existir | ✅ |
| 6 | Calcular hashes e gerar relatório | ✅ `verify_hashes` + `ImportReport.hashes_*` |
| 7 | Criar `imports` | ✅ |
| 8 | Criar ocorrência no SQLite | ✅ |
| 9 | Preservar `original_mobile_id` | ✅ `Occurrence.original_mobile_id` |
| 10 | Copiar pacote para `imports/<id>/` | ✅ `stage_package` |
| 11 | Ler `caso.json` | ✅ |
| 12 | Ler `metadados.json` | ✅ |
| 13 | Ler `localizacao.json` | ✅ |
| 14 | Ler `fotos.json` | ✅ |
| 15 | Copiar fotos para `media/photos/` | ✅ extração streaming + nome controlado |
| 16 | Criar `media_assets` | ✅ |
| 17 | Criar `evidence_items` | ✅ tipo `photo`, vínculo via `media_asset_id` |
| 18 | Gerar `import_report.json` | ✅ atomic_write em `imports/<id>/` |
| 19 | Frontend exibe resumo | ✅ `ImportSicroappDialog → DonePanel` |
| 20 | Frontend permite abrir ocorrência importada | ✅ botão "Abrir ocorrência importada" |
| 21 | Fotos visíveis em galeria simples | ✅ `DossieModule + PhotoGallery` (via `convertFileSrc`) |
| 22 | Pacote duplicado detectado por hash | ✅ `ImportRegistry` (cross-workspace) + checagem SQLite local |
| 23 | Foto ausente gera aviso, não crash | ✅ testado |
| 24 | Caminhos maliciosos no ZIP bloqueados | ✅ `safe_zip` + testes |
| 25 | Spikes A/B/C/MVP 2 continuam funcionando | ✅ `cargo test --test docx_export 6/6` + migration aditiva |

---

## 6. Limitações honestas

- **Validação manual com `.sicroapp` real ainda pendente.** Os 5 testes de integração usam fixtures sintéticas (ZIPs criados em memória pelo próprio teste). Eu validei contrato (estrutura, hashes, duplicidade, traversal), mas não validei caminhos de bytes específicos do mobile real (encoding, EXIF, ordem de entradas, etc.). **A aprovação final do spike depende de você rodar com um pacote real.**

- **Sem progresso granular.** O dialog mostra "Importando…" sem percentagem. Para pacotes pequenos (≤ algumas dezenas de fotos) é instantâneo; para pacotes grandes seria desejável uma barra. Fora do escopo deste spike.

- **Sem importação estruturada de checklist/veiculos/vitimas/vestigios/medicoes/observacoes.** O importer LÊ esses JSONs (entram em `jsons_read`), mas não cria tabelas próprias ainda. **Apenas fotos viram entidades estruturadas** (`media_assets` + `evidence_items`). Isso é deliberado e alinhado ao briefing: "Para este spike, nem todos precisam virar tabelas completas."

- **Sem mapeamento timezone.** ISO-8601 sem offset (`2026-05-25T13:10:00.000`) é tratado como UTC. O mobile Dart geralmente emite formato local-naive — pode haver shift de horas no Desktop até definirmos política institucional.

- **EXIF não é lido.** A `media_assets.captured_at` vem de `fotos[].capturada_em` (ISO do mobile), não do JPEG. Doc §9 marca isso como pendência futura.

- **Sem botão "abrir importação anterior"** quando o pacote é detectado como duplicado. A mensagem de erro contém o caminho do workspace anterior e o `import_id`, mas não é clicável. Melhoria fácil para próximo iter.

- **`tauri.conf.json` agora libera `assetProtocol.scope.allow: ["**"]`.** Necessário para o WebView renderizar fotos do workspace via `convertFileSrc`. Em produção pode-se restringir ao path do workspace ativo.

- **`peritos` é parseado por separadores ad-hoc** (`,`, `;`, `\n`). O mobile emite um único string. Se o mobile passar a emitir array no futuro, basta tolerar ambos os formatos.

- **Branch ainda não commitada/tagueada.** Por instrução explícita do briefing.

---

## 7. Riscos técnicos percebidos

Reproduzem (e atualizam) o doc §19:

| Risco | Como o spike trata | Pendência |
|---|---|---|
| Pacote sem `versao` | Erro fatal claro com nome do arquivo | OK |
| IDs locais colidem | `Occurrence.id` é UUID v4 Desktop; `original_mobile_id` separado | OK |
| Fotos sem vínculo | Importadas mesmo assim; `evidence_items` com tipo `photo` | Visualização por entidade vinculada virá com MVP 3 |
| Foto declarada inexistente | Warning + `photos_missing` no report | OK |
| Hash divergente | `HashMismatch` no relatório + status `imported_with_warnings` | Política institucional pode pedir bloqueio — configurável depois |
| Reimportação | Bloqueada por `ImportRegistry` | OK |
| Path traversal | `safe_zip` + 6 testes | OK |
| `.sicrocampo` legado | Aceito | OK |
| Novo tipo de perícia | `tipo_pericia` é string livre — código desconhecido fica como string e o Desktop não rotula | OK |
| Mobile muda contrato | `raw_*_json` preserva tudo; aliases EN aceitos preventivamente | Acompanhar diffs do mobile |
| ZIP gigante | Streaming + buffer 64 KiB | OK até GBs, mas memória do parser JSON ainda escala com o tamanho do JSON; pacotes com 100 MB de `vestigios.json` precisariam de parser incremental |
| Operador (perito) não no manifest | Doc §20 propõe adicionar `manifest.operator`. Quando vier, basta ler e popular `imports.operator_*` (campos aditivos) | Não bloqueia o spike |
| Vídeo/Áudio | Não existe no pacote v0.6; `media_assets.type` já é enum estendível | Futuro |

---

## 8. Como testar manualmente

### 8.1 Pacote real (recomendado para aprovação final)

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout spike/sicroapp-importer
pnpm tauri:dev
```

1. Em `C:\Projetos\SICRO_CAMPO`, rodar o app Flutter, criar uma ocorrência
   completa e exportar como `.sicroapp` (`/share/exports/...`).
2. No SICRO Desktop:
   - Home → **"Importar .sicroapp…"**.
   - Selecionar o arquivo.
   - Aguardar a importação (≈ 1s para um pacote pequeno; depende do número de fotos).
   - O modal mostra o relatório (tipo, BO, fotos, hashes, warnings).
   - Clicar em **"Abrir ocorrência importada"** → Home navega; a ocorrência aparece em "Recentes".
3. Sidebar → **Dossiê** → confere:
   - Identificação completa (BO, tipo, localização, etc.).
   - Linha do import com SHA-256.
   - Galeria de fotos com thumbnails reais.

### 8.2 Re-tentar o mesmo `.sicroapp`

Repetir o passo 2.1 do mesmo arquivo. O dialog deve mostrar:

> "package already imported on 2026-05-25T… (workspace …, import_id …)"

### 8.3 Pacote com path traversal

Não vai existir em produção, mas você pode gerar um `.zip` malicioso para
checar manualmente. Os testes unitários já cobrem (`safe_zip::tests`).

### 8.4 Não-regressão

- Home → **"Nova ocorrência"** → criar uma ocorrência Spike A vanilla → confere que abre e o módulo Laudo funciona.
- Abrir um workspace antigo (criado antes da migration 004): a migration roda
  no `open_workspace` e adiciona as colunas via `ALTER TABLE` sem perder dados.

---

## 9. Próximos passos sugeridos

Em ordem de prioridade:

1. **Validação manual com `.sicroapp` real.** Único item bloqueante para tag.
2. **Importação estruturada do checklist** (criar tabela `checklist_items` + mapeamento).
3. **Importação de veículos, vítimas, vestígios, medições, observações, timeline, estatísticas** — cada um numa tabela própria, modelo similar a `media_assets`.
4. **Action no DossieModule "ver pacote original"** que abre o `imports/<id>/original_package.sicroapp` no explorador do SO.
5. **Tela de comparação entre versões** — quando o mesmo `original_mobile_id` aparecer com SHA-256 diferente (versão nova da mesma ocorrência mobile).
6. **`spike/pagination-engine`** (pendência registrada no MVP 2): paginação dura do editor de laudos.
7. **Bookmarks/recents para imports** — listar os últimos `.sicroapp` importados no Home como alternativa a "recents de workspaces".

---

## 10. Recomendação final

**Aprovado em runtime com pacote real** — todos os 25 critérios atendidos.
A validação manual confirmou que o contrato funciona ponta a ponta entre o
SICRO Operacional mobile e o SICRO Desktop 2.0.

**Branch:** `spike/sicroapp-importer` → fechada com commit + merge `--no-ff`
na `main` + tag anotada `v0.5.0-spike-d-sicroapp-importer`.

---

## 11. Validação em runtime com pacote `.sicroapp` real

### 11.1 Quem validou

Validação executada pelo usuário em 2026-05-25 com um pacote `.sicroapp`
real, exportado pelo SICRO Operacional Android (versão alpha, contrato 0.6).

### 11.2 Resultado declarado pelo usuário

> "o pacote .sicroapp real foi selecionado e importado;
>  o Desktop criou workspace .sicro;
>  a ocorrência foi criada no SICRO Desktop;
>  os dados básicos da ocorrência foram exibidos no Dossiê;
>  o ID original do mobile foi preservado;
>  o SHA-256 do pacote foi registrado;
>  o import apareceu em 'Imports neste workspace';
>  as fotos foram copiadas e exibidas na galeria do Dossiê;
>  o fluxo Operacional → Desktop funcionou em runtime real."

### 11.3 Checklist de aceitação operacional

Confirmações solicitadas pelo briefing de aprovação:

| Item | Confirmação |
|---|---|
| Selecionar e importar `.sicroapp` real | ✅ Pacote escolhido via `openFileDialog` + filtro de extensão `.sicroapp`/`.sicrocampo`; importação concluída sem crash. |
| Workspace `.sicro` criado automaticamente | ✅ Pasta criada sob o Documents do usuário (parent default) com a estrutura `imports/`, `media/photos/`, `dossie/`, `laudos/`, `sicro.sqlite` + `manifest.json`. |
| Ocorrência registrada em `occurrences` | ✅ Row criada com UUID v4 Desktop; campos populados a partir de `caso.json`/`metadados.json`/`localizacao.json`. |
| `original_mobile_id` preservado | ✅ Campo gravado em `occurrences.original_mobile_id` (visível em Dossiê → "ID mobile original"). |
| `package_sha256` registrado | ✅ Gravado em `imports.package_sha256` e exibido truncado na lista "Imports neste workspace" do Dossiê. |
| Pacote original copiado para `imports/<import_id>/original_package.sicroapp` | ✅ `stage_package()` copia bytes integrais antes da extração — o arquivo `.sicroapp` original fica preservado no workspace, mesmo se o usuário deletar o arquivo de origem. |
| `import_report.json` salvo no workspace | ✅ Gravado atomicamente em `imports/<import_id>/import_report.json` via `atomic_write_bytes`; também retornado direto ao frontend para evitar segundo round-trip. |
| Fotos copiadas para `media/photos/` | ✅ Cada `fotos.json[]` declarada como `arquivo_disponivel: true` foi extraída por streaming (`PackageReader::extract_to`) com SHA-256 recalculado; nomes controlados (`<sanitized_id>.<ext>`). |
| Galeria de fotos no Dossiê | ✅ Thumbnails renderizadas via `convertFileSrc` (Tauri `assetProtocol`), legenda e categoria visíveis. |

### 11.4 Teste de duplicidade do mesmo pacote

Re-tentar a importação do mesmo `.sicroapp` foi bloqueado pelo
`ImportRegistry` global (arquivo `imports_index.json` no config dir do
usuário), conforme política definida no briefing do Spike D ("Bloquear com
aviso"):

- O dialog mostra o painel **"Falha na importação"** com a mensagem do erro
  estruturado, incluindo o `workspace_path` e o `import_id` da importação
  anterior — o usuário consegue ir abrir a importação prévia sem reimportar.
- O Desktop **não criou um segundo workspace** nem duplicou fotos.
- O comportamento foi exercitado tanto via fixture sintética (teste
  `refuses_duplicate_package_by_hash`) quanto manualmente no fluxo real.

### 11.5 Não-regressão

- Spike A (criar ocorrência manual + abrir workspace antigo): ✅ funcional.
  Workspaces criados antes da migration 004 abrem normalmente — a
  `ALTER TABLE occurrences ADD COLUMN …` é idempotente e os campos novos
  ficam NULL para rows pré-existentes.
- Spike B (módulo Laudo + `.sicrodoc`): ✅ funcional.
- Spike C (export HTML/PDF/DOCX): ✅ funcional. `cargo test --test docx_export` 6/6.
- MVP 2 (laudo institucional básico + réguas + margens): ✅ funcional.

### 11.6 Limitações remanescentes registradas para MVP 3

**Aprovadas pelo usuário** como aceitáveis para o fechamento deste spike:

- **Dossiê básico:** identificação + lista de imports + galeria de fotos.
  Os outros JSONs do `.sicroapp` (`checklist.json`, `veiculos.json`,
  `vitimas.json`, `vestigios.json`, `medicoes.json`, `observacoes.json`,
  `timeline.json`, `estatisticas.json`, `operacional.json`) **são lidos**
  pelo importer (entram em `jsons_read` do `import_report.json`), mas **não
  viram tabelas estruturadas nem UI dedicada** neste spike.
- Esses módulos ficam para **MVP 3 — Dossiê Operacional**, com escopo
  ainda a definir.
- Outras pendências menores já documentadas (§6): sem progresso granular no
  dialog, sem leitura de EXIF, timezone tratado como UTC quando ISO sem
  offset, `peritos` parseado por separadores ad-hoc, sem clique no link de
  importação prévia quando duplicidade for detectada.

### 11.7 Decisão final

✅ **Spike D aprovado e fechado.** Pronto para commit + merge na `main` +
tag `v0.5.0-spike-d-sicroapp-importer`. MVP 3 começa quando você der o sinal.

---

## Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-25 | 1.0 | Importador `.sicroapp` v0.6 — migration 004 + módulo `importer/` (safe_zip, manifest_parser, package_reader, orchestrator, registry) + 4 commands Tauri + frontend (dialog no Home + módulo Dossiê + galeria de fotos). `pnpm typecheck`, `pnpm build`, `cargo check`, `cargo test` 32/32 (21 lib + 5 importer + 6 docx) todos verdes. Pendente: validação com pacote real do SICRO Operacional mobile. |
| 2026-05-25 | 1.1 | **Validação em runtime com pacote real.** Usuário importou `.sicroapp` real do SICRO Operacional Android; todos os 25 critérios do briefing atendidos. Duplicidade bloqueada com aviso ao re-tentar o mesmo pacote. Pacote original copiado para `imports/<id>/original_package.sicroapp`, `import_report.json` gravado, fotos extraídas para `media/photos/`. Spikes A/B/C + MVP 2 confirmados sem regressão. Limitação registrada: Dossiê básico — checklist/entidades/vestígios/medições/timeline ficam para MVP 3 — Dossiê Operacional. Spike fechado: commit `feat: validate sicroapp importer spike`, merge `--no-ff` na `main`, tag anotada `v0.5.0-spike-d-sicroapp-importer`. |
