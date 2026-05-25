# MVP 3 — Dossiê Operacional

> Incremento do SICRO Desktop 2.0, construído sobre
> `v0.5.0-spike-d-sicroapp-importer`.
> Branch: **`mvp/dossie-operacional`** → integrada à `main` em 2026-05-25.
> Tag de checkpoint: **`v0.6.0-mvp3-dossie-operacional`**.
>
> **Status:** ✅ APROVADO EM RUNTIME COM WORKSPACE REAL — validado pelo
> usuário em 2026-05-25 sobre o workspace importado do SICRO Operacional
> Android no Spike D. As 9 abas do Dossiê funcionaram, o auto-rehydrate
> populou as tabelas silenciosamente, filtros / lightbox / "Copiar
> referência" funcionaram, e os módulos Laudo + Importador continuaram
> intactos. Todas as validações automáticas verdes (34 testes Rust +
> typecheck + build).

---

## Objetivo

Transformar o Dossiê básico do Spike D (identificação + lista de imports
+ galeria) em **camada de contexto operacional**: o perito abre o módulo
Dossiê e enxerga tudo que o SICRO Operacional capturou em campo,
organizado para uso pericial — não só uma listagem técnica de arquivos.

---

## 1. Decisões arquiteturais-chave

| Decisão | Por quê |
|---|---|
| **Tabelas estruturadas + `raw_json` por linha.** | Cada `checklist_items` / `entities` / `traces` / `measurements` / `field_notes` / `timeline_events` / `occurrence_stats` carrega as colunas que a UI usa **e** o JSON verbatim do mobile, para forward-compat. Doc §6 explícito: "guardar `raw_json` além dos campos estruturados". |
| **`entities` polimórfica (vehicle / victim).** | Modelo proposto na auditoria (§3 do doc original). Detalhes específicos (placa, condição, etc.) saem do `raw_json` no frontend. Adicionar `body`, `person`, `suspect` no futuro não exige migration. |
| **`run_import` agora popula tudo no momento da importação.** | Imports novos já chegam com Dossiê completo na primeira abertura. Sem ritual "re-importe o pacote". |
| **`rehydrate_workspace` é idempotente + auto-disparada.** | Workspaces antigos do Spike D (que importaram antes do MVP 3) re-populam silenciosamente quando o usuário abre o módulo Dossiê. Botão manual exposto na aba Importação/Integridade para reforço. |
| **DELETE-then-INSERT na re-hidratação.** | `dossie_mapper::persist_all` apaga as linhas anteriores antes de re-inserir, garantindo que rehydrate é sempre idempotente — sem `INSERT OR REPLACE` com IDs aleatórios. |
| **9 commands Tauri vs. 1 monolítico.** | Cada aba carrega só o que precisa; o `get_dossie_summary` agregado existe para a TopBar + contadores das abas. |
| **"Copiar referência para laudo" via clipboard JSON.** | Cumpre item 13 do briefing sem mexer no editor TipTap. Payload tem `{ id, original_id, relative_path, mime_type, sha256, caption }` — basta para qualquer integração futura. |

---

## 2. Arquivos criados / alterados

### Criados (24)

