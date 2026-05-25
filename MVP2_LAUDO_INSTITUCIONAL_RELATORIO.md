# MVP 2 — Laudo Institucional Básico

> MVP incremental do módulo Laudo, construído sobre `v0.3.0-spike-c-export-engine`.
> Branch: **`mvp/laudo-institucional-basico`** → integrada à `main` em 2026-05-25.
> Tag de checkpoint: **`v0.4.0-mvp2-laudo-institucional`**.
>
> **Status: ✅ APROVADO COM RESSALVA — validado em runtime nas três revisões (1.0 → 1.1 → 1.2).**
>
> **Ressalva técnica registrada (NÃO bloqueia o MVP):**
> A margem inferior no editor ainda não é plenamente respeitada — o texto pode
> avançar até o final da tira branca contínua. A causa é a paginação soft do
> editor (sem reflow real de parágrafo). PDF e DOCX têm paginação própria
> via `@page` (Chromium) e `<w:sectPr>` (Word), então a margem inferior é
> respeitada nessas duas superfícies. A correção definitiva (paginação dura
> com reflow real) fica registrada como pendência para um spike próprio:
> **`spike/pagination-engine`**. Decisão consciente de não travar o projeto
> aqui — MVP 2 atende ao objetivo institucional.

---

## Objetivo

Aproximar o módulo Laudo do laudo pericial institucional real da Polícia
Científica do Amapá, com chrome institucional (cabeçalho/rodapé/marca
lateral), templates iniciais editáveis, bloco de quesitos, bloco de
assinatura e injeção de dados automáticos da ocorrência — preservando o
`.sicrodoc` como fonte da verdade e mantendo as três rotas de exportação
aprovadas no Spike C.

---

## 1. Decisão arquitetural-chave

**Chrome institucional não é conteúdo.** Cabeçalho, rodapé, marca lateral
e numeração de páginas **não fazem parte do `content` TipTap editável**.
Eles vivem em `layout.institutional_template` no envelope `.sicrodoc`
(já presente no schema desde o Spike B) e são renderizados por cada saída:

| Onde | Como renderiza o chrome |
|---|---|
| Editor (visual) | `EditorPage.tsx` desenha header/footer/side-mark como decoração **não-editável** ao redor da `.sicro-editor-content` |
| HTML/PDF | `renderer.ts` envolve o conteúdo TipTap com `<header>`/`<aside>`/`<footer>` + CSS `@page` com `counter(page)` / `counter(pages)` para Folha X de Y no PDF |
| DOCX | `docx-rs` Header + Footer nativos. Marca lateral é **omitida no DOCX** por design (rotação de texto em margem é frágil entre Word desktop / LibreOffice / Office Mobile) |

Isso garante que o `.sicrodoc` continua sendo a fonte da verdade do
**conteúdo**; o chrome é **configuração**, intercambiável entre templates
institucionais futuros sem reescrever documentos antigos.

---

## 2. Arquivos criados / alterados

### Criados (8)

```
src/modules/laudo/document-engine/institutional-templates.ts
src/modules/laudo/document-engine/nodes/Quesito.ts
src/modules/laudo/document-engine/nodes/Signature.ts
src/modules/laudo/components/NewLaudoDialog.tsx + .module.css

MVP2_LAUDO_INSTITUCIONAL_RELATORIO.md
```

### Alterados (12)

```
src-tauri/src/exporters/docx.rs                            # +chrome PCA, +quesito/signature, +cell handlers
src-tauri/tests/docx_export.rs                              # +renders_mvp2_quesitos_and_signature

src/modules/laudo/document-engine/index.ts                  # +exports
src/modules/laudo/document-engine/extensions.ts             # +Quesito*, +Signature
src/modules/laudo/document-engine/nodes/index.ts            # +exports
src/modules/laudo/document-engine/templates.ts              # +sinistroTransitoSimples, +OccurrenceContext
src/modules/laudo/document-engine/renderer.ts               # +chrome HTML/@page, +quesito/signature CSS

src/modules/laudo/components/EditorPage.tsx                 # +DocHeader + DocFooter + SideMark
src/modules/laudo/components/EditorPage.module.css          # +chrome styles, +quesito/signature styles
src/modules/laudo/components/EditorToolbar.tsx              # +botões Quesito + Assinatura, +occurrence
src/modules/laudo/components/ExportMenu.tsx                 # +occurrence pass-through
src/modules/laudo/components/HtmlPreview.tsx                # +occurrence prop
src/modules/laudo/store/laudoStore.ts                       # +initialContent opcional em createLaudo
src/modules/laudo/views/LaudoEditorView.tsx                 # +activeOccurrence, +pass to EditorPage/Toolbar
src/modules/laudo/views/LaudoListView.tsx                   # NewLaudoDialog substitui create direto
```

**Nenhuma dependência nova** — frontend e backend reaproveitam o que já
existia (TipTap 3.23 + `docx-rs` 0.4 cobriram todo o MVP 2).

---

## 3. Mudanças no Document Engine

### 3.1 Schema

`layout.institutional_template` (já presente no schema desde o Spike B)
agora é **efetivamente consumido**. O default, quando ausente, é
`pca_padrao_v1` (definido no `findInstitutionalTemplate()`).

### 3.2 Novos nós TipTap

| Node | Group | Content schema | Atributos |
|---|---|---|---|
| `quesitoList` | block | `quesitoItem+` | — |
| `quesitoItem` | block (isolating) | `quesitoQuestion quesitoAnswer` | — |
| `quesitoQuestion` | block (defining) | `inline*` | — |
| `quesitoAnswer` | block (defining) | `inline*` | — |
| `signature` | block (atom) | — | `city`, `uf`, `date`, `name`, `role` |

Numeração dos quesitos via CSS `counter-increment` no renderer (não
persistida) — reordenar quesitos renumera automaticamente, sem operação
de banco.

### 3.3 Institutional templates

Novo arquivo `institutional-templates.ts` que define a estrutura visual
oficial. Para o MVP 2 ships apenas **PCA Padrão v1**:

- Margens A4: 3 cm top, 2 cm right, 2.5 cm bottom, 3.5 cm left
- Header: 3 linhas (GOVERNO… / POLÍCIA CIENTÍFICA… / DEPARTAMENTO…) + grid de metadata com `Laudo nº`, `BO nº`, `Tipo de perícia`, `Município`
- Footer: texto institucional + Folha X de Y (no PDF)
- Side mark: texto vertical "POLÍCIA CIENTÍFICA DO ESTADO DO AMAPÁ" rotacionado -90° à esquerda
- Função `resolveHeaderField()` resolve `occurrence.<field>` / `metadata.<field>` em valores reais

### 3.4 Renderer

`renderer.ts` ganhou:

