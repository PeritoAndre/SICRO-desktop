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
| **Home** | Central operacional: card do **workspace ativo**, ações rápidas (nova / abrir / importar / verificar integridade / backup), atalhos para os módulos da ocorrência, ocorrências recentes e avisos do sistema. |
| **Dossiê** | Workspace pericial — metadata da ocorrência, fotos importadas, anotações. |
| **Laudo** | Editor TipTap rico (A4, paginação real, header dinâmico, estilos, sumário, comentários, snapshots), templates institucionais, exportação PDF/DOCX/HTML, assinatura via SIGDOCS (institucional Amapá) ou gov.br. |
| **Croqui** | Editor Konva 2D com Road Engine compatível com o estilo visual do SICRO 1.0, importação OSM (Overpass + Leaflet), importação de fotos de drone com correção de lente, exportação PNG técnica/limpa. |
| **Evidências** | Central de integridade — registry, verificador de hashes, detector de links quebrados, relatório técnico. |
| **Imagem** | Editor pericial repaginado por intenção — **trilha de ferramentas com flyout**, painel em modos **Realçar / Filtros / Analisar / Anotar**, **galeria de ~32 filtros forenses** buscável e explicada (Sobel, CLAHE, ELA, DStretch, DoG…), ajustes não-destrutivos (brilho/contraste/gama/saturação/**matiz**/**canais R-G-B**), **zoom nível pixel (até 64×)**, **paleta de comandos ⌘K**, réguas que seguem o mouse, EXIF, histograma, múltiplos hashes (MD5/SHA-1/SHA-256/SHA-3), correção de perspectiva 4-point, anotações/medições e cadeia de custódia. Tudo §13: realça/mede, nunca fabrica; o original nunca é alterado. |
| **Áudio** | Aquisição com custódia (importar / extrair de vídeo, original + WAV de análise hasheados) e detalhe organizado em abas: **Realçar** (filtros de escuta não-destrutivos), **Analisar** (espectrograma + medições objetivas: pico/RMS/clipping, espectro FFT, ENF para indício de splice), **Trechos** (recorte A-B + compilação rotulada) e **Ficha** (metadados, hashes, custódia). Degravação manual + rascunho por IA local (whisper.cpp). |
| **Configurações** | Preferências globais do app (fora do `.sicro`): perfil do perito, instituição/marca, aparência (tema/cor), integrações (SIGDOC), caminhos padrão, IA & OCR, atalhos e **Backup geral** — cópia incremental de todos os casos do acervo. |

Módulos roteados mas ainda enxutos neste beta: Vídeo, Mídias, Estatísticas
(planejados para releases posteriores).

---

## Backup e recuperação (DR)

O SICRO trabalha **offline e local**. A regra de ouro: **dados vivos ficam
locais; a nuvem recebe BACKUPS**. Um `.sicro`/SQLite "vivo" dentro de uma pasta
sincronizada (OneDrive/Dropbox/Drive) pode corromper — o serviço de sync mexe
nos arquivos no meio das escritas. Por isso a pasta padrão de casos é
**`~\SICRO\Casos`** (local) e o app **avisa** se você apontar um caso para uma
pasta sincronizada. A redundância em nuvem é feita por **backup estático**, que
o sync transfere com segurança. O original nunca é alterado (§13).

- **Por caso** (`.sicrobackup`): no card do *workspace ativo* na Home, gera um
  ZIP do `.sicro` inteiro com manifesto interno + SHA-256. Ignora `cache/` e
  `logs/`.
- **Geral** (Configurações → **Backup geral**): copia **todas as ocorrências**
  do acervo para uma pasta de destino (HD externo, pendrive, **nuvem**, rede),
  num **conjunto v2**:

  ```
  <destino>/
    sicro-backup-index.json
    config/app-settings.json     ← perfil, instituição, cabeçalhos
    casos/<caso>.sicrobackup     ← 1 por caso (completo: fotos/vídeos/drone)
  ```

  É **incremental** — só recopia os casos que mudaram desde o último backup
  (compara um *fingerprint* de caminho/tamanho/data). Casos não encontrados (HD
  desconectado / movido) são reportados sem apagar o backup anterior.
- **Auto-backup ao fechar a ocorrência**: opção no card do Backup geral
  (ligada por padrão quando há um destino). Ao sair/trocar de ocorrência, dispara
  o backup geral incremental para o destino — mantém a cópia fresca sozinho.
- **Restaurar backup** (Configurações → **Backup geral → Restaurar backup**):
  aponta a pasta de backup (de qualquer origem) e o app recria os casos na pasta
  local + restaura o **perfil/cabeçalhos** (config) + reindexa os recentes.
  Cenário "PC pifou/trocou → instala o SICRO → restaura → tudo de volta". Não
  sobrescreve casos que já existam no destino.

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

Apache License 2.0 — ver [`LICENSE`](./LICENSE).

Copyright © 2026 André Ricardo Barroso

Você é livre pra usar, copiar, modificar, redistribuir e até vender o
SICRO Desktop, desde que mantenha o aviso de copyright e a licença
junto. A licença inclui **concessão expressa de patentes** entre
contribuidores e usuários, com cláusula de represália defensiva contra
processos de patente.