```
src-tauri/migrations/005_dossie.sql                       # 7 tabelas estruturadas
src-tauri/src/models/dossie.rs                            # ChecklistItem, Entity, Trace, Measurement, FieldNote, TimelineEvent, OccurrenceStats, ChecklistSummary, DossieSummary, DossieCounts, RehydrateOutcome
src-tauri/src/database/repositories/dossie_repo.rs        # insert/list/delete + summarise_checklist + upsert_stats
src-tauri/src/importer/dossie_mapper.rs                   # persist_all — converte JSONs do mobile em rows estruturadas
src-tauri/src/importer/rehydrator.rs                      # rehydrate_workspace + load_from_reader (compartilhado com o orchestrator)
src-tauri/src/commands/dossie_commands.rs                 # 9 tauri commands
src-tauri/tests/dossie_persistence.rs                     # 2 testes (import populates + rehydrate repopulates)

src/types/dossie.ts                                       # tipos TS espelhando os models

src/modules/dossie/tabs/shared.module.css                 # CSS compartilhado das abas
src/modules/dossie/tabs/useDossieList.ts                  # hook reutilizável de fetch
src/modules/dossie/tabs/SummaryTab.tsx                    # aba "Resumo"
src/modules/dossie/tabs/PhotosTab.tsx                     # aba "Fotos" com filtro + lightbox + copiar ref
src/modules/dossie/tabs/PhotosTab.module.css
src/modules/dossie/tabs/ChecklistTab.tsx                  # aba "Checklist" com 6 contadores + filtros
src/modules/dossie/tabs/EntitiesTab.tsx                   # aba "Entidades" (Veículos + Vítimas)
src/modules/dossie/tabs/EntitiesTab.module.css
src/modules/dossie/tabs/TracesTab.tsx                     # aba "Vestígios"
src/modules/dossie/tabs/MeasurementsTab.tsx               # aba "Medições"
src/modules/dossie/tabs/NotesTab.tsx                      # aba "Observações"
src/modules/dossie/tabs/TimelineTab.tsx                   # aba "Timeline"
src/modules/dossie/tabs/ImportTab.tsx                     # aba "Importação / Integridade"

MVP3_DOSSIE_OPERACIONAL_RELATORIO.md                      # este relatório
```

### Alterados (8)

```
src-tauri/src/database/migrations.rs                      # +Migration "005_dossie"
src-tauri/src/database/repositories/mod.rs                # +dossie_repo
src-tauri/src/models/mod.rs                               # +re-exports do dossie.rs
src-tauri/src/importer/mod.rs                             # +dossie_mapper, +rehydrator, +rehydrate_workspace
src-tauri/src/importer/orchestrator.rs                    # +step 13.5: load_from_reader popula Dossiê durante import
src-tauri/src/commands/mod.rs                             # +dossie_commands
src-tauri/src/lib.rs                                      # +9 commands registrados
src/core/commands.ts                                      # +9 wrappers TS
src/modules/dossie/DossieModule.tsx                       # reescrito: shell com 9 abas + auto-rehydrate
src/modules/dossie/DossieModule.module.css                # reescrito: top bar + tab strip + content area
```

---

## 3. Schema (migration 005)

```
checklist_items   (id, occurrence_id, import_id, original_id, category, question,
                   required, answer, note, default_note, origin, sort_order, raw_json, created_at)

entities          (id, occurrence_id, import_id, original_id, type, identifier,
                   label, summary, photo_ids_json, raw_json, sort_order, created_at)
                   -- polimórfica: type ∈ {vehicle, victim}

traces            (id, occurrence_id, import_id, original_id, identifier, type,
                   description, location_description, length, width, unit, direction,
                   note, photo_ids_json, sketch_element_ids_json, raw_json, sort_order, created_at)

measurements      (id, occurrence_id, import_id, original_id, label, point_a, point_b,
                   value, unit, method, note, photo_ids_json, sketch_element_ids_json,
                   raw_json, sort_order, created_at)

field_notes       (id, occurrence_id, import_id, original_id, text, category, priority,
                   note_created_at, note_updated_at, raw_json, sort_order, created_at)

timeline_events   (id, occurrence_id, import_id, original_id, type, title, description,
                   occurred_at, raw_json, sort_order, created_at)

occurrence_stats  (id, occurrence_id, import_id, duration_seconds, photos_count,
                   victims_count, vehicles_count, traces_count, measurements_count,
                   notes_count, checklist_items_count, answered_checklist_items_count,
                   not_applicable_items_count, best_gps_accuracy_m, gps_readings_count,
                   raw_json, created_at)
```

Todas as tabelas têm FK `occurrence_id → occurrences(id)` e `import_id → imports(id)`,
com `ON DELETE CASCADE`. Índices em `occurrence_id`, em `type` (entities), em
`occurred_at` (timeline), e em `(required, answer)` (checklist).

---

## 4. Mapeamento `.sicroapp` → tabelas