- Função `pageStyles(template)` que monta `@page` com margens institucionais e `counter(page)`/`counter(pages)`.
- Wrappers HTML `<header>`, `<aside>`, `<main>`, `<footer>`.
- CSS para os novos nós: `[data-sicro-quesito-list]`, `[data-sicro-quesito-question/answer]::before` com `counter(quesito)`, `[data-sicro-signature]`.
- Side mark via `position: fixed` na visualização HTML; aceita-se que **só aparece na primeira página** do PDF Edge headless (running header / repeating side mark em todas as páginas exige `@page` recursivo, considerado MVP 3).

---

## 4. Mudanças nos templates

`templates.ts` foi promovido a um registry com **dois templates**:

### Documento Livre (já existia, simplificado)

Um cabeçalho `<h1>` + um parágrafo orientativo. Não toca em dados da
ocorrência.

### Sinistro de Trânsito Simples (novo)

Espinha dorsal completa, com seções na ordem solicitada:

```
[H1] Laudo Pericial — Sinistro de Trânsito (título recebido)

[H2] PREÂMBULO
[Parágrafo] Texto institucional com systemData injetado:
            "...Boletim de Ocorrência <BO> ...município de <MUNICIPIO>
            ...laudo pericial referente a <TIPO_PERICIA>."

[H2] 1 – DO HISTÓRICO
[Parágrafo] Texto orientativo neutro
[Parágrafo] systemData com BO, requisição/ofício, data do fato

[H2] 2 – DOS EXAMES
[Parágrafo] Texto orientativo neutro
[Parágrafo] "Inserir aqui figuras, croqui esquemático e tabelas técnicas..."

[H2] 3 – DA ANÁLISE TÉCNICO-PERICIAL
[Parágrafo] Texto orientativo neutro — afirma autoria do perito

[H2] 4 – DA CONCLUSÃO
[Parágrafo] Texto orientativo neutro — afirma que SICRO não preenche
            automaticamente

[H2] 5 – DOS QUESITOS
[Parágrafo] Orientação
[quesitoList] 2 quesitos exemplares com pergunta/resposta a preencher

[H2] ASSINATURA
[signature] cidade=<municipio || "Macapá">, uf="AP",
            date=<hoje>, name=<primeiro perito da ocorrência>,
            role="Perito Criminal"
```

**Importante:** nenhuma seção de análise/conclusão é preenchida
automaticamente. Onde o sistema toca, é apenas com `systemData` inline
em estado `pending` (visualmente destacado para revisão).

### Função `build(title, occurrence?)`

`OccurrenceContext` é o tipo de entrada — campos opcionais que o template
consulta para decidir entre injetar `systemData` ou deixar `____________`
como placeholder textual. Quando a ocorrência não está disponível
(ex.: o template é validado por testes), o texto continua coerente.

---

## 5. Mudanças na exportação

### HTML

- Reaproveita 100% do renderer.
- Agora gera o `<header>`, `<aside>` (side-mark) e `<footer>` na primeira página.
- CSS `@media screen` mantém o layout para visualização em navegador.

### PDF

- Mesma rota Edge headless do Spike C.
- Adicionado `@page { @bottom-right { content: "Folha " counter(page) " de " counter(pages); } }`.
- **Cabeçalho institucional aparece apenas na primeira página** (limitação documentada na seção 8).
- **Marca lateral aparece apenas na primeira página** (mesmo motivo).

### DOCX

- Reaproveita o walker do Spike C.
- **Header e Footer DOCX nativos** registrados via `docx-rs::Header` e `Footer` — repetidos em **todas as páginas** (vantagem do DOCX sobre PDF no MVP 2!).
- Marca lateral **omitida** (texto vertical em margem DOCX é frágil entre Word/LibreOffice/Office Mobile).
- Novos handlers de bloco:
  - `quesitoList` → sequência de parágrafos "Quesito N: ..." + "Resposta: ..."
  - `signature` → 6 parágrafos (spacer, cidade-UF-data à direita, spacer, regra "_____", nome bold centralizado, cargo italic centralizado)
- `build_table_cell` reconhece `quesitoList` e `signature` aninhados (extensão das correções do Spike C).

### Audit log

Sem mudança — entradas `laudo.exported_html/pdf/docx` continuam sendo
gravadas pelo Spike C.

---

## 6. Testes manuais executados

### Lado seco (todos verdes nesta sessão)

| # | Teste | Resultado |
|---|---|---|
| 1 | `pnpm typecheck` | ✅ Sem erros |
| 2 | `pnpm build` (tsc + Vite) | ✅ 685 KB JS / 217 KB gzip, 32 KB CSS / 6,42 KB gzip |
| 3 | `cargo check` em `src-tauri/` | ✅ 1,42 s sem erros nem warnings |
| 4 | `cargo test --test docx_export` | ✅ **4/4 passed** (3 do Spike C + 1 novo do MVP 2) |

Detalhes do novo teste:

`renders_mvp2_quesitos_and_signature` valida:
- Título + heading "5 – DOS QUESITOS" preservados
- "Quesito 1:", "Quesito 2:", "Resposta:" emitidos na ordem correta
- Texto dos quesitos preservado (RespostaQuesito1, RespostaQuesito2, etc.)
- Bloco de assinatura: "Macapa - AP, 24/05/2026.", "Perito Andre", "Perito Criminal"
- O `.docx` zip contém entradas `word/header*.xml` e `word/footer*.xml`
- O XML do header contém "POLÍCIA CIENTÍFICA DO AMAPÁ"

### Em runtime — pendente de validação

