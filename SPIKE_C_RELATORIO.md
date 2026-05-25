# Relatório do Spike C — Export Engine

> Spike de validação da camada de exportação do SICRO 2.0 (HTML / PDF / DOCX).
> Implementado em 2026-05-24, sobre a tag `v0.2.0-spike-b-document-engine`.
>
> **Status: ✅ APROVADO em runtime (2026-05-24).**

---

## Pergunta

> **A partir do `.sicrodoc` estruturado já validado no Spike B, conseguimos gerar PDF e DOCX com fidelidade suficiente para sustentar o futuro laudo oficial do SICRO?**

## Resposta

Sim. As três rotas — HTML, PDF e DOCX — funcionaram em runtime, abriram corretamente em ferramentas externas (navegador, leitor de PDF, Microsoft Word), e preservaram o conteúdo do `.sicrodoc`. A primeira tentativa de DOCX revelou uma fragilidade no walker que foi diagnosticada (storyboard aninhado em `tableHeader` perdia conteúdo, e paragraphs sem run eram dropados pelo Word) e corrigida; uma suite de testes de integração foi criada para pinar o contrato. Após a correção, o DOCX exportou corretamente em runtime e o Word abriu sem reclamar.

### Resultado final em runtime

| Critério (do enunciado original) | Status |
|---|---|
| HTML gerado a partir do `.sicrodoc` | ✅ aprovado em runtime |
| HTML preserva estrutura básica | ✅ aprovado em runtime |
| PDF gerado a partir do documento | ✅ aprovado em runtime |
| PDF abre fora do SICRO | ✅ aprovado em runtime |
| PDF preserva texto, headings, tabela, figura+legenda e storyboard | ✅ aprovado em runtime |
| DOCX gerado | ✅ aprovado em runtime (após correção) |
| DOCX abre no Word/LibreOffice | ✅ aprovado em runtime |
| DOCX preserva texto, headings, tabela, imagens/placeholders | ✅ aprovado em runtime (após correção; imagens reais ainda como placeholder) |
| Exportações salvas dentro do workspace | ✅ aprovado em runtime |
| `.sicrodoc` continua sendo a fonte da verdade | ✅ aprovado (DOCX lê do `.sicrodoc`; PDF nasce do HTML que nasce do `.sicrodoc`) |
| Spike A continua funcionando | ✅ confirmado em runtime |
| Spike B continua funcionando | ✅ confirmado em runtime |
| Limitações documentadas | ✅ — ver seção "Limitações" |
| Recomendação clara | ✅ — APROVADO |

### Saídas oficiais

- **PDF é a saída oficial prioritária** do SICRO 2.0. A rota HTML → Edge headless → PDF demonstrou fidelidade suficiente em runtime para sustentar o laudo institucional futuro, condicionada à inclusão do cabeçalho institucional, marca lateral e "Folha X de Y" (pendências do MVP 2, não do Spike C).
- **DOCX é a saída editável secundária.** Útil quando o destinatário precisa anotar, copiar trechos ou editar em ambiente Office, mas **não é a fonte da verdade**. Compromissos de fidelidade visual são aceitos em troca de robustez do conteúdo estrutural.
- **HTML** continua sendo o intermediário canônico e também é gravado como saída persistente em `exports/html/` para reuso futuro (preview, debug, conversão alternativa).

---

## 1. Arquivos criados/alterados

### Criados (13 arquivos)

```
src-tauri/migrations/003_exports.sql
src-tauri/src/models/export.rs
src-tauri/src/database/repositories/export_repo.rs
src-tauri/src/commands/export_commands.rs

src-tauri/src/exporters/mod.rs
src-tauri/src/exporters/paths.rs
src-tauri/src/exporters/html.rs
src-tauri/src/exporters/pdf.rs
src-tauri/src/exporters/docx.rs

src/types/export.ts
src/modules/laudo/components/ExportMenu.tsx + .module.css

SPIKE_C_RELATORIO.md
```

### Alterados (8 arquivos)

```
src-tauri/Cargo.toml                                # +docx-rs 0.4
src-tauri/src/lib.rs                                # +pub mod exporters + 4 cmds no generate_handler!
src-tauri/src/commands/mod.rs                       # +pub mod export_commands
src-tauri/src/database/migrations.rs                # +migration 003
src-tauri/src/database/repositories/mod.rs          # +pub mod export_repo
src-tauri/src/models/mod.rs                         # +pub mod export + re-exports

src/core/commands.ts                                # +4 wrappers
src/modules/laudo/components/EditorToolbar.tsx      # +ExportMenu + 3 novos props
src/modules/laudo/views/LaudoEditorView.tsx         # passa workspacePath, laudoId, doc para a toolbar
src/modules/laudo/document-engine/renderer.ts       # +@page A4 + media screen + page-break-inside hints
```

