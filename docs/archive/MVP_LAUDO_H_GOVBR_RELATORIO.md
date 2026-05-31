# Laudo — H — Integração gov.br externa

> Pediu o usuário em **2026-05-27**:
> _"vamos com o fluxo do govbr externo, seria legal salvar o pdf
> assinado dentro do SICRO, e quando exibisse a ocorrência na parte
> de laudo, tivesse um identificador que aquele laudo esta assinado
> já digitalmente com o govbr"_.
>
> **Status: ✅ Pronto para revisão.**
>
> `cargo check`: ✓ · `cargo test --lib`: ✓ 123 testes · `pnpm
> typecheck`: ✓ · `vitest`: ✓ 974 testes · `vite build`: ✓ 5.13s

---

## Contexto

Fluxo atual (pré-SICRO):

```
Word → exportar PDF → abrir SIGDOCs → upload → assinar → download → arquivar
```

Fluxo novo (depois do H), substitui SIGDOCs por gov.br nativo:

```
SICRO (laudo aberto) → "Assinar com gov.br" → exporta PDF + abre portal
       → perito assina no portal (login gov.br + 2FA)
       → "Importar PDF assinado" → SICRO arquiva em laudos/<id>/assinados/
       → badge "Assinado gov.br" aparece na lista da ocorrência
```

Tudo num único app, sem hop pro SIGDOCs.

---

## Decisão arquitetural: por que Caminho A (external) e não API

A API direta do ITI (`api.assinador.iti.gov.br`) exige cadastro
institucional da Polícia Científica do Amapá no `sso.acesso.gov.br` —
processo administrativo de semanas com Convênio formalizado. Para a
**demonstração à direção** o caminho mais rápido é usar o portal
público `assinador.iti.gov.br`, que:

- É gratuito e oficial.
- Usa o mesmo login gov.br do perito (selo prata/ouro).
- Gera PADES juridicamente válido (Lei 14.063/2020).
- Não exige código de aplicação cadastrada.

Quando o cadastro institucional sair, é só trocar o "open browser +
upload manual" por OAuth2 + chamada à API. **O schema e a UI já estão
prontos para essa migração** — só muda o módulo de comunicação.

---

## O que foi implementado (6 sub-features)

### H1 — Schema aditivo

`SicroDocSignature` agora aceita `type: "gov_br"` (além dos
`"A1" | "A3" | "mock"` que já existiam). Quatro campos opcionais
novos, exclusivos do fluxo gov.br:

```ts
gov_br_signed_pdf_path?: string;     // ex: laudos/abc/assinados/...
gov_br_verification_url?: string;    // https://validar.iti.gov.br/
gov_br_signed_pdf_hash?: string;     // SHA-256 do PDF assinado
gov_br_signed_pdf_size?: number;     // bytes
```

100% aditivo — laudos antigos continuam abrindo, sem migração.

### H2 — Plugins Tauri (shell + clipboard)

Dois plugins novos para o fluxo:
- `tauri-plugin-shell` (`open`): abre URL no browser default do SO.
- `tauri-plugin-clipboard-manager` (`writeText`): copia o caminho do
  PDF gerado pro clipboard, pra o perito colar no upload do portal.

Permissions adicionadas em `capabilities/default.json`:
`shell:allow-open`, `clipboard-manager:allow-write-text`,
`clipboard-manager:allow-read-text`.

NPM packages: `@tauri-apps/plugin-shell` + `@tauri-apps/plugin-clipboard-manager`.

### H3 — Command `import_signed_pdf`

Backend Rust valida e arquiva o PDF assinado dentro do workspace:

```rust
pub async fn import_signed_pdf(
    workspace_path: String,
    input: ImportSignedPdfInput,  // laudo_id, source_absolute_path, preferred_filename
) -> Result<ImportSignedPdfResult>  // { relative_path, sha256, size_bytes }
```

Validações:
- Arquivo source existe.
- Header `%PDF-` nos primeiros 5 bytes (sanity check de PDF).
- Laudo existe no banco (não cria pasta órfã).
- Filename é sanitizado (sem `../`, caracteres especiais → `_`).

Destino: `laudos/<laudo-id>/assinados/<filename>.pdf` (relativo ao
workspace). Grava com `atomic_write_bytes`. SHA-256 recomputado após
grava para chain of custody.