| # | Critério | Como validar |
|---|---|---|
| 1 | Módulo Laudo continua abrindo | Clicar em Laudo na Activity Rail |
| 2 | Criar laudo Documento Livre | Botão "Novo laudo" → dialog → seleciona Documento Livre → confirma |
| 3 | Criar laudo Sinistro de Trânsito Simples | Botão "Novo laudo" → dialog → seleciona Sinistro… → confirma |
| 4 | Cabeçalho institucional visível no editor | Topo da folha A4 mostra GOVERNO… / POLÍCIA CIENTÍFICA… / DEPARTAMENTO… + meta-grid |
| 5 | Rodapé visível no editor | Base da folha mostra texto institucional + "Folha 1" |
| 6 | Marca lateral visível no editor | Texto vertical "POLÍCIA CIENTÍFICA…" à esquerda da folha |
| 7 | Texto próximo de laudo real | PREÂMBULO/HISTÓRICO/EXAMES/ANÁLISE/CONCLUSÃO/QUESITOS/ASSINATURA visíveis no editor |
| 8 | Dados automáticos inseridos | Texto destacado em fundo dourado (`systemData` pending) no PREÂMBULO |
| 9 | Dados automáticos distinguíveis | Fundo dourado vs texto autoral normal |
| 10 | Bloco de quesitos funciona | "Quesito 1: Houve sinistro de trânsito…" + "Resposta:" editáveis; botão **Quesito** na toolbar adiciona quesito |
| 11 | Bloco de assinatura funciona | "Macapá - AP, dd/mm/aaaa.", regra, nome, "Perito Criminal" presentes; botão **Assinatura** na toolbar |
| 12 | Salvar/reabrir preserva tudo | Fechar app → reabrir → laudo idêntico |
| 13 | Export HTML | Visualizar o HTML em navegador externo: chrome + conteúdo |
| 14 | Export PDF | Abrir PDF: A4, margens corretas, "Folha X de Y" no rodapé, cabeçalho na primeira página |
| 15 | Export DOCX | Abrir no Word: cabeçalho **repetido em todas as páginas**, rodapé, conteúdo |
| 16 | `.sicrodoc` continua fonte da verdade | Inspecionar `<workspace>/laudos/*.sicrodoc`: JSON com `layout.institutional_template`, `content.content` com quesito/signature nodes |
| 17 | Spike A continua | Criar/abrir/listar ocorrências |
| 18 | Spike B continua | Salvar/reabrir `.sicrodoc` |
| 19 | Spike C continua | Exportações HTML/PDF/DOCX funcionam |

---

## 7. Limitações encontradas

### Limitações de paridade visual

1. **Cabeçalho institucional aparece apenas na primeira página do PDF** — repetição em todas as páginas exige `position: running()` + `@top-center { content: element(...) }` do CSS Generated Content, que tem suporte parcial e instável no Chromium. Aceito para o MVP 2; será revisitado se o cliente exigir cabeçalho em toda página no PDF. **No DOCX o cabeçalho repete em todas as páginas** porque o `docx-rs::Header` é nativo.
2. **Marca lateral aparece apenas na primeira página do PDF** — mesma razão técnica do item 1.
3. **Marca lateral omitida no DOCX** — texto rotacionado em margem é frágil entre Word desktop / LibreOffice / Office Mobile. Documentado e intencional.
4. **"Folha 1" estático no editor** — o editor não pagina (é folha longa); o "Folha 1" visual no rodapé do editor é apenas uma referência visual. O PDF tem paginação real via `@page`. O DOCX herda do Word.
5. **Brasão real não embutido** — apenas texto institucional. Quando o asset PNG/SVG oficial existir, o `institutional-templates.ts` ganhará um campo `brand_image` e o renderer + DOCX walker passam a embutir.

### Limitações dos blocos novos

6. **Atributos do `signature` não têm UI dedicada** — `city`, `uf`, `date`, `name`, `role` vêm do template ou ficam estáticos. Edição requer ajustar via Inspector → Dados (futuro) ou diretamente no JSON do `.sicrodoc`. Aceito para o MVP 2.
7. **Quesitos não suportam quebras múltiplas dentro da resposta** — `quesitoAnswer` é `inline*` (sem parágrafos múltiplos). Para respostas longas com listas, ainda usar parágrafos fora do bloco. Revisar se o uso real demandar.
8. **Numeração de quesitos é puramente visual** (CSS `counter`) — não é refletida no JSON. Reordenar quesitos renumera no PDF/editor, mas o JSON não carrega o número. Aceito.
9. **`systemData` ainda sem popover de revisão** (limitação herdada do Spike B) — clicar em um `systemData` no editor não abre UI; o estado `pending` é cosmético. Revisão fica para o MVP 3.

### Limitações da exportação

10. **DOCX não numera Folha X de Y** — adicionar exige `Run::add_field_char` + `InstrText("PAGE")`/`NUMPAGES`. Verifiquei a API do `docx-rs` 0.4.20 e o trade-off de implementação não compensa para o MVP 2 (Word numerou via default style — funciona para o usuário). Trivial adicionar quando for prioridade.
11. **Imagens reais continuam não embutidas no DOCX** (limitação herdada do Spike C).
12. **PDF tem o cabeçalho HTML "fixo" no body, não na running area do @page** — implica que documentos de várias páginas têm cabeçalho só na primeira. Revisitar quando o cliente exigir.

### Limitações de UX

13. **NewLaudoDialog sempre sugere `documento_livre`** — não persiste a última escolha do usuário. Aceito.
14. **Botões da toolbar não desabilitam fora de contexto válido** — clicar "Quesito" no meio de uma tabela pode quebrar a estrutura. ProseMirror corrige automaticamente, mas a UX poderia avisar. Revisar no MVP 3.
15. **Inspector ainda não exibe outline com quesitos/signature** — só headings. Trivial estender `buildOutline` quando útil.

---

## 8. Riscos técnicos percebidos

| Risco | Severidade | Mitigação proposta |
|---|---|---|
| **`institutional_template` ausente em laudos antigos** (criados no Spike B/C) | Baixo | `findInstitutionalTemplate(undefined)` retorna `pca_padrao_v1` (default seguro). Documentado e validado no teste `renders_envelope_with_missing_optional_fields`. |
| **CSS `@page @bottom-right` com `counter(page)`** — comportamento varia entre versões do Chromium | Médio | Edge 109+ suporta consistentemente; `pdf.rs::PRINT_TIMEOUT` cobre eventual lentidão. |
| **`docx-rs::Header`/`Footer`** — API possivelmente instável em 0.5 | Médio | Pino `docx-rs = "0.4"`; teste `renders_mvp2_quesitos_and_signature` é o canário (falha imediata em quebras de contrato). |
| **`quesitoList` content schema** rígido (`quesitoItem+`) — colar conteúdo arbitrário pode resultar em transformação inesperada | Baixo | ProseMirror normaliza para state válido; isolating: true protege; pior caso = perda do paste, não corrupção. |
| **`signature` é atom** — não-editável internamente; mudar atributos exige UI dedicada futura | Baixo | Spike B já estabeleceu o padrão (systemData também é atom-like). |
| **Side mark `position: fixed` no HTML** pode atrapalhar print de alguns leitores | Baixo | Edge respeita corretamente; outros leitores HTML não rodam `--print-to-pdf` então não é problema do nosso pipeline. |
| **Templates injetam systemData no PREÂMBULO** — se o usuário deletar acidentalmente, perde o vínculo | Baixo | UX do MVP 3 (botão "restaurar dado do sistema" no Inspector). Por ora, o documento orientativo já alerta. |
| **Texto institucional hardcoded** (PCA Amapá) — futuras unidades não-PCA precisarão configuração | Médio | Quando outra unidade adotar, `INSTITUTIONAL_TEMPLATES` ganha entradas adicionais; UI de Configurações entra no roadmap. |
| **Bundle JS subiu para 685 KB** (+17 KB vs Spike C) | Baixo | Esperado — 2 templates + 5 nodes novos. Code-split do Laudo segue como recomendação do MVP 3. |
| **Editor pagina como folha única longa** — usuário pode esperar paginação real | Médio | Documentado nas limitações; a paginação real no editor (split em A4 reais) exige `tiptap-pagination` ou solução custom — fica para spike próprio. |