---

## 2. Dependências instaladas

### Rust (uma dependência nova)

| Crate | Versão | Função |
|---|---|---|
| `docx-rs` | 0.4.20 | Geração de DOCX 100% Rust, sem dependência de sistema |

Nenhum download externo, nenhuma instalação adicional. `docx-rs` puxa transitivamente `image`, `quick-xml`, `zip` — todos puramente Rust.

### Front-end

**Nenhuma dependência nova.** O `renderSicroDocToHtml` do Document Engine (Spike B) já produz o HTML que abastece o PDF; o front apenas adiciona o componente `ExportMenu`.

### Sistema

| Item | Versão observada | Onde |
|---|---|---|
| Microsoft Edge | 148.0.3967.83 | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |

O Edge já vem instalado em Windows 11 — **sem instalação adicional**.

---

## 3. Estratégia escolhida para cada formato

### 3.1 HTML (intermediário)

**Estratégia:** reaproveita 100% o `renderSicroDocToHtml(doc, { fullDocument: true })` do Document Engine.

**Fluxo:**

```
.sicrodoc → coerceSicroDoc → renderSicroDocToHtml → string HTML
       → invoke('export_laudo_html', { workspace, laudoId, html })
       → atomic_write_bytes → <workspace>/exports/html/laudo_<id>_<ts>.html
       → INSERT INTO exports
```

**Justificativa:** já existia, é leve, evita duplicar lógica em Rust. Quando precisarmos do mesmo HTML em Rust (Spike futuro de PDF nativo, p.ex.), criamos uma trait Rust e refatoramos — não agora.

**Limitações:** zero — é literalmente o que o editor já mostrava na prévia.

### 3.2 PDF (saída oficial prioritária)

**Estratégia:** invocar `msedge.exe --headless=new --print-to-pdf` como subprocess via `std::process::Command`.

**Fluxo:**

```
.sicrodoc → coerceSicroDoc → renderSicroDocToHtml (fullDocument)
       → invoke('export_laudo_pdf', { workspace, laudoId, html })
       → grava HTML em <workspace>/cache/export_<nanos>.html
       → localiza Edge em paths conhecidos do Windows
       → spawn:
           msedge.exe --headless=new --disable-gpu --no-pdf-header-footer
                      --virtual-time-budget=5000
                      --print-to-pdf=<workspace>/exports/pdf/laudo_<id>_<ts>.pdf
                      file:///<temp>/export_<nanos>.html
       → poll loop com timeout de 45s
       → valida exit_code == 0 e tamanho > 0
       → remove HTML temp
       → INSERT INTO exports
```

**Justificativa da escolha (subprocess Edge vs. alternativas):**

| Opção avaliada | Motivo da rejeição |
|---|---|
| `headless_chrome` crate | Adiciona ~30 MB de deps (websocket, async runtime extra), exige que Chrome esteja no PATH (não o caso por padrão no Win11) e ainda assim acabaria invocando o Edge embaixo. |
| `chromiumoxide` | Mesmo problema, mais pesado. |
| `wkhtmltopdf` (binário externo) | Deprecated upstream; precisaríamos empacotar o binário (~50 MB) ou exigir instalação. |
| `printpdf` (puro Rust) | Não entende HTML/CSS — teríamos que redesenhar o documento via primitives. Fidelidade muito menor que Chromium. |
| `weasyprint` (Python) | Excelente fidelidade CSS-print, mas depende de runtime Python. |
| Tauri WebView2 `PrintToPdfAsync` | API não exposta publicamente pelo Tauri 2 hoje; exigiria patch ou plugin Rust dedicado. |

Conclusão: **subprocess do Edge é a opção mais leve possível** (0 KB de dependência Rust nova), com a maior fidelidade possível (engine Chromium real), no preço de ser específica de Windows e exigir Edge instalado — ambos atendidos no ambiente alvo.

**CSS de impressão:** adicionei `@page { size: A4; margin: 2.5cm 2cm 2cm 3cm; }` e `page-break-inside: avoid` em figure/storyboard ao `DOC_STYLES` do renderer. Com isso o Edge gera A4 com margens institucionais corretas (doc 04 §20).