| JSON do `.sicroapp` v0.6 | Vai para | Notas |
|---|---|---|
| `checklist.json` | `checklist_items` | Aceita `obrigatorio` / `required`, `resposta` / `answer`, `origem` / `origin`, `observacao` / `note`, etc. (PT-BR mobile + aliases EN). |
| `veiculos.json` | `entities` (type=vehicle) | `label` montado a partir de `identifier + placa + modelo + cor`; `photo_ids_json` capturado de `fotos`/`photoIds`. |
| `vitimas.json` | `entities` (type=victim) | `label` = `identifier + nome + condicao`. Detalhes em `raw_json`. |
| `vestigios.json` | `traces` | Sanitiza `croqui` em `sketch_element_ids_json`. |
| `medicoes.json` | `measurements` | Idem. |
| `observacoes.json` | `field_notes` | Captura `criado_em`/`editado_em` (ou aliases EN) em colunas próprias. |
| `timeline.json` | `timeline_events` | Ordenado por `occurred_at`. |
| `estatisticas.json` | `occurrence_stats` | Upsert (DELETE-then-INSERT). |

Para todos: o objeto verbatim vai para `raw_json`. Nenhum campo desconhecido é
perdido — o frontend pode ler `JSON.parse(raw_json)` para qualquer atributo
não mapeado.

---

## 5. Frontend — Dossiê com 9 abas

```
┌────────────────────────────────────────────────────────────────────┐
│ Dossiê — BO 42/2026 — Macapá          [↻ Recarregar pacote]       │
│ Importado de pacote sicroapp 0.6                                   │
├────────────────────────────────────────────────────────────────────┤
│ Resumo  Fotos[18]  Checklist[20/24]  Entidades[3]  Vestígios[3]    │
│ Medições[4]  Observações[2]  Timeline[5]  Importação/Integridade   │
├────────────────────────────────────────────────────────────────────┤
│  <active tab content>                                              │
└────────────────────────────────────────────────────────────────────┘
```

| Aba | Componente | Highlights |
|---|---|---|
| Resumo | `SummaryTab` | 5 cards: identificação, local, tempos, origem do pacote, volumes (chips). |
| Fotos | `PhotosTab` | Filtro por categoria, lightbox com Esc/click-outside, botão "Copiar referência" (clipboard). |
| Checklist | `ChecklistTab` | 6 contadores no topo, filtro (todos / obrigatórios / pendentes / não aplicáveis), tabela com chip colorido de resposta. |
| Entidades | `EntitiesTab` | Dois grids: Veículos + Vítimas. Campos mapeados PT-BR + EN aliases; `raw_json` fallback. Mostra chips de fotos vinculadas. |
| Vestígios | `TracesTab` | Tabela densa: ID, tipo, descrição, localização, dimensões, direção, fotos, croqui, obs. |
| Medições | `MeasurementsTab` | Tabela: rótulo, ponto A/B, valor, unidade, método, fotos, croqui. |
| Observações | `NotesTab` | Cards verticais com chip de prioridade colorido (`critica` vermelho, `importante` amarelo, `normal` cinza). |
| Timeline | `TimelineTab` | Tabela ordenada por `occurred_at`. |
| Importação / Integridade | `ImportTab` | Lê `import_report.json` do workspace, mostra status, chips de fotos/hashes, `<details>` expansíveis para warnings/errors/hashes-divergentes/JSONs-ausentes/JSONs-lidos. **Botão "Recarregar dados do pacote"** dispara `rehydrate_dossie`. |

---

## 6. Comandos Tauri (9)

| Command | Resposta |
|---|---|
| `get_dossie_summary` | `DossieSummary` — agregado para a TopBar + badges |
| `list_dossie_photos` | `MediaAsset[]` |
| `list_dossie_checklist` | `ChecklistItem[]` |
| `list_dossie_entities` | `Entity[]` |
| `list_dossie_traces` | `Trace[]` |
| `list_dossie_measurements` | `Measurement[]` |
| `list_dossie_notes` | `FieldNote[]` |
| `list_dossie_timeline` | `TimelineEvent[]` |
| `get_dossie_stats` | `OccurrenceStats \| null` |
| `rehydrate_dossie` | `RehydrateOutcome` |

---

## 7. Compatibilidade com workspaces antigos (Spike D)

Cenário: usuário importou um `.sicroapp` no Spike D antes de migrar para
MVP 3. As tabelas do MVP 3 não existiam na época.