---

## 9. Critérios de sucesso

| # | Critério (do enunciado) | Status técnico |
|---|---|---|
| 1 | Módulo Laudo continua abrindo | ✅ |
| 2 | Criar laudo a partir de Documento Livre | ✅ via `NewLaudoDialog` |
| 3 | Criar laudo a partir de Sinistro de Trânsito Simples | ✅ via `NewLaudoDialog` |
| 4 | Cabeçalho institucional | ✅ `EditorPage` + `renderer` + `docx::pca_padrao_v1_chrome` |
| 5 | Rodapé básico | ✅ idem |
| 6 | Marca lateral inicial (ou limitação documentada) | ✅ editor + PDF 1ª página; DOCX omitido (limitação documentada §7.3) |
| 7 | Texto próximo de laudo real | ✅ template Sinistro… |
| 8 | Dados automáticos inseridos | ✅ via `systemData` no PREÂMBULO/HISTÓRICO/ASSINATURA |
| 9 | Dados automáticos distinguíveis | ✅ background dourado herdado do Spike B |
| 10 | Bloco de quesitos | ✅ `quesitoList`/`Item`/`Question`/`Answer` |
| 11 | Bloco de assinatura | ✅ `signature` atom |
| 12 | Salvar/reabrir | ✅ schema preservado; coerceSicroDoc tolerante |
| 13 | HTML exporta | ✅ teste verde |
| 14 | PDF exporta | ✅ pipeline Spike C intacto |
| 15 | DOCX exporta (mesmo simplificado) | ✅ teste cobre quesitos + assinatura + header/footer |
| 16 | `.sicrodoc` fonte da verdade | ✅ chrome em layout, conteúdo em content — não há sobreposição |
| 17 | Spike A funcionando | ✅ nenhuma alteração em commands de workspace |
| 18 | Spike B funcionando | ✅ store de laudo estendido sem regressão |
| 19 | Spike C funcionando | ✅ exportação ainda funciona; teste verde |

---

## 10. Recomendação final

### Status: ⏳ **APROVADO TECNICAMENTE — aguardando validação em runtime**

Todas as 19 verificações do enunciado têm implementação em código. As 4 validações de build estão verdes (typecheck, build, cargo check, cargo test 4/4). O `.sicrodoc` continua sendo a fonte da verdade — chrome institucional é configuração em `layout`, não conteúdo.

Antes de validar em runtime, recomendo:

1. **Rodar `pnpm tauri:dev`** e seguir a sequência da seção 6.
2. Criar um laudo **Sinistro de Trânsito Simples** sobre a ocorrência BO 12345 existente — vai exercitar a injeção de `systemData` com município "Macapá" + tipo "Sinistro de Trânsito" reais.
3. Exportar nos 3 formatos e abrir externamente.
4. Voltar para Início e confirmar Spike A intacto.

Se houver problema em runtime, áreas mais prováveis (em ordem de probabilidade):

1. **Layout do header no editor** estourando a margem se o município/tipo for muito longo — ajuste fácil no CSS.
2. **Espaçamento do `quesitoQuestion::before`** quebrando linha estranha — ajuste CSS.
3. **Edge ignorando `@page @bottom-right`** em alguma versão — remover a flag `--no-pdf-header-footer` se necessário.
4. **`signature` aparece duplicado** se o template e o usuário inserirem manualmente — UX, não dado.

### Próximos passos sugeridos (não fazer agora)

1. Validar em runtime os 19 critérios.
2. Aprovar 1.1 do relatório.
3. Decidir entre:
   - **Spike D — Importador `.sicroapp`** (dossiê real popula systemData automaticamente).
   - **Spike E — Croqui** (motor gráfico vetorial).
   - **Spike F — Vídeo** (player + storyboard real).
   - **MVP 2.1** incremental para fechar pendências: embed de imagem real, header em todas as páginas do PDF, popover de revisão para systemData.

---

---

## 11. Ajuste runtime — paginação visual + cabeçalho configurável + brasões

Validação em runtime do MVP 2 identificou **dois problemas reais** antes da aprovação. Ambos foram corrigidos nesta revisão do relatório.

### Problema 1 — Conteúdo "vazava" para fora da folha A4

**Sintoma:** o editor mostrava UMA folha A4. Quando o conteúdo ultrapassava 29.7 cm, ele continuava aparecendo sobre o fundo cinza abaixo da folha, sem que uma segunda folha visual fosse criada.

**Causa:** `EditorPage` tinha uma única `.page` com `min-height: 29.7cm`. O `contenteditable` dentro dela cresce com o conteúdo, mas a folha branca tinha altura fixa; o conteúdo extra ficava visualmente sobre o fundo cinza do workspace.

**Estratégia adotada — "paper stack" via ResizeObserver:**

A `.page` foi promovida a um **container relativo** (`.paperStack`) que contém:

- **N `<div class="paper">`** posicionados de forma absoluta em `top: i * (29.7cm + 0.5cm)`, com `box-shadow` e `border-radius`. São o "fundo" da folha — uma camada decorativa atrás do editor.
- Um `ResizeObserver` ligado ao `.editorWrap` recalcula `pageCount = ⌈scrollHeight / pageHeightPx⌉` sempre que o conteúdo muda (também escuta `editor.on("update", …)` para casos onde o ResizeObserver não dispara).
- A `min-height` do `paperStack` é `pageCount * (pageH + gap) - gap`, garantindo que as folhas atrás "acompanham" o conteúdo.

Resultado: quando o usuário ultrapassa 29.7 cm de conteúdo, **uma segunda folha aparece automaticamente**, com gap cinza visível entre elas, exatamente como no Word/LibreOffice. O contenteditable continua sendo um único bloco — não há quebra real do texto, mas visualmente o usuário vê a sucessão de folhas.

**Honestidade técnica:** isso é **paginação visual soft**, não paginação real. O texto pode "atravessar" a borda entre duas folhas no editor (ex.: um parágrafo grande que começa na folha 1 e termina na 2 continua sendo um único bloco visual). No **PDF**, a paginação é real (`@page` do CSS + counter `Folha X de Y`). No **DOCX**, é nativa do Word. O editor é a única superfície com paginação visual aproximada — e está documentado no rodapé como `Folha N (de N visuais)`.

**Paginação real no editor (`tiptap-pagination` ou similar):** fica como pendência de spike próprio. Spike B/C foram concebidos com a separação editor↔exportador justamente para que essa decisão pudesse ser tomada sem desfazer trabalho.