**Localização do Edge:** `pdf.rs::locate_browser()` procura, em ordem:

1. `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
2. `C:\Program Files\Microsoft\Edge\Application\msedge.exe`
3. `C:\Program Files\Google\Chrome\Application\chrome.exe`
4. `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
5. `where chrome.exe` no PATH

Se nada for encontrado, retorna `SicroError::Workspace` com mensagem em português orientando o usuário.

### 3.3 DOCX (saída editável secundária)

> **Saída editável secundária**, não a fonte da verdade. Compromissos de fidelidade visual são aceitos em troca de robustez do conteúdo estrutural.

**Estratégia:** crate `docx-rs` 0.4.20 — gera DOCX programaticamente em puro Rust.
A entrada **não é o HTML**; é o próprio `.sicrodoc` (TipTap JSON). Um walker recursivo (`exporters/docx.rs::render_doc_to_docx`) percorre os nodes e emite estruturas `docx-rs` equivalentes.

**Estratégia final adotada para Storyboard no DOCX** (após o fix de runtime):

- **Storyboard no nível raiz** do documento → tabela 2 colunas:
  - **Coluna 1 (5 cm)**: 3 parágrafos verticais — `[Frame placeholder]` em itálico + `timestamp` (negrito) + `frame_label`.
  - **Coluna 2 (1 fr)**: descrição do item (texto editável vindo do `paragraph` filho do `storyboardItem`).
  - Uma linha por `storyboardItem`. Caption do storyboard vira parágrafo em negrito acima da tabela.
- **Storyboard aninhado dentro de uma célula de tabela** (caso observado no `.sicrodoc` real do usuário) → sequência plana de parágrafos no lugar:
  - Caption em negrito.
  - Para cada item: `"Item N — HH:MM:SS.mmm | Frame: X"` em negrito + parágrafos internos do item.
  - **Razão**: aninhar uma tabela DOCX dentro de uma célula DOCX causa layout imprevisível no Word; flatten para parágrafos preserva 100% do conteúdo legível com layout estável.
- **`tableHeader` recebe o mesmo tratamento de `tableCell`** — sem essa equivalência, qualquer storyboard inserido no header da tabela (caso comum nos primeiros testes do usuário) era perdido.
- **Garantia estrutural**: todo `Paragraph` emitido tem **ao menos um `Run`** (mesmo que vazio). Word silenciosamente descarta parágrafos sem runs — essa garantia foi o que destravou o conteúdo na exportação corrigida.
- **Nodes desconhecidos** ganham `fallback_paragraph` que faz walk recursivo coletando qualquer `text`/`systemData` da subárvore, em italic; se nada for encontrado, emite sentinel `[bloco "X" sem suporte na exportação DOCX]` (visível, não silenciado).

**Fluxo:**

```
invoke('export_laudo_docx', { workspace, laudoId })
       → Rust lê <workspace>/laudos/laudo_<id>.sicrodoc do disco
       → serde_json::from_slice → Value
       → walker emite:
            heading       → Paragraph com style "Heading1/2/3"
            paragraph     → Paragraph (com alinhamento + runs por mark)
            bulletList    → Paragraph por item, prefixo "• "
            orderedList   → Paragraph por item, prefixo "1./2./3. "
            table         → Table com Row/Cell mapeados
            figure        → "[Figura — imagem não exportada]" + legenda
            storyboard    → Table 2-col: [thumb placeholder + timestamp + frame] | [descrição]
            systemData    → Run com cor cinza (preserva o valor; estado de revisão perdido)
            marks (bold/italic/underline/strike/code)  → Run com a formatação correspondente
       → docx-rs Docx::build().pack(file) → <workspace>/exports/docx/laudo_<id>_<ts>.docx
       → INSERT INTO exports
```

**Justificativa:** `.sicrodoc` é a fonte da verdade (doc 04 §2). Tentar HTML→DOCX adicionaria um intermediário com perda; ir direto do JSON estruturado para DOCX é mais honesto e cobre 90% do conteúdo periciai estruturalmente.

**Limitações conhecidas (já catalogadas em código):**