### H4 — UI: tab gov.br no `DigitalSignatureDialog`

Três tabs no dialog, **gov.br vira o default** (badge verde
"recomendado"). Para gov.br, layout em **3 steps numerados**:

1. **"Exportar PDF e abrir gov.br"** — chama o callback
   `onExportPdfForSigning` do componente pai (StatusPanel) que invoca
   `commands.exportLaudoPdf`. Devolve o caminho relativo + absoluto.
   O dialog copia o caminho pro clipboard via
   `tauri-plugin-clipboard-manager.writeText` e abre
   `https://assinador.iti.gov.br/` via `tauri-plugin-shell.open`.

2. **"Assinar no portal do gov.br"** — instrução visual (sub-lista):
   login, selecionar arquivo (paste do clipboard), 2FA, baixar.
   Botão "Abrir portal novamente" caso o user feche.

3. **"Importar PDF assinado"** — file picker via
   `@tauri-apps/plugin-dialog.open()` com filtro `*.pdf`. User
   escolhe o arquivo baixado. Backend valida + arquiva. Dialog
   compõe o `SicroDocSignature` com `type: "gov_br"` + metadados
   retornados e chama `onSigned()`, que via `setStatus` persiste no
   `.sicrodoc`.

A11y: tabs com `role="tab"` + `aria-selected`, dialog com
`role="dialog"`/`aria-modal="true"`, esc fecha.

Aviso amarelo "Modo demonstração" continua aparecendo só em A1/A3
(eles ainda são mock). gov.br não é mock — é assinatura real do ITI.

### H5 — Badge "Assinado gov.br" na lista de laudos

Componente novo `SignatureBadge`:
- `type === "gov_br"` → verde, "Assinado gov.br" + ícone shield.
- `type === "A1" | "A3"` → azul, "Assinado A1/A3".
- `type === "mock"` → cinza, "Mock".

Aparece ao lado do `StatusPill` em cada card da `LaudoListView`.

Backend `list_laudos` agora **lê cada `.sicrodoc` em best-effort**
após buscar do banco, extrai `finalization.signature.type` e popula o
campo `signature_type` da struct `Laudo`. Falhas silenciosas (arquivo
ilegível, JSON inválido) — o card simplesmente não recebe badge.

Performance: ~50 laudos = ~50 file reads em strings JSON pequenas
(20-50 KB cada). Custo desprezível na list.

### H6 — Validações

```
cargo check    → ✓
cargo test     → 123 passed
pnpm typecheck → ✓
pnpm test      → 974 passed (47 files)
pnpm build     → ✓ 5.13s
```

Bundle: zero impacto significativo. Os 2 plugins Tauri novos
adicionam ~5 KB ao bundle JS frontend.

---

## Fluxo completo (passo a passo do perito)

1. Perito finaliza um laudo (`status = "final"`, hash SHA-256
   computado).
2. Painel direito **Status** mostra card de finalização + botão
   **"Assinar digitalmente (A3/A1)"**.
3. Clica → dialog abre com **tab gov.br** selecionada por default.
4. Clica **"Exportar PDF e abrir gov.br"**:
   - SICRO gera o PDF do laudo (renderer institucional completo:
     cabeçalho, brasões, "Página N de M", QR de verificação se
     finalizado).
   - PDF vai pra `laudos/exports/...`.
   - Caminho absoluto vai pro clipboard.
   - Browser do SO abre `https://assinador.iti.gov.br/`.
5. Perito faz login gov.br no portal (selo prata/ouro), faz upload
   do PDF (cola caminho), 2FA, baixa o assinado.
6. Volta ao SICRO, clica **"Importar PDF assinado"**:
   - File picker abre (filtro `*.pdf`).
   - Seleciona o arquivo baixado.
   - Backend valida `%PDF-`, grava em
     `laudos/<id>/assinados/<filename>.pdf`, hash + size.
   - Frontend persiste `finalization.signature = { type: "gov_br",
     gov_br_signed_pdf_path, gov_br_signed_pdf_hash, ... }`.
   - Dialog fecha.
7. Volta pra lista de laudos da ocorrência: card agora mostra
   badge verde **"✓ Assinado gov.br"**.

---

## Arquivos modificados