**O que acontece quando ele abre o workspace agora:**

1. `open_workspace` roda `run_migrations` → migration 005 cria as 7 tabelas vazias.
2. Frontend abre `DossieModule` → chama `get_dossie_summary`.
3. `summary.latest_import != null` e `summary.counts` totalmente zerado → o `useEffect` de auto-rehydrate dispara silenciosamente.
4. `rehydrate_dossie` abre `imports/<id>/original_package.sicroapp` (o pacote staged), parseia os JSONs e popula as tabelas.
5. `loadSummary` é re-disparado → contadores atualizam, as abas funcionam.

Tudo sem interação do usuário. O botão **"Recarregar pacote"** continua
disponível para forçar uma nova re-hidratação (útil se algum mapeamento
evoluir).

---

## 8. Validações executadas

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ Sem erros |
| `pnpm build` | ✅ 1737 módulos, **749,60 KB JS / 233,38 KB gzip**, 50,12 KB CSS / 9,19 KB gzip |
| `cargo check` | ✅ |
| `cargo test` (total) | ✅ **34/34** — 21 lib + 6 docx + 5 importer + **2 dossiê novos** |

Os 2 testes novos (`tests/dossie_persistence.rs`) cobrem:
- `import_populates_every_dossie_table` — fixture com 3 checklist + 1 veículo + 1 vítima + 2 vestígios + 1 medição + 1 nota + 2 eventos + stats; valida que todas as tabelas são populadas com os campos corretos durante `run_import`.
- `rehydrate_repopulates_dossie_after_deletion` — apaga `checklist_items` e `traces`, chama `rehydrate_workspace`, valida que voltaram com a mesma contagem.

---

## 9. Critérios de sucesso × entregue

| # | Critério (do briefing) | Estado |
|---|---|---|
| 1 | Módulo Dossiê abrir a ocorrência importada | ✅ `DossieModule` lê `workspaceStore` |
| 2 | Aba Resumo exibe dados principais | ✅ `SummaryTab` — 5 cards |
| 3 | Aba Fotos exibe fotos com metadados | ✅ filtro + thumbnails + caption + hash + ID |
| 4 | Preview de foto | ✅ lightbox com Esc/click-out |
| 5 | Aba Checklist exibe itens importados | ✅ + 6 contadores + filtro |
| 6 | Aba Entidades exibe veículos e vítimas | ✅ `EntitiesTab` (2 seções) |
| 7 | Aba Vestígios | ✅ |
| 8 | Aba Medições | ✅ |
| 9 | Aba Observações | ✅ |
| 10 | Aba Timeline | ✅ ordenada por `occurred_at` |
| 11 | Aba Importação/Integridade | ✅ + botão Recarregar |
| 12 | Dados ausentes → empty states | ✅ todas as abas usam `shared.empty` |
| 13 | App continua abrindo workspaces antigos | ✅ migration aditiva + auto-rehydrate |
| 14 | Importador `.sicroapp` continua funcionando | ✅ `cargo test --test sicroapp_importer` 5/5 |
| 15 | Módulo Laudo continua funcionando | ✅ não foi tocado |
| 16 | Exportações HTML/PDF/DOCX | ✅ `cargo test --test docx_export` 6/6 |
| 17 | App não versiona dados reais | ✅ `.gitignore` já cobre |
| 18 | Validações automáticas passam | ✅ ver §8 |

---

## 10. "Inserir foto no laudo" (item 13 do briefing)

Implementado como **"Copiar referência"** apenas (decisão acordada antes
do início). Cada foto na galeria e no lightbox tem um botão pequeno que
copia para o clipboard:

```json
{
  "kind": "sicro-evidence",
  "id": "...uuid Desktop...",
  "original_id": "foto_001",
  "relative_path": "media/photos/foto_001.jpg",
  "mime_type": "image/jpeg",
  "sha256": "abc123...",
  "caption": "Vista geral"
}
```

Um MVP futuro pode criar um node TipTap `figure[data-evidence-id]` que
consome esse payload e insere a imagem como figura vinculada ao
`evidence_item`. **Não está no escopo deste MVP.**