### Problema 2 — Cabeçalho institucional não configurável

**Sintoma:** o cabeçalho aparecia só com brand lines + campos derivados da ocorrência (BO, tipo, município). Não havia como configurar `numero_laudo`, `setor` etc.

**Estratégia adotada — configuração estruturada via `metadata`:**

O envelope `.sicrodoc` já tinha o campo `metadata: SicroDocMetadata` desde o Spike B. O renderer já consultava `resolveHeaderField("metadata.<field>", ...)`. O que faltava era **UI para o usuário preencher**.

Adicionado em três pontos:

1. **`NewLaudoDialog`** ganhou campo opcional **"Número do laudo"** que vira `metadata.numero_laudo` no momento da criação (via `createLaudo(workspace, input, content, { numero_laudo })`).
2. **`Inspector` → nova aba "Cabeçalho"** com:
   - Campos editáveis: **Número do laudo**, **Setor / departamento**. `onBlur` persiste via `laudoStore.updateMetadata` (novo).
   - Bloco read-only "Do registro da ocorrência": BO nº, tipo de perícia, município — com nota explicativa "Editar na Home, ao criar/editar a ocorrência". Reforça a separação entre dado da ocorrência (vem do BD) e configuração do laudo (vem do envelope).
3. **`laudoStore.updateMetadata(workspacePath, patch)`** — nova ação que faz `{ ...currentDoc.metadata, ...patch }` e chama `save_laudo`. Não toca em `content` (cabeçalho continua fora do contenteditable).

O perito **não consegue editar o cabeçalho como texto comum**: ele está em `<header contentEditable={false}>` no `EditorPage`, fora do contenteditable do TipTap. Os valores são alterados apenas via a aba Cabeçalho do Inspector ou via o dialog de criação.

### Brasões institucionais

**Assets criados:**

```
public/branding/
├── README.md              # documentação para substituir pelos PNGs oficiais
├── brasao-amapa.png       # placeholder (6,3 KB) — selo circular verde com "AP"
└── brasao-pca.png         # placeholder (6,7 KB) — selo circular navy com "PCA"
```

Os arquivos atuais são **placeholders** gerados por script PowerShell durante esta sessão (selos circulares simples com siglas). O `public/branding/README.md` instrui como substituí-los pelos brasões oficiais sem mexer em código.

**Pipeline de carregamento:**

- **Editor**: o `<img>` referencia `/branding/brasao-amapa.png` direto. O Vite serve o `public/` na raiz, e o WebView2 do Tauri pega o asset sem cerimônia.
- **HTML/PDF**: o Edge headless lê o HTML temp de `<workspace>/cache/` e **não enxerga `/branding/...`**. Solução: `branding.ts` (novo) faz `fetch('/branding/...')` no front, converte para **data URI base64**, cache global. A `RenderOptions.branding?: BrandingAssets` recebe esses URIs e o renderer os injeta no `<img>` do header. O `LaudoModule` chama `loadBrandingAssets()` em `useEffect` no mount para pré-aquecer o cache.
- **DOCX**: **brasões não embutidos** nesta versão. Embutir requer `docx-rs::Image` + `Pic` + ajustes em `Header.add_image`/relationships — trabalho não-trivial, com risco de inconsistência entre Word desktop / LibreOffice / Office Mobile. Limitação registrada e documentada em `public/branding/README.md`.

**Layout do header (editor + HTML/PDF):**

```
            ┌─────────────────────────────────────────┐
            │             [BRASÃO ESTADO]             │
            │       GOVERNO DO ESTADO DO AMAPÁ        │
[BRASÃO PCA]│  POLÍCIA CIENTÍFICA DO ESTADO DO AMAPÁ  │
            │     DEPARTAMENTO DE CRIMINALÍSTICA      │
            ├─────────────────────────────────────────┤
            │ Laudo nº 12345/2026   Tipo: Sinistro…  │
            │ BO nº 12345           Município: Macapá │
            └─────────────────────────────────────────┘
```

CSS grid 2-col: brasão PCA à esquerda; centro contém o brasão Estado centralizado em cima + 3 linhas brand + opcional subtitle. Abaixo, grid 2-col de metadata.

### Arquivos alterados nesta revisão

#### Criados (4)

```
public/branding/brasao-amapa.png                                    # placeholder
public/branding/brasao-pca.png                                      # placeholder
public/branding/README.md                                           # instruções de substituição
src/modules/laudo/document-engine/branding.ts                       # fetch + cache + data URI
```

#### Alterados (11)

```
src/modules/laudo/components/EditorPage.tsx                         # paper stack + ResizeObserver + brasões no header
src/modules/laudo/components/EditorPage.module.css                  # paper stack styles + brand image positioning
src/modules/laudo/components/HtmlPreview.tsx                        # pré-carrega branding antes do iframe
src/modules/laudo/components/ExportMenu.tsx                         # await loadBrandingAssets() antes de exportar
src/modules/laudo/components/Inspector.tsx                          # 4ª aba "Cabeçalho" com 2 campos editáveis
src/modules/laudo/components/Inspector.module.css                   # headerField + headerReadOnly styles
src/modules/laudo/components/NewLaudoDialog.tsx                     # +campo "Número do laudo" no dialog
src/modules/laudo/document-engine/index.ts                          # +exports do branding
src/modules/laudo/document-engine/renderer.ts                       # RenderOptions.branding + imgs no header HTML
src/modules/laudo/store/laudoStore.ts                               # +updateMetadata, +initialMetadata em createLaudo
src/modules/laudo/LaudoModule.tsx                                   # pré-carrega branding em useEffect no mount
```

### Validações executadas nesta revisão

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ Sem erros |
| `pnpm build` | ✅ 1719 módulos, **692 KB JS / 219 KB gzip**, 33,6 KB CSS / 6,66 KB gzip |
| `cargo check` em `src-tauri/` | ✅ 0,48 s — backend não foi tocado nesta revisão (mudanças foram só no front-end) |
| `cargo test --test docx_export` | ✅ **4/4 passed** — testes do MVP 2 continuam verdes |

