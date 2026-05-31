# Histórico de desenvolvimento

Esta pasta concentra os relatórios técnicos do **período Spike/MVP**
(Alpha-prep, 2025–início de 2026) do SICRO 2.0. Os arquivos aqui dentro
ficam preservados como referência histórica — descrevem **como** cada
módulo chegou ao estado atual, decisões de arquitetura abandonadas,
spikes técnicos, bugs investigados.

Eles **não fazem parte da documentação do produto** e não precisam ser
lidos para usar, manter ou estender o SICRO. A documentação viva mora
em:

- `README.md` (raiz do repositório) — instalação, build, dev loop.
- `KNOWN_LIMITATIONS.md` (raiz) — limitações conhecidas do release.
- `docs/sicro-laudo-auditoria.md` — visão geral do módulo Laudo.

## Quando consultar

Procure aqui apenas quando precisar entender o **histórico** de uma
escolha técnica não-óbvia. Os relatórios seguem a convenção:

| Prefixo | Período | Conteúdo |
|---|---|---|
| `SPIKE_A`…`SPIKE_F` | Fundação (2025) | Tauri shell, Laudo, Croqui, Vídeo |
| `MVP2`…`MVP10` | Build-out modular | Cada módulo + recursos institucionais |
| `MVP_LAUDO_*` | Onda Laudo (TipTap maturity) | F12 batch, gov.br, SIGDOCS |
| `MVP_IMAGEM_G12_*` | Image Engine Pro | Filtros, EXIF, cadeia de custódia |
| `ROAD_ENGINE_*` | Itinerário Croqui | Roads v1 → v2 → Python Parity |
| `ROAD_RENDER_TECH_SPIKE` | Spike H | Comparativo Konva vs SVG vs paridade |
| `SICRO_LAUDO_HEADER_*` | N* — Header dinâmico | Editor TipTap no cabeçalho |
| `ALPHA_*` | Pré-Alpha | Checklist e guia rápido do release Alpha |

A versão atual do produto (`2.0.0-beta.0`) já contém todas as features
discutidas nesses relatórios. Eles servem apenas como **trilha de auditoria**.