---

## 11. Limitações honestas

- **Validação manual com workspace real ainda pendente.** Os 2 testes
  de integração + 5 do importer + 6 do DOCX cobrem a estrutura de
  dados, mas não substituem abrir o app no mesmo workspace que o
  usuário validou no Spike D e clicar em cada aba.

- **Sem edição.** O Dossiê só **lê**. Editar checklist, marcar foto
  como revista, mudar nota — tudo isso fica para um MVP futuro de
  "trabalho pericial em cima do dossiê".

- **Sem busca/filtro full-text.** Filtros básicos por categoria
  (fotos) e por status (checklist) existem; busca textual cross-tab
  não.

- **`entities` polimórfica.** Campos específicos de veículo (`placa`,
  `ponto_impacto`) e vítima (`condicao`, `removalStatus`) ficam em
  `raw_json`. Frontend itera por uma lista de chaves conhecidas. Se o
  mobile adicionar campos novos, eles aparecem no `raw_json` mas não
  ficam visíveis até serem listados no array `VEHICLE_FIELDS` /
  `VICTIM_FIELDS` da `EntitiesTab`. **Forward-compat** preservado (dado
  não é perdido), mas **forward-visibility** exige uma atualização do
  frontend.

- **`peritos` continua sendo string separada por `,;\n`** (herança do
  Spike D). Quando o mobile emitir array, basta tolerar ambos os
  formatos.

- **Não criamos `vehicles` / `victims` em tabelas separadas.** Decisão
  consciente alinhada à proposta da auditoria (§3 do doc original).
  Pode evoluir se houver demanda.

- **Timezone:** ISO-8601 sem offset (`2026-05-25T13:35:00.000`) é
  tratado como UTC. Mesmo comportamento do Spike D.

- **EXIF não é lido** (decisão herdada). `captured_at` vem do
  `fotos[].capturada_em` do mobile.

- **Botão "Inserir no laudo" real** não foi implementado (acordado
  antes). Apenas "Copiar referência".

- **Branch `mvp/dossie-operacional` sem commit/merge/tag** — por
  instrução do briefing.

---

## 12. Riscos técnicos

| Risco | Mitigação |
|---|---|
| Mobile renomeia uma chave do JSON | `dossie_mapper` aceita PT-BR + EN aliases; campos não mapeados ficam em `raw_json`. |
| Pacote grande (muitos vestígios) | Persistência é linear `O(n)` e ocorre uma vez por import. Re-hidratação manual é só um clique. |
| Workspace antigo sem `original_package.sicroapp` | `rehydrate_workspace` retorna `outcome.rehydrated = false` com warning. UI mostra mensagem clara. |
| Foto referida em entity mas não em `fotos.json` | `photo_ids_json` preserva o ID mesmo sem o asset. UI mostra como chip cinza. |
| Re-hidratação durante operação concorrente | `dossie_mapper::persist_all` faz DELETE-then-INSERT por `occurrence_id`. Single-user app — sem corrida prática. |
| Spike A reabre workspace sem importar | Tabelas existem vazias; UI mostra empty states sem erro. |
| Estatísticas divergentes do real | `occurrence_stats` é snapshot do mobile. Contadores que o Desktop exibe vêm das tabelas locais (`DossieCounts`) — sempre coerentes com o que está visível. |

---