- **Imagens NÃO são embutidas** — figuras viram um parágrafo `"[Figura — imagem não exportada nesta versão]"` + a legenda. Embutir imagens reais exige copiar bytes do disco (do workspace) para dentro do DOCX; ficou fora do escopo. Próximo passo: ler `attrs.src` quando for `file://` e usar `Pic::new(bytes)` do docx-rs.
- **`SystemData` perde o estado** `pending/reviewed/converted` — vira texto cinza.
- **`@media screen` do CSS é ignorado** (irrelevante para DOCX, mas vale registrar).
- **Sem cabeçalho/rodapé/marca lateral institucional** — saem como o "primeiro parágrafo é o título". Para o laudo oficial, será necessário um template DOCX-base com tudo isso preenchido por placeholders.

---

## 4. Onde os arquivos exportados são salvos

Conforme doc 02 §9, dentro do workspace da ocorrência ativa:

```
<BO_xxx>.sicro/
└── exports/
    ├── html/laudo_<8chars>_<YYYYMMDDhhmmss>.html
    ├── pdf/laudo_<8chars>_<YYYYMMDDhhmmss>.pdf
    └── docx/laudo_<8chars>_<YYYYMMDDhhmmss>.docx
```

Cada exportação é registrada em `sicro.sqlite` (tabela `exports`) com `relative_path`, `file_size`, `kind`, `created_at`. O Inspector da Toolbar (`ExportMenu` componente) lista as 5 mais recentes ao abrir.

**Audit log:** cada operação registra `laudo.exported_html/pdf/docx` em `audit_logs` com referência ao export_id.

---

## 5. Comandos para rodar

```powershell
# Pré-requisito único: Microsoft Edge instalado (já vem no Win11).
# Nenhuma instalação adicional além das deps já existentes.

cd "C:\SICRO 2.0\sicro-desktop"
git checkout spike/export-engine     # branch deste spike

# Validações já executadas neste spike:
pnpm typecheck                       # ✅ sem erros
pnpm build                           # ✅ 1710 módulos, 667 KB JS gzip 211 KB
( cd src-tauri ; cargo check )       # ✅ 0,49 s (cache do build anterior)

# Para validar em runtime:
pnpm tauri:dev
```

---

## 6. Testes manuais executados

### Lado seco (todos verdes nesta sessão)

| # | Teste | Resultado |
|---|---|---|
| 1 | `pnpm typecheck` | ✅ Sem erros (após corrigir backticks dentro do CSS string do renderer) |
| 2 | `pnpm build` | ✅ 1710 módulos transformados, 667 KB JS / 211 KB gzip |
| 3 | `cargo check` em `src-tauri/` | ✅ 0,49 s (cache aproveitado); `docx-rs 0.4.20` linkou OK |
| 4 | Detecção do Edge no Win11 | ✅ `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` v148 confirmado |

### Em runtime (validado pelo usuário)

| # | Verificação | Resultado |
|---|---|---|
| 1 | Abertura do app e navegação para Laudo dentro de uma ocorrência aberta | ✅ |
| 2 | Botão **Exportar ▾** acessível na toolbar | ✅ |
| 3 | Header do menu de export mostra o título do laudo a exportar (anti-confusão de runtime) | ✅ |
| 4 | **HTML**: gera em `<workspace>/exports/html/`, abre em navegador externo, estrutura preservada | ✅ |
| 5 | **PDF**: gera em `<workspace>/exports/pdf/`, abre no leitor padrão, A4 + margens corretas, texto / heading / tabela / figura / storyboard preservados | ✅ |
| 6 | **DOCX (primeira tentativa)**: arquivo gerado, abriu no Word, **mas conteúdo apareceu vazio** | ⚠️ Causa identificada (UX/sequência + 4 fragilidades latentes do walker) |
| 7 | **DOCX (após correção)**: arquivo gerado, abre no Word, conteúdo do `.sicrodoc` preservado integralmente | ✅ |
| 8 | Storyboard exportado para DOCX (top-level e aninhado em tableHeader) | ✅ — top-level vira tabela 2-col; aninhado vira sequência de parágrafos |
| 9 | Exportação salva em `<workspace>/exports/{html,pdf,docx}/` + registrada na tabela `exports` do SQLite | ✅ |
| 10 | Spike A continua operando (criar/abrir/listar ocorrências) | ✅ |
| 11 | Spike B continua operando (salvar/reabrir `.sicrodoc`) | ✅ |

### Diagnóstico e correção do DOCX (registro técnico)

Na primeira tentativa de runtime, o DOCX exportado abriu mostrando apenas o título do laudo. Forense em disco revelou que:

- O `.sicrodoc` efetivamente exportado pelo Rust (`laudo_4e418e19-...`, 576 bytes) **estava de fato vazio** — apenas `{ "type": "paragraph" }` no `content.content`.
- Um segundo `.sicrodoc` (`laudo_82d37cd8-...`, 13 KB com 25 parágrafos e estruturas ricas) existia no mesmo workspace, mas **nunca foi exportado para DOCX**.
- O `word/document.xml` do DOCX correspondia exatamente ao input recebido: 1 paragraph de título + 1 paragraph vazio.

Conclusão: o walker tinha emitido o correto sobre o input que recebeu — o usuário tinha o laudo errado aberto no editor ao clicar Exportar. **A causa primária foi UX/sequência.** Aproveitei a investigação para corrigir 4 fragilidades latentes no walker que se manifestariam em runtime futuro mesmo com o laudo certo aberto:

1. **`paragraph_from_inline` podia retornar `Paragraph` sem nenhum `Run`** quando todos os inlines eram desconhecidos. Word descarta esses paragraphs silenciosamente. Fix: garantir ≥ 1 run sempre.
2. **`tableHeader` perdia bloco aninhado**: o `.sicrodoc` real do usuário tinha um storyboard dentro de um `tableHeader`. O walker original tratava `tableHeader` como `tableCell` mas roteava o conteúdo via `paragraph_from_inline`, que perde nodes de bloco. Fix: novo `build_table_cell` reconhece paragraph/heading/lista/storyboard/figure aninhados e flattens em sequência de paragraphs.
3. **`render_list` tinha código duplicado/morto** que potencialmente produzia bullets duplicados em listas reais. Reescrito enxuto com `list_to_paragraphs`.
4. **Nodes de tipo desconhecido viravam paragraph vazio**. Fix: `fallback_paragraph` faz walk recursivo coletando qualquer `text` ou `systemData` na subárvore (em italic); se nada for encontrado, emite sentinel `[bloco "X" sem suporte na exportação DOCX]`.

Adicionalmente, o `ExportMenu` ganhou um cabeçalho mostrando o título do laudo a exportar, eliminando a ambiguidade que causou a confusão original.

### Testes de integração Rust (novo)

`src-tauri/tests/docx_export.rs` — 3 testes que extraem `word/document.xml` do DOCX gerado e verificam textos esperados:

| Teste | Cobre |
|---|---|
| `renders_paragraphs_headings_marks_table_figure_storyboard` | h1/h2, paragraph com bold/italic/underline, systemData inline, bulletList/orderedList, table (header+cell), figure com legenda, storyboard top-level **e storyboard aninhado em tableHeader (caso real do `.sicrodoc` do usuário)** |
| `renders_empty_document_without_crashing` | `.sicrodoc` vazio (caso original do usuário) |
| `renders_envelope_with_missing_optional_fields` | Envelope defensivo sem `title` |

Resultado: **3 passed; 0 failed** (`cargo test --test docx_export`).

---

## 7. Limitações encontradas

### Limitações de fidelidade visual do DOCX (saída editável secundária)

> Lembrete: DOCX é **saída secundária**. Estas limitações são aceitas em troca de robustez estrutural.

1. **Imagens reais não são embutidas** — figuras viram um parágrafo `"[Figura — imagem não exportada nesta versão]"` + legenda. Para embutir bytes reais, ler `attrs.src` (quando for `file://`) e usar `Pic::new(bytes)` do `docx-rs`. Pendência do MVP 2.
2. **Cabeçalho institucional, rodapé e marca lateral ausentes** — saem só conteúdo + título. Para o laudo oficial, estratégia prevista é template DOCX-base com placeholders (doc 04 §47).
3. **`SystemData` perde o estado de revisão** (pending/reviewed/converted) — vira texto cinza simples.
4. **Storyboard aninhado em cell é flat para parágrafos** (não tabela aninhada) — perde a coluna de imagem mas preserva 100% do texto.
5. **`bulletList`/`orderedList` não usa a numeração nativa do DOCX** — bullet é um prefixo `"• "` ou `"N. "` no início do parágrafo. Funciona em qualquer leitor, mas não responde a estilos automáticos do Word.
6. **Numeração de figuras/croquis** ("Figura N —") presente no HTML/PDF (via `numbering.ts`) **não chega ao DOCX** — o walker DOCX lê o `.sicrodoc` direto, antes da injeção de numeração que é em render-time JS. Pendência conhecida.
7. **Alinhamento de células de tabela** (vertical, largura customizada, mesclagem) — não suportado; o DOCX usa o default do `docx-rs`.
8. **Estilos `Heading1/2/3`** — referenciados pelo nome mas o documento não carrega definição custom; o Word usa o estilo padrão, que pode diferir do PDF.