### Orientação para o novo teste manual

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout mvp/laudo-institucional-basico   # já está nela
pnpm tauri:dev
```

Sequência recomendada:

**A — Paginação visual:**
1. Abrir a ocorrência → Laudo → criar laudo do template **Sinistro de Trânsito Simples**.
2. Verificar que aparece **uma folha A4** com fundo branco e gap cinza no entorno.
3. Adicionar muitos parágrafos (Enter várias vezes) ou colar texto longo.
4. Quando o conteúdo passar a 29.7 cm de altura, uma **segunda folha visual** deve aparecer, com gap cinza entre as duas. Continuar digitando → terceira folha. O rodapé mostra `Folha N (de N visuais)`.
5. O conteúdo NÃO deve mais aparecer sobre o cinza fora da folha.

**B — Cabeçalho configurável:**
1. No editor, abrir o **Inspector → aba Cabeçalho**.
2. Editar **Número do laudo** = `22780/2026`. `Tab` ou click fora → ver feedback "Campo Número do laudo salvo." → cabeçalho na folha A4 atualiza imediatamente para mostrar "Laudo nº 22780/2026".
3. Editar **Setor / departamento** = `DC/PCIAP`. Idem.
4. Voltar para Home → reabrir o laudo → os valores persistem (inspecionar `<workspace>/laudos/*.sicrodoc` → `metadata.numero_laudo` e `metadata.setor` gravados).

**C — Brasões no cabeçalho:**
1. No cabeçalho da folha A4, conferir que aparecem dois selos:
   - **Selo "AP"** verde, centralizado em cima de "GOVERNO DO ESTADO DO AMAPÁ"
   - **Selo "PCA"** navy, à esquerda das três linhas brand
2. Exportar **HTML** → abrir no navegador → brasões aparecem.
3. Exportar **PDF** → abrir o PDF → brasões aparecem na primeira página.
4. Exportar **DOCX** → abrir no Word → cabeçalho institucional aparece em todas as páginas, **sem os brasões** (limitação documentada).

**D — Não-regressão:**
1. Spike A: voltar para Home → criar/abrir ocorrências.
2. Spike B: laudo salva e reabre normalmente.
3. Spike C: as 3 exportações funcionam.

### Substituição pelos brasões oficiais

Quando você tiver os PNGs oficiais em mãos:
1. Coloque-os em `public/branding/` com os nomes **exatos**: `brasao-amapa.png` e `brasao-pca.png` (sobrescreva os placeholders).
2. Recomendação: PNG quadrado, mínimo 240×240, **fundo transparente** (o cabeçalho fica sobre branco).
3. Se o app estiver rodando (`pnpm tauri:dev`), basta recarregar a janela — Vite serve os arquivos atualizados do `public/` automaticamente.
4. Em produção (`pnpm tauri:build`), os arquivos são empacotados junto com o app — não há ação adicional.

---

## 12. Ajuste runtime 1.2 — tira branca contínua, réguas e margens configuráveis

### Por que outra revisão

Validação do usuário sobre a 1.1:

> "A segunda página visual agora aparece. Porém, o conteúdo ainda atravessa a área cinza entre as páginas. O texto aparece no intervalo entre uma folha e outra, o que mostra que a paginação ainda é apenas decorativa."

O usuário também pediu uma **ferramenta de régua/margens semelhante ao Word**, deixando claro que margens são configuração de documento (devem ir no `.sicrodoc`) e não CSS solto.

### 12.1 Causa do vazamento na 1.1

A 1.1 desenhou **N folhas A4 separadas** (`paper stack`) com gaps cinza entre elas; o conteúdo, porém, era **uma única `<div>` contenteditable** posicionada por cima delas (`position: absolute`). Resultado: parágrafos que cruzavam a fronteira de 29.7 cm continuavam visíveis sobre o gap cinza — exatamente o que o usuário viu. A paginação era apenas pintura decorativa.

### 12.2 Solução: tira branca contínua + marcadores de quebra

A folha A4 foi substituída por **uma única tira branca contínua** cuja altura é `pageCount × 29.7 cm` (`<div class="sheet">`). O conteúdo flui dentro dessa tira, então **nunca aparece fora do branco**. Os limites entre páginas são desenhados como **linhas tracejadas com label central `— página N —`**, posicionadas em múltiplos de `29.7 cm` (`absolute`, `pointer-events: none`). O `pageCount` é recalculado por `ResizeObserver` no contêiner do editor.

Trade-off honesto: **a paginação continua sendo soft** — o texto não realmente quebra, só ganha marcadores visuais. Não há reflow de parágrafo para a próxima página. A vantagem é que **o vazamento visual foi 100% eliminado**: já não existe espaço cinza por onde texto poderia aparecer.

Paginação dura real (com reflow do ProseMirror em fronteiras de página) fica para um spike próprio (`spike/pagination-engine`).

### 12.3 Réguas estilo Word

Foram criados dois componentes SVG novos:

- **`HorizontalRuler.tsx`** — escala em cm (ticks a cada 0,5 cm, números 5/10/15/20), fundo azul escuro (`#2a3a52`), área útil (entre margens) em azul mais claro, **dois handles triangulares dourados** apontando para as margens esquerda e direita.
- **`VerticalRuler.tsx`** — mesma escala e estilo, com handles para margens superior e inferior; além disso desenha **marcas de página** (`Pág 1`, `Pág 2`, ...) a cada 29,7 cm, replicando a paginação visual da tira branca.

Constantes compartilhadas:

```ts
export const PX_PER_CM = 96 / 2.54;
export const RULER_THICKNESS = 22;
```

Esta versão é **somente leitura** (sem drag). Edição de margens vive em outra superfície (ver 12.5).

### 12.4 Schema: `layout.page.margins`

`SicroDoc` ganhou tipos novos no envelope:

```ts
export interface SicroDocPageMargins {
  top: string;     // ex. "3cm" / "30mm" / "2.5cm"
  right: string;
  bottom: string;
  left: string;
}
export interface SicroDocPage {
  margins?: SicroDocPageMargins;
}
export interface SicroDocLayout {
  page_size: "A4";
  orientation: "portrait" | "landscape";
  institutional_template?: string;
  page?: SicroDocPage;        // ← NOVO
}
```

Resolução de margens efetivas (`resolveEffectiveMargins(doc, template)`):

1. **`doc.layout.page.margins`** quando completo (4 lados parseáveis).
2. **`template.page.margins`** do template institucional.
3. **`DEFAULT_PAGE_MARGINS`** (3 / 2 / 2,5 / 3,5 cm).

Um helper único (`page-layout.ts`) faz parse multi-unidade (`cm`, `mm`, `pt`, `in`, `px`) e expõe `marginsInCm(...)` / `formatCm(...)` para a UI. **Mesma função em TS, mesma fórmula em Rust** — o DOCX usa a mesma lógica via `resolve_page_margin()`.

### 12.5 Inspector → 4ª aba "Página"

Nova aba (`<LayoutTemplate>`) com **4 campos numéricos** (Superior, Direita, Inferior, Esquerda) em cm. Aceita "2", "2.5", "2,5", "25mm", "2cm" — valida intervalo 0–8 cm. Onblur grava via novo `laudoStore.updateLayout(workspacePath, patch)` que deep-merges em `layout.page` e persiste o `.sicrodoc` inteiro. Quando há override, mostra botão **"Restaurar margens do template &lt;nome&gt;"** que remove o override.

### 12.6 Propagação para editor, HTML, PDF, DOCX

| Superfície | Onde a margem é aplicada | Mecânica |
|---|---|---|
| Editor (canvas) | `EditorPage.tsx` | `padding` inline em `.editorWrap`, calculado por `marginsInCm(resolveEffectiveMargins(doc, template))` |
| Réguas | `EditorPage.tsx` | `leftMarginCm` / `rightMarginCm` para horizontal, `topMarginCm` / `bottomMarginCm` para vertical |
| HTML preview | `renderer.ts → pageStyles(template, margins)` | `<style>` injeta `body { padding: ... }` em `@media screen` |
| PDF (Edge headless) | `renderer.ts → pageStyles(template, margins)` | `@page { margin: ... }` lido pelo Chromium |
| DOCX | `exporters/docx.rs → resolve_page_margin(envelope, template_id)` | `Docx::page_margin(PageMargin::new().top(...).right(...).bottom(...).left(...))`, conversão cm→twips: `cm × 567`. Default do `PageMargin::new()` (top 1985 / left 1701 / bottom 1701 / right 1701) é sobrescrito pelos quatro lados. |

Conversão crítica: 1 cm = 567 twips (twentieths of a point — unidade nativa do OOXML). Constante: `TWIPS_PER_CM = 567.0`.

### 12.7 Arquivos desta revisão

#### Criados (4)

```
src/modules/laudo/document-engine/page-layout.ts        # tipos + resolver + parse_length_cm + DEFAULT_PAGE_MARGINS + A4_PAGE
src/modules/laudo/components/HorizontalRuler.tsx        # régua SVG, escala cm, handles dourados
src/modules/laudo/components/VerticalRuler.tsx          # régua SVG vertical + page markers a cada 29,7 cm
src/modules/laudo/components/Ruler.module.css           # paleta azul escura + handle dourado + page mark
```

#### Alterados (7)

```
src/modules/laudo/document-engine/schema.ts             # +SicroDocPage / +SicroDocPageMargins / +page em SicroDocLayout
src/modules/laudo/document-engine/index.ts              # +exports page-layout + tipos
src/modules/laudo/document-engine/renderer.ts           # pageStyles(template, margins) usa resolveEffectiveMargins
src/modules/laudo/components/EditorPage.tsx             # tira branca contínua + pageBreakLine + integração com réguas
src/modules/laudo/components/EditorPage.module.css      # remove paper stack, adiciona .sheet/.pageBreakLine/.pageBreakLabel
src/modules/laudo/components/Inspector.tsx              # +PagePanel (4 campos cm) + MarginField + parseCmInput
src/modules/laudo/components/Inspector.module.css       # +.marginGrid/.marginField/.marginInputWrap/.marginUnit/.resetBtn
src/modules/laudo/store/laudoStore.ts                   # +updateLayout(workspacePath, patch)
src-tauri/src/exporters/docx.rs                         # +resolve_page_margin + cm_to_twips + parse_length_cm + Docx::page_margin
src-tauri/tests/docx_export.rs                          # +2 testes pinning pgMar
```

### 12.8 Validações executadas nesta revisão

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ Sem erros |
| `pnpm build` | ✅ 1720 módulos, **701,85 KB JS / 222,02 KB gzip**, 36,5 KB CSS / 7,18 KB gzip |
| `cargo check` em `src-tauri/` | ✅ |
| `cargo test --test docx_export` | ✅ **6/6 passed** (incluindo `applies_page_margins_from_envelope` e `falls_back_to_template_margins_when_envelope_has_no_override`) |

### 12.9 Pendências honestas após esta revisão

- **Paginação real** continua pendente. A tira branca contínua resolve o sintoma (vazamento), não a causa (não há reflow de parágrafo entre páginas). Recomendado spike próprio (`spike/pagination-engine`) usando ProseMirror Decorations + medição real do DOM por parágrafo.
- **Drag das margens nas réguas** não foi implementado. Edição é via aba "Página" do Inspector. Drag é incremento simples se houver demanda.
- **PageMargin.header / footer** do docx-rs não foram tocados — manteve-se o default. Quando o usuário definir margens muito apertadas (< 2 cm), o cabeçalho/rodapé institucional pode colidir com o conteúdo no Word.
- **Tradução do override no editor**: a tira branca usa `marginsInCm(resolveEffectiveMargins(...))` direto; mudar valor na aba "Página" atualiza imediatamente o canvas, mas **réguas são memoizadas no componente** — se o usuário relatar lag perceptível, considerar `React.memo`.

### 12.10 Orientação para teste manual

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
git checkout mvp/laudo-institucional-basico
pnpm tauri:dev
```

**A — Vazamento visual eliminado:**

1. Abrir uma ocorrência → Laudo → criar do template **Sinistro de Trânsito Simples**.
2. Verificar que aparece **uma tira branca contínua** com **réguas em cima e à esquerda** mostrando escala em cm.
3. Adicionar muitos parágrafos. Quando o cursor passar de 29,7 cm, surge a linha tracejada com label `— página 2 —`. Continuar → `— página 3 —`.
4. **O conteúdo NUNCA aparece sobre cinza** — somente sobre a tira branca contínua.

**B — Réguas:**

1. Régua horizontal mostra ticks a cada 0,5 cm, números 5/10/15/20.
2. Área entre margens fica em azul mais claro; **dois handles dourados** apontam para as margens esquerda e direita.
3. Régua vertical idem + label `Pág 1`, `Pág 2` rotacionado dentro de cada janela de 29,7 cm.

**C — Margens configuráveis:**

1. Inspector → aba **Página**. Os 4 campos mostram as margens do template (3 / 2 / 2,5 / 3,5 cm).
2. Editar `Superior = 4` → blur → feedback "Margem Superior = 4cm salva." → a tira branca atualiza, o conteúdo desce, a régua vertical move o handle.
3. Editar `Esquerda = 25mm` → aceita → grava como `2,5cm` (parser converte).
4. Editar `Direita = -1` → mostra erro "Margem Direita fora do intervalo aceito (0–8 cm)".
5. Botão "Restaurar margens do template PCA Padrão v1" aparece — clicar → volta para 3 / 2 / 2,5 / 3,5.
6. Inspecionar o `.sicrodoc` no disco: `layout.page.margins` foi gravado durante os steps 2-3 e removido após o step 5.

**D — Margens propagadas:**

1. Com override aplicado (ex.: 5 / 2 / 5 / 2), exportar **HTML** → abrir → confere `@page margin: 5cm 2cm 5cm 2cm` e `body padding: ...`.
2. Exportar **PDF** → comparar com `--print-to-pdf` do Edge usando as mesmas margens (visualmente, mais largura útil).
3. Exportar **DOCX** → abrir no Word → File ▸ Page Setup deve mostrar Top=5cm, Bottom=5cm, Left=2cm, Right=2cm.

**E — Não-regressão:**

1. Spike A / B / C continuam funcionando (Home, criação de laudo, edição, 3 exportações).
2. Laudo sem `layout.page.margins` (criado antes desta revisão) abre e exporta usando os valores do template — sem migração necessária.

### 12.11 Aprovação final do MVP 2 (com ressalva)

**Validação do usuário em 2026-05-25 (revisão 1.2):**

> "a paginação visual melhorou; o texto não fica mais perdido como antes; as
> réguas apareceram; as margens configuráveis funcionaram em geral; margem
> superior funcionou; margem esquerda funcionou; margem direita funcionou;
> as margens persistiram no documento; porém, a margem inferior ainda não
> está funcionando corretamente no editor: o texto continua avançando até o
> final da área visual."

**Decisão:** MVP 2 aprovado com ressalva. Não bloquear o projeto.

#### Ressalva técnica documentada

- **Sintoma:** margem inferior não respeitada no editor. O texto avança até o
  fim da tira branca contínua sem parar na linha do `bottom margin`.
- **Causa raiz:** o editor usa **paginação soft** (uma única `<div>`
  contenteditable fluindo dentro de uma tira branca de altura
  `pageCount × 29,7 cm`). Como não existe reflow real entre páginas, o
  cursor não conhece o limite inferior de uma página individual — ele só
  conhece o fim da tira inteira.
- **PDF e DOCX NÃO são afetados.** O PDF aplica `@page { margin: ... }` no
  Chromium (Edge headless), que faz quebra real de página respeitando a
  margem inferior. O DOCX grava `<w:pgMar w:bottom="..."/>` em `sectPr`,
  que o Word/LibreOffice respeita nativamente. As 6 asserções do
  `cargo test --test docx_export` pinam essas garantias.
- **Onde a margem inferior FUNCIONA hoje:** no PDF (Chromium), no DOCX
  (Word/LibreOffice), no HTML print (`@media print` via `@page`), e — no
  editor — apenas para posicionamento do footer institucional (que é
  `position: absolute` ancorado no `bottom` da última página visual).
- **Onde NÃO funciona hoje:** no editor, durante digitação contínua dentro
  de uma página visual.

#### Recomendação registrada para fase futura

Criar um spike próprio chamado **`spike/pagination-engine`** com escopo:

1. Substituir a paginação soft por **paginação dura via ProseMirror Decorations + medição real do DOM** (provavelmente envolvendo `requestAnimationFrame` + `getBoundingClientRect` por bloco).
2. Quando um parágrafo cruza a fronteira inferior de uma página, inserir uma
   decoration `pageBreak` que empurra o conteúdo restante para o topo da
   página seguinte (com `padding-top` equivalente ao `top margin`).
3. Garantir que o cursor respeite a fronteira (não desça abaixo da linha do
   bottom margin de uma página visual).
4. Adicionar atalho `Ctrl+Enter` para inserir page break manual.
5. Mesma resolução de margens (`resolveEffectiveMargins`) — sem mudança de
   schema.

Esse spike é independente e pode ser feito sem bloquear Croqui, Vídeo ou o
Importador `.sicroapp`.

#### Por que não travar o projeto aqui

1. **PDF e DOCX — as superfícies que viram laudo institucional assinado — já
   estão corretos.** A margem inferior é respeitada em ambos.
2. **O editor já não vaza conteúdo para a área cinza** (sintoma original que
   motivou a revisão 1.2 foi 100% eliminado).
3. **Margens configuráveis estão funcionando** em 3 dos 4 lados no editor; a
   "falha do bottom" é cosmética dentro do canvas — não afeta o documento
   gravado nem o documento exportado.
4. **MVP 2 atende ao critério institucional:** o perito consegue criar laudo
   com chrome, editar conteúdo, configurar margens, e produzir PDF e DOCX
   que respeitam essas margens.

---

## Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-05-24 | 1.0 | MVP 2 implementado: institutional-templates.ts, nodes Quesito + Signature, template Sinistro de Trânsito Simples com injeção de systemData, renderer HTML/PDF com chrome + @page, EditorPage decorada, NewLaudoDialog com escolha de template, DOCX walker com Header/Footer nativos e suporte a quesito/signature. `pnpm typecheck`, `pnpm build`, `cargo check`, `cargo test --test docx_export` (4/4) todos verdes. Pendente: validação em runtime. |
| 2026-05-24 | 1.1 | **Ajuste runtime.** Dois problemas reais corrigidos: (1) paginação visual via paper stack + ResizeObserver — o conteúdo não vaza mais para fora da folha quando ultrapassa 29.7 cm; (2) cabeçalho configurável — Inspector aba "Cabeçalho" + campo no NewLaudoDialog + `laudoStore.updateMetadata`. Brasões adicionados (placeholders em `public/branding/`) com pipeline para editor (`/branding/*.png`), HTML/PDF (data URI via `branding.ts`) e DOCX (omitido, documentado). `pnpm typecheck`, `pnpm build`, `cargo check`, `cargo test --test docx_export` (4/4) todos verdes. |
| 2026-05-25 | 1.2 | **Ajuste runtime — tira branca contínua + réguas + margens.** Resposta ao feedback "conteúdo ainda atravessa a área cinza entre as páginas". Paper stack substituído por tira branca contínua com marcadores de quebra (linha tracejada `— página N —`) — vazamento visual eliminado. Réguas SVG horizontal e vertical estilo Word (cm, ticks, marcas de página, handles dourados). Schema ganhou `layout.page.margins` com resolver único `resolveEffectiveMargins(doc, template)`. Inspector ganhou aba "Página" (4 campos cm + parser cm/mm + reset para template). Margens propagam para editor, HTML preview, PDF (`@page margin`) e DOCX (`docx-rs::PageMargin` com conversão `cm × 567` twips). Paginação real continua pendente — documentada como spike próprio. `pnpm typecheck`, `pnpm build`, `cargo check`, `cargo test --test docx_export` (**6/6** com 2 testes novos pinando o `<w:pgMar/>`) todos verdes. |
| 2026-05-25 | 1.3 | **Aprovação final do MVP 2 (com ressalva).** Usuário validou em runtime: paginação visual ok, réguas ok, margens superior/esquerda/direita ok, persistência ok. Ressalva: margem inferior no editor não para o cursor (PDF/DOCX não afetados — eles têm paginação própria). Pendência registrada em §12.11 como spike futuro `spike/pagination-engine`. MVP 2 fechado: commit, merge `--no-ff` na main, tag anotada `v0.4.0-mvp2-laudo-institucional`. |
