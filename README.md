# SICRO Desktop 2.0

Sistema Integrado de Criminalística e Operações — suíte pericial desktop
para o perito criminal. Geração de laudo, croqui de sinistro, análise
pericial de imagem, dossiê operacional e Central de Evidências em um
único workspace `.sicro` autocontido.

Versão atual: **`2.0.0-beta.0`** · Stack: **Tauri 2 + React 18 + TypeScript + Rust + SQLite**.

---

## Pré-requisitos

Instale uma vez, na máquina:

| Ferramenta | Versão mínima | Como instalar |
|---|---|---|
| Node.js | 20.x (recomendado 22+) | https://nodejs.org/ |
| pnpm | 9.x | `npm install -g pnpm` |
| Rust toolchain | stable 1.77+ | https://rustup.rs/ |
| Microsoft WebView2 | já vem no Windows 11 | https://developer.microsoft.com/en-us/microsoft-edge/webview2/ |
| Visual Studio Build Tools (Windows) | "Desktop development with C++" | https://visualstudio.microsoft.com/visual-cpp-build-tools/ |

Pré-requisitos completos do Tauri (Windows/Mac/Linux) em
https://tauri.app/start/prerequisites/.

---

## Instalação

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
pnpm install
```

A primeira compilação do backend Rust pode demorar alguns minutos — vai
baixar e compilar dependências como `tauri`, `rusqlite`, `image`, `docx-rs`.

## Rodar em modo desenvolvimento

```powershell
pnpm tauri:dev
```

Abre uma janela nativa do SICRO Desktop com hot reload no front-end.

## Build de produção

```powershell
pnpm tauri:build
```

Gera o instalador em `src-tauri/target/release/bundle/`.

## Validações

```powershell
pnpm typecheck     # type-check TS sem rodar
pnpm test          # vitest run (todos os testes do front)
cargo check        # type-check do backend (de dentro de src-tauri/)
cargo test         # testes do backend (de dentro de src-tauri/)
```

---

## Módulos

| Módulo | Descrição |
|---|---|
| **Home** | Lista de ocorrências recentes, Relatório de saúde do sistema, atalhos rápidos. |
| **Dossiê** | Workspace pericial — metadata da ocorrência, fotos importadas, anotações. |
| **Laudo** | Editor TipTap rico (A4, paginação real, header dinâmico, estilos, sumário, comentários, snapshots), templates institucionais, exportação PDF/DOCX/HTML, assinatura via SIGDOCS (institucional Amapá) ou gov.br. |
| **Croqui** | Editor Konva 2D com Road Engine "Python Parity" (paridade visual com SICRO 1.0), importação OSM (Overpass + Leaflet), importação de fotos de drone com correção de lente, exportação PNG técnica/limpa. |
| **Evidências** | Central de integridade — registry, verificador de hashes, detector de links quebrados, relatório técnico. |
| **Imagem** | Editor pericial — filtros, EXIF, histograma, processing stack, múltiplos hashes (MD5/SHA-1/SHA-256/SHA-3), correção de perspectiva 4-point, anotações, cadeia de custódia. |

Módulos roteados mas placeholder neste beta: Vídeo, Mídias, Estatísticas,
Configurações (planejados para releases posteriores).

---

## Estrutura

```
sicro-desktop/
├── docs/
│   ├── archive/                   # Relatórios históricos (Spike + MVP)
│   ├── sicro-laudo-auditoria.md
│   └── ...
├── src/                           # Frontend React + TypeScript
│   ├── app/                       # AppShell, ActivityRail, TopBar, StatusBar
│   ├── core/                      # commands, errors, formatters
│   ├── design-system/             # tokens.css, typography.css
│   ├── components/                # Button, Card, Dialog, StatusPill, EmptyState
│   ├── modules/                   # home / laudo / croqui / evidencias / imagem
│   ├── stores/                    # Zustand stores
│   └── types/                     # Tipos espelhando structs Rust
├── src-tauri/                     # Backend nativo Rust
│   ├── src/
│   │   ├── commands/              # Comandos expostos ao front (invoke)
│   │   ├── workspace/             # Workspace .sicro (criar, abrir, backup)
│   │   ├── database/              # SQLite + migrations + repositórios
│   │   ├── filesystem/            # Safe paths, atomic write
│   │   ├── exporters/             # HTML / PDF (Edge headless) / DOCX
│   │   ├── image_processing/      # Filtros, lens correction, EXIF, hashes
│   │   ├── evidence/              # Registry + integrity verifier
│   │   ├── models/                # Structs serializáveis
│   │   └── state/                 # App state (recents, paths)
│   ├── migrations/                # SQL migrations versionadas
│   ├── Cargo.toml
│   └── tauri.conf.json
├── KNOWN_LIMITATIONS.md           # Limitações conhecidas do release
├── package.json
└── README.md
```

---

## Convenções

- **Domínio em português** (`ocorrencia`, `laudo`, `croqui`, `vestigio`) — termos periciais sem equivalente direto em inglês.
- **Código de infraestrutura em inglês** (variáveis, funções utilitárias, comandos).
- **Commits em inglês** seguindo Conventional Commits (`feat(laudo): ...`, `fix(croqui): ...`).
- **Documentação técnica em português**.

## Histórico de desenvolvimento

Relatórios técnicos do período Spike/MVP (Alpha-prep) ficam preservados em
`docs/archive/` como referência histórica. Ver `docs/archive/README.md`
para o índice.

## Licença

A definir.