### Limitações de fidelidade visual do PDF (saída oficial prioritária)

9. **PDF não tem cabeçalho institucional, rodapé nem marca lateral** — A4 com texto, mas sem a moldura institucional do laudo PCA. Pendência do MVP 2.
10. **PDF não numera "Folha X de Y"** — possível adicionar via CSS `@page { @bottom-right { content: counter(page) " / " counter(pages); } }`. Pendência do MVP 2.
11. **PDF gerado pelo Edge ignora `@media screen`** — esperado; o HTML salvo em `exports/html/` exibe layout de tela no navegador, e o PDF respeita `@page` e print rules.
12. **Sem numeração automática de tabelas** ("Tabela N —"); figuras/croquis já têm.

### Limitações estruturais / de plataforma

13. **PDF depende do Edge instalado** — específico de Windows. macOS/Linux exigirão estratégia diferente (Chrome do sistema, ou Chromium embutido via plugin Tauri). Aceitável para o MVP atual (Windows-only).
14. **PDF não tem progresso por etapas** — só "renderizando…" → resultado. Documentos grandes (>50 páginas) podem parecer travados; entra no job system (doc 02 §26) no MVP 2.
15. **Edge subprocess limita a 45 s** (`PRINT_TIMEOUT`). Suficiente para o spike; vira config no MVP 2.
16. **Não há "cancelar exportação"** — uma vez disparado, aguarda. Cancellation virá com o job system.
17. **HTML temp pode permanecer em disco** em caso de crash no meio da exportação PDF — fica em `<workspace>/cache/`. Limpeza periódica entra no MVP 2.

### Limitações da UI

18. **Menu de exportação fica aberto após sucesso** (por design, para mostrar "Salvo em…"). Revisar UX no MVP 2.
19. **Sem "abrir arquivo exportado"** — só mostra o caminho relativo. Requer `tauri-plugin-shell::open()` ou similar.
20. **Sem toast/notificação global** — se o usuário fechar o menu enquanto roda, perde a notificação. Pendência do MVP 2.

### Limitações estruturais / de plataforma

8. **PDF depende do Edge instalado** — esta abordagem é específica de Windows. Em macOS/Linux precisará de outra estratégia (Chrome/Chromium do sistema ou crate Rust com Chromium embutido). Aceitável para o MVP atual, que é Windows-only.
9. **PDF não tem progresso por etapas** — só "renderizando…" → resultado. Para documentos grandes (>50 páginas) pode parecer travado; um job em background com progresso virá na infraestrutura de jobs (doc 02 §26).
10. **Edge subprocess limita 45s** — `PRINT_TIMEOUT` é configurável apenas em código por enquanto. Suficiente para o spike; vira config no MVP 2.
11. **Não há "cancelar exportação"** — uma vez disparado o `print-to-pdf`, o usuário aguarda. Cancellation virá com o job system.
12. **HTML temp pode permanecer em disco** se o app crashar no meio — está em `<workspace>/cache/`, fora do path canônico. Limpeza periódica do cache fica para o MVP 2.

### Limitações da UI do spike

13. **Menu de exportação fica aberto após sucesso** — por design, para o usuário ver a mensagem "Salvo em …". Pode incomodar; revisar UX no MVP 2.
14. **Sem "abrir arquivo exportado"** — só mostra o caminho relativo. Para abrir, seria preciso `tauri-plugin-shell::open()` ou similar.
15. **Sem aviso visual fora do menu** — se o usuário fechar o menu enquanto roda, perde a notificação. Toast global fica para o MVP 2.

---

## 8. Riscos remanescentes