```
Backend Rust:
├── Cargo.toml                                  [+] 2 plugins Tauri
├── src/lib.rs                                  [edit] register plugins + command
├── src/models/laudo.rs                         [edit] +signature_type field
├── src/database/repositories/laudo_repo.rs     [edit] default signature_type: None
├── src/commands/laudo_commands.rs              [edit]
│     - new: import_signed_pdf command
│     - edit: list_laudos popula signature_type via leitura .sicrodoc
└── capabilities/default.json                   [edit] +shell/clipboard perms

Frontend TS:
├── src/types/laudo.ts                          [edit] +signature_type
├── src/core/commands.ts                        [edit] +importSignedPdf wrapper
├── src/modules/laudo/document-engine/schema.ts [edit] SicroDocSignature aceita gov_br + campos
├── src/modules/laudo/components/
│     DigitalSignatureDialog.tsx                [rewrite] +tab gov_br com 3 steps
│     DigitalSignatureDialog.module.css         [edit] +estilos dos steps
│     SignatureBadge.tsx                        [new] componente badge
│     SignatureBadge.module.css                 [new]
│     StatusPanel.tsx                           [edit] passa workspacePath, laudoId,
│                                                       onExportPdfForSigning
└── src/modules/laudo/views/LaudoListView.tsx   [edit] renderiza SignatureBadge

package.json:
+ @tauri-apps/plugin-shell ^2.3.5
+ @tauri-apps/plugin-clipboard-manager ^2.3.2

src-tauri/Cargo.toml:
+ tauri-plugin-shell = "2"
+ tauri-plugin-clipboard-manager = "2"
```

---

## Notas pra demonstração à direção

**Pontos a destacar:**

1. **Substituição direta do SIGDOCs** — o perito vai do laudo
   pronto para o PDF assinado sem sair do SICRO em 4 cliques.
2. **Mesma assinatura jurídica** — PADES do ITI tem validade legal
   plena (Lei 14.063/2020 art. 4º — assinatura eletrônica avançada).
3. **Arquivamento automático** — o PDF assinado vai pro workspace
   junto com o `.sicrodoc`. Backup do workspace (MVP 8) já leva
   tudo junto.
4. **Auditoria** — o `finalization.signature` registra:
   timestamp, hash do conteúdo, hash do PDF assinado, identidade,
   URL do validador ITI. Tudo verificável por terceiros.
5. **Próxima evolução** — quando a Polícia Científica cadastrar o
   SICRO como aplicação no `sso.acesso.gov.br`, troco o "open
   browser" por OAuth2 nativo. UI vira **1 clique** ao invés de 4.
   **Sem mudar schema, sem mudar relatório.**

**Roadmap institucional (para a direção pedir):**

1. Solicitar cadastro do SICRO como aplicação no `sso.acesso.gov.br`
   (formulário em https://acesso.gov.br/).
2. Após aprovação do ITI (15-30 dias), receber `client_id` +
   `client_secret`.
3. Configurar `.env` do SICRO com as credenciais (não vai pro git).
4. Atualizar o módulo de assinatura — backend Rust com `oauth2` +
   `reqwest`, sem mudança de UX visível pro perito (continua
   "Assinar com gov.br", só fica 1-click).

---

## Roadmap pós-H (sugestões)

1. **DOCX assinado também**: a API gov.br aceita só PDF. Para DOCX,
   o caminho é exportar PDF como intermediário.
2. **Assinatura múltipla** (revisor + perito): permitir mais de um
   `signature` no laudo, ordenadas. Implica array em
   `finalization.signatures: SicroDocSignature[]`.
3. **Verificação automática do PDF assinado**: chamar a API
   `validar.iti.gov.br` periodicamente para confirmar que a
   assinatura continua válida (cert do ITI não foi revogado).
4. **Integração SIGDOCs paralela**: se o SIGDOCs tiver API REST,
   adicionar `type: "sigdocs"` no schema e fluxo via API. Coexiste
   com gov.br.

---

## Resumo executivo

**6 sub-features H** fechadas. Fluxo gov.br externo funcionando.
Schema 100% aditivo. Demonstrável para a direção sem dependência
de cadastro institucional. Quando o cadastro sair, é só trocar o
módulo de comunicação — schema/UI permanecem.

Zero quebras: 974 testes vitest ✓, 123 testes cargo ✓, typecheck
✓, build ✓.

Pronto pra você apresentar.
