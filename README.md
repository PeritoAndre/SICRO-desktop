# SICRO Desktop 2.0

Sistema Integrado de Criminalística e Operações — suíte pericial desktop.

Stack: **Tauri 2 + React 18 + TypeScript + Rust + SQLite**.

> Este repositório está na fase **Spike A — Tauri Foundation**.
> Ver [`SPIKE_A_RELATORIO.md`](./SPIKE_A_RELATORIO.md) para o relatório técnico.

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

Pré-requisitos do Tauri (Windows/Mac/Linux) detalhados em https://tauri.app/start/prerequisites/.

---

## Instalação

```powershell
cd "C:\SICRO 2.0\sicro-desktop"
pnpm install
```

A primeira compilação do backend Rust pode demorar (vai baixar e compilar dependências como `tauri`, `rusqlite`, `uuid`, etc.).

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

## Type-check sem rodar

```powershell
pnpm typecheck
```

---

## Estrutura

```
sicro-desktop/
├── docs/                          # Documentos oficiais do projeto (PDF + MD)
├── src/                           # Frontend React + TypeScript
│   ├── app/                       # AppShell, ActivityRail, TopBar, StatusBar
│   ├── core/                      # commands, errors, formatters
│   ├── design-system/             # tokens.css, typography.css
│   ├── components/                # Button, Card, Dialog, StatusPill, EmptyState
│   ├── modules/                   # home/ + placeholders dos demais módulos
│   ├── stores/                    # Zustand stores
│   └── types/                     # Tipos espelhando structs Rust
├── src-tauri/                     # Backend nativo Rust
│   ├── src/
│   │   ├── commands/              # Comandos expostos ao front (invoke)
│   │   ├── workspace/             # Criação/abertura de workspace .sicro
│   │   ├── database/              # Conexão SQLite + migrations + repositórios
│   │   ├── filesystem/            # Safe paths, atomic write
│   │   ├── hashing/               # SHA256 (placeholder para spikes futuros)
│   │   ├── models/                # Structs serializáveis
│   │   └── state/                 # App state (recents, paths)
│   ├── migrations/                # SQL migrations versionadas
│   ├── icons/                     # Ícones do app
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

---

## O que existe no Spike A

- Shell da aplicação (Activity Rail + Top Bar + Status Bar).
- Tela Home com lista de ocorrências recentes e botão "Nova ocorrência".
- Criação de workspace `.sicro` em disco (pasta autocontida).
- Geração de `manifest.json` por workspace.
- Banco `sicro.sqlite` com migrations iniciais.
- Persistência da ocorrência em SQLite.
- Lista global de ocorrências recentes (JSON em `%APPDATA%/SICRO/recent.json`).
- Reabertura de ocorrência salva.
- Navegação entre módulos (com placeholders para tudo exceto Home).

## O que NÃO existe no Spike A (intencional)

- Editor de Laudo → Spike B.
- Croqui → Spike E.
- Vídeo → Spike F.
- Exportação PDF/DOCX → Spike C.
- Importação `.sicroapp` → Spike D.
- Auditoria detalhada além de schema mínimo.
- Jobs em background.
- Busca FTS5.

---

## Convenções

- **Domínio em português** (`ocorrencia`, `laudo`, `croqui`, `vestigio`) — termos periciais sem equivalente direto em inglês.
- **Código de infraestrutura em inglês** (variáveis, funções utilitárias, comandos).
- **Commits em inglês** seguindo Conventional Commits (`feat(workspace): ...`, `spike(...): ...`).
- **Documentação técnica em português**.

## Licença

A definir.