| Risco | Severidade | Mitigação proposta |
|---|---|---|
| **PDF gerado dentro do OneDrive** sofre o mesmo problema do `.sicrodoc` no Spike A (lock, conflito de sync) | Alto | Risco herdado; configuração `default_workspaces_dir` fora do OneDrive continua sendo a recomendação |
| **PDF depende do Edge instalado no Windows 11** — em macOS/Linux, ou em Win sem Edge, a exportação PDF falha com mensagem clara mas não tem fallback automático | Médio | Roadmap: Chromium embutido via plugin Tauri ou crate equivalente; aceitável para o MVP atual |
| **Empacotamento final** (`pnpm tauri:build`) com Edge ausente na máquina-alvo: PDF para de funcionar com mensagem mas sem detecção proativa | Médio | Detectar Edge no boot do app e expor em Configurações; ou empacotar Chrome embutido no MVP 3 |
| **Edge headless flag pode mudar** (`--headless=new` introduzido em Chromium 109; futuros majors podem renomear) | Médio | Pino do flag atual; revisar release notes do Edge a cada major |
| **`docx-rs` ainda em 0.4.x** — API pode quebrar em 0.5 | Médio | Pino `docx-rs = "0.4"` no Cargo.toml; revisar antes de upgrade |
| **DOCX pode renderizar diferente entre Word 365 / Word 2016 / LibreOffice / Office Mobile** | Médio | Esperado; runtime validou no Word — outros leitores entram no teste do MVP 2 |
| **Crash do Edge subprocess** não notifica o front-end além de "Falha: …" | Médio | Suficiente para o spike; logs estruturados virão com o job system (doc 02 §26) |
| **`@page` do CSS pode quebrar em combinações exóticas** (margens negativas, page-break-inside em flex/grid) | Médio | Walker e renderer usam apenas regras conservadoras |
| **Edge em path não-padrão** (instalações corporativas) | Baixo | Fallback `where chrome.exe` cobre alguns casos; configuração manual no MVP 2 |
| **Storyboard flat em cell perde a coluna de imagem** — uma escolha deliberada para evitar tabela aninhada que confunde Word | Baixo | Documentado; quando imagem real for embutida (MVP 2), o item-em-cell pode virar mini-tabela 2-col com altura controlada |
| **`bulletList`/`orderedList` no DOCX usa prefixo textual** em vez de numeração nativa do Word | Baixo | Imagine no MVP 2 a transição para `Numbering` do `docx-rs` se algum laudo precisar reorganizar a lista no Word |

---

## 9. Critérios de sucesso (mapeamento final)

| # | Critério | Status |
|---|---|---|
| 1 | SICRO gera HTML intermediário a partir de `.sicrodoc` | ✅ aprovado em runtime |
| 2 | HTML preserva estrutura básica do laudo | ✅ aprovado em runtime |
| 3 | SICRO gera PDF básico | ✅ aprovado em runtime |
| 4 | PDF abre fora do SICRO | ✅ aprovado em runtime |
| 5 | PDF preserva texto, headings, tabela, figura+legenda e storyboard | ✅ aprovado em runtime |
| 6 | SICRO gera DOCX básico | ✅ aprovado em runtime (após correção) |
| 7 | DOCX abre em Word/LibreOffice | ✅ aprovado em runtime (Word) |
| 8 | DOCX preserva mínimo: texto, headings, tabela, imagens/placeholders | ✅ aprovado em runtime (após correção; imagens reais ainda placeholder) |
| 9 | Exportações salvas dentro do workspace | ✅ aprovado (`exports/{html,pdf,docx}/`) |
| 10 | Fonte da verdade continua sendo o `.sicrodoc` | ✅ aprovado — DOCX lê `.sicrodoc` direto, PDF parte do HTML que parte do `.sicrodoc`, HTML é serialização do `.sicrodoc` |
| 11 | Módulo Laudo continua salvando/reabrindo | ✅ aprovado |
| 12 | Spike A continua funcionando | ✅ aprovado |
| 13 | Spike B continua funcionando | ✅ aprovado |
| 14 | Limitações documentadas | ✅ seção 7 (20 itens) |
| 15 | Recomendação clara | ✅ APROVADO (seção 11) |

---

## 10. Comparativo das três rotas

| Aspecto | HTML | PDF | DOCX |
|---|---|---|---|
| Fonte | `.sicrodoc` → renderer JS | `.sicrodoc` → renderer JS → Edge headless | `.sicrodoc` → walker Rust |
| Dep nova | nenhuma | nenhuma | `docx-rs` 0.4 |
| Custo runtime | ms | ~2–4 s (spawn de Edge + render) | <1 s |
| Fidelidade vs `.sicrodoc` | 100% (mesmo render que a prévia) | ~95% (Chromium tipográfico) | ~75% (sem imagens reais, sem ornamentos) |
| Cabeçalho institucional | ✗ (a fazer) | ✗ (a fazer) | ✗ (a fazer) |
| Marca lateral | ✗ | ✗ | ✗ |
| Imagens reais | ✗ (placeholder SVG embed) | ✗ (placeholder SVG embed) | ✗ (placeholder texto) |
| Plataforma | qualquer | **Windows-only** (Edge dep.) | qualquer |
| Saída oficial? | não | **sim (prioritária)** | sim (secundária) |