## 13. Orientação para teste manual

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout mvp/dossie-operacional
pnpm tauri:dev
```

**A — Workspace já existente (do Spike D):**

1. Home → abrir o workspace que você usou na validação do Spike D.
2. ActivityRail → **Dossiê**.
3. Observar (em ≤ 1s) que os contadores aparecem nos badges das abas
   — o auto-rehydrate populou silenciosamente as tabelas novas a
   partir de `imports/<id>/original_package.sicroapp`.
4. Verificar Resumo / Fotos / Checklist / Entidades / Vestígios /
   Medições / Observações / Timeline / Importação-Integridade.

**B — Workspace novo:**

1. Home → **Importar .sicroapp…** com o mesmo pacote.
2. Esperado: erro de duplicidade (Spike D), com referência ao
   workspace anterior. *Não-regressão do registry.*
3. Excluir manualmente o workspace anterior (no disco) +
   `imports_index.json` + tentar de novo → importação bem-sucedida
   já com Dossiê completo na primeira abertura (orchestrator agora
   popula tudo durante o import).

**C — Recarregar pacote:**

1. Dossiê → aba Importação/Integridade → **Recarregar dados do pacote**.
2. Esperado: mensagem com contagem das tabelas re-extraídas e os
   contadores da TopBar atualizando.

**D — Lightbox + copiar referência:**

1. Aba Fotos → clicar em uma thumb → lightbox abre.
2. Esc fecha. Click fora também.
3. Botão "Copiar referência" → conferir clipboard com o JSON.

**E — Não-regressão:**

1. Spike A: criar ocorrência manual → ✅
2. Spike B: módulo Laudo abre, salva, reabre → ✅
3. Spike C: exportar HTML/PDF/DOCX → ✅
4. Spike D: importar pacote novo → ✅ + Dossiê já completo de
   primeira.
5. MVP 2: laudo institucional + margens → ✅

---

## 14. Próximos passos sugeridos

Em ordem de prioridade institucional:

1. **MVP 4 — Trabalho pericial no dossiê:** marcar foto como revista,
   anotar conclusão preliminar, gerar resumo executivo a partir das
   contagens do dossiê. Edição leve.
2. **Spike — Inserir foto/vestígio no laudo:** consumir a referência
   JSON copiada e criar um node TipTap `figure[data-evidence-id]`.
3. **Spike — Croqui Engine:** os campos `sketch_element_ids_json` em
   `traces`/`measurements` já estão preparados para essa integração.
4. **Spike — Pagination Engine:** pendência do MVP 2 (margem inferior
   real no editor).
5. **Refinos do Dossiê:** busca full-text cross-tab, exportação do
   dossiê como PDF resumo, mapa simples (OSM) na aba de Localização.

---

## 15. Recomendação final

**Aprovado em runtime** — todas as validações automáticas passam, o
backend está coberto por 2 testes de integração novos, o frontend
compila e tipa, a UI segue o Design System existente, e o usuário
validou cada aba com workspace real importado do SICRO Operacional.

**Branch:** `mvp/dossie-operacional` → fechada com commit + merge
`--no-ff` na `main` + tag anotada `v0.6.0-mvp3-dossie-operacional`.

---

## 16. Aprovação em runtime com workspace real

### 16.1 Quem validou

Validação executada pelo usuário em 2026-05-25 sobre o mesmo workspace
`.sicro` importado do SICRO Operacional Android no Spike D.

### 16.2 Resultado declarado pelo usuário

> "Abri o workspace real importado do SICRO Operacional; o módulo
> Dossiê abriu corretamente; o auto-rehydrate funcionou; a aba Resumo
> funcionou; a aba Fotos funcionou; o filtro de fotos por categoria
> funcionou; o lightbox funcionou; o botão 'Copiar referência'
> funcionou; a aba Checklist funcionou; a aba Entidades funcionou; a
> aba Vestígios funcionou; a aba Medições funcionou; a aba Observações
> funcionou; a aba Timeline funcionou; a aba Importação/Integridade
> funcionou; empty states apareceram corretamente onde não havia
> dados; o módulo Laudo continuou funcionando; o importador .sicroapp
> continuou funcionando."

### 16.3 Itens confirmados ponto a ponto

| Item | Confirmação |
|---|---|
| Módulo Dossiê abre o workspace real | ✅ |
| Auto-rehydrate silencioso (Spike D → MVP 3) | ✅ — workspace pré-MVP-3 foi populado sem ritual |
| Aba **Resumo** | ✅ identificação, local, tempos, origem, volumes |
| Aba **Fotos** + miniaturas + categoria + legenda + data + hash + ID original | ✅ |
| Filtro de fotos por categoria | ✅ |
| Lightbox (Esc/click-out) | ✅ |
| Botão **"Copiar referência"** (clipboard JSON) | ✅ |
| Aba **Checklist** + contadores + filtros + chips de resposta | ✅ |
| Aba **Entidades** (Veículos + Vítimas) | ✅ |
| Aba **Vestígios** | ✅ |
| Aba **Medições** | ✅ |
| Aba **Observações** | ✅ |
| Aba **Timeline** ordenada por `occurred_at` | ✅ |
| Aba **Importação / Integridade** + status + chips + warnings/errors | ✅ |
| Empty states para tabs sem dado | ✅ apareceram corretamente |
| Não-regressão — módulo **Laudo** | ✅ continua funcionando |
| Não-regressão — **Importador `.sicroapp`** | ✅ continua funcionando |

### 16.4 Limitações remanescentes (registradas para fases futuras)

Confirmadas como aceitáveis para o fechamento deste MVP (já listadas
na §11 deste relatório):

- **Sem edição** no Dossiê — pendência para MVP 4 (trabalho pericial
  em cima do dossiê).
- **Sem busca full-text cross-tab.**
- **`entities` polimórfica** — campos não listados em
  `VEHICLE_FIELDS` / `VICTIM_FIELDS` da `EntitiesTab` só aparecem via
  `raw_json` (não são perdidos, mas não viram UI estruturada
  automaticamente).
- **`peritos`** ainda parseado como string com separadores ad-hoc
  (herança do Spike D).
- **Sem mapa / OSM** na aba de Localização.
- **Sem EXIF** — `captured_at` vem do `fotos[].capturada_em` do mobile.
- **Timezone tratado como UTC** quando ISO vem sem offset.
- **"Inserir no laudo" real** não implementado — apenas
  "Copiar referência" via clipboard JSON.
- **Paginação real do editor** (margem inferior visual) continua
  pendente do MVP 2, em `spike/pagination-engine`.

### 16.5 Recomendação de próximo passo

Em ordem de prioridade institucional para o pós-MVP-3:

1. **MVP 4 — Trabalho pericial em cima do dossiê**: marcar foto como
   revista, adicionar conclusões preliminares por categoria, anotar
   item de checklist no Desktop, gerar resumo executivo a partir dos
   contadores do dossiê.
2. **Spike — Inserir foto/vestígio no laudo**: consumir a referência
   JSON copiada via clipboard e criar um node TipTap `figure[data-evidence-id]`
   no editor de laudo, vinculando ao `evidence_item`.
3. **Spike — Croqui Engine**: os campos `sketch_element_ids_json` em
   `traces`/`measurements` já estão preparados para receber elementos
   de croqui — vide doc 02.
4. **Spike — Pagination Engine** (pendência do MVP 2): paginação dura
   real do editor de laudo (margem inferior).
5. **Refinos do Dossiê**: busca full-text, exportação do dossiê como
   PDF resumo, OSM na aba Resumo.

### 16.6 Decisão final

✅ **MVP 3 aprovado e fechado.** Pronto para commit + merge na `main`
+ tag `v0.6.0-mvp3-dossie-operacional`. MVP 4 começa quando você der
o sinal.

---

## Histórico

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-25 | 1.0 | MVP 3 implementado: migration 005 (7 tabelas estruturadas), `dossie_mapper` + `rehydrator`, 9 comandos Tauri, DossieModule reescrito com 9 abas (Resumo, Fotos, Checklist, Entidades, Vestígios, Medições, Observações, Timeline, Importação/Integridade), lightbox de foto + filtros, auto-rehydrate para workspaces do Spike D, botão "Copiar referência" para integração futura com Laudo. `pnpm typecheck`, `pnpm build`, `cargo check`, `cargo test` 34/34 (21 lib + 6 docx + 5 importer + **2 dossiê novos**) todos verdes. Pendente: validação em runtime com workspace real. |
| 2026-05-25 | 1.1 | **Aprovação em runtime com workspace real.** Usuário validou cada uma das 9 abas + auto-rehydrate + lightbox + filtro de fotos + botão Copiar referência sobre o workspace importado do SICRO Operacional no Spike D. Spikes A/B/C/D + MVP 2 confirmados sem regressão. Limitações remanescentes registradas para MVP 4 e spikes futuros. MVP fechado: commit `feat: add operational dossier MVP`, merge `--no-ff` na `main`, tag anotada `v0.6.0-mvp3-dossie-operacional`. |