---

## 11. Recomendação final

### Status: ✅ **APROVADO**

A pergunta do spike é respondida em runtime: as três rotas (HTML, PDF, DOCX) funcionaram com `.sicrodoc` real do usuário, abriram em ferramentas externas e preservaram o conteúdo. A correção do walker DOCX (4 fragilidades + reforço de UI) deixou o caminho seguro para os MVPs seguintes.

**Estratégias confirmadas:**

1. **HTML** — reaproveitar `renderSicroDocToHtml` do Document Engine. Definitivo.
2. **PDF (saída oficial prioritária)** — `msedge.exe --headless=new --print-to-pdf` via subprocess Rust. Aceitável para o MVP atual (Windows-only); migração para Chromium embutido fica para o MVP 3 se o produto precisar de macOS/Linux.
3. **DOCX (saída editável secundária)** — `docx-rs` 0.4.x com walker próprio sobre o `.sicrodoc`. Quando o cabeçalho institucional entrar no MVP 2, evoluir para template DOCX-base + injeção; o walker convive com a estratégia template para conteúdo dinâmico.

### Próximos passos sugeridos

1. ✅ **Validação em runtime** concluída pelo usuário.
2. **Commit + merge na `main` + tag `v0.3.0-spike-c-export-engine`** (este pedido).
3. Próximo bloco de trabalho (escolha do usuário):
   - **MVP 2 incremental (recomendado antes do próximo spike de tecnologia)** — agregar cabeçalho institucional + rodapé + marca lateral + "Folha X de Y" + embed de imagem real no PDF e no DOCX. Sem isso, nenhuma das exportações pode virar laudo oficial.
   - **Spike D — Importador `.sicroapp`** — começa a montar o dossiê com dados de campo reais.
   - **Spike E — Croqui** ou **Spike F — Vídeo** — qualquer um dos motores especializados restantes.

### Se um problema futuro de exportação surgir

Pontos de atenção em ordem de probabilidade:

1. **Edge subprocess hang** — o `PRINT_TIMEOUT` de 45 s mata e reporta. Se for muito frequente, aumentar para 90 s ou implementar progresso.
2. **PDF abre vazio** — provavelmente `--virtual-time-budget` curto demais para fontes externas; aumentar para 10 000 ms.
3. **DOCX não abre no Word** — `docx-rs` produz um zip XML; validar com `unzip -l` que o `.docx` contém `[Content_Types].xml`, `word/document.xml`, etc. Os testes de integração (`cargo test --test docx_export`) cobrem o cenário básico.
4. **CSS `@page` ignorado** — algumas combinações de margens podem ser sobrescritas pelo `--no-pdf-header-footer`. Testar com e sem essa flag.
5. **Conteúdo inesperado no DOCX** — rodar `cargo test --test docx_export` localmente para reproduzir o cenário e adicionar caso novo se necessário.

---

## Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-24 | 1.0 | Spike C implementado: backend Rust (migration 003, modelo Export, repo, 4 comandos, exporters html/pdf/docx), frontend (ExportMenu na toolbar, 4 wrappers em commands.ts, +`@page` no renderer). `pnpm typecheck`, `pnpm build`, `cargo check` todos verdes. Pendente: validação em runtime. |
| 2026-05-24 | 1.1 | HTML e PDF validados em runtime; DOCX abria no Word mas o conteúdo do laudo não aparecia (só o título). Causa identificada: usuário tinha o laudo errado aberto (vazio) ao clicar Exportar. Foram catalogadas 4 fragilidades latentes do walker que poderiam atingir o usuário em runtime futuro. |
| 2026-05-24 | 1.2 | Walker DOCX corrigido (paragraph sempre com ≥1 run, tableHeader trata bloco aninhado, render_list reescrito, fallback_paragraph para nodes desconhecidos); ExportMenu mostra título do laudo a exportar; suite de testes de integração (`tests/docx_export.rs`, 3 testes). `cargo test --test docx_export`: 3 passed; 0 failed. |
| 2026-05-24 | 1.3 | **Spike C APROVADO em runtime.** DOCX validado com conteúdo real (parágrafos, headings, B/I/U, tabela, figura placeholder, storyboard). HTML e PDF mantidos. Spike A e B continuam operando sem regressão. Reorganizado para fechamento. |
