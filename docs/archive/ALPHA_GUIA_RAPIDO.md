# Guia Rápido — SICRO Desktop 2.0 Alpha

Versão: MVP 8 / Alpha-prep · Data: 2026-05-25.

> Este é um guia operacional curto para o perito que vai usar o SICRO
> Alpha em testes controlados. Não substitui um manual completo, nem
> a validação técnica final do laudo pelo profissional.

---

## 1. O que é o SICRO Alpha

O SICRO Desktop 2.0 é uma **suíte pericial integrada**. Cada
ocorrência vira um **workspace** (`.sicro/`) auto-contido na máquina,
com banco SQLite local, documentos, croquis, imagens, vídeos e
evidências dentro da mesma pasta.

A versão Alpha cobre:

- Importador `.sicroapp` (pacote vindo do SICRO Operacional);
- Dossiê estruturado;
- Editor de Laudo (TipTap, com inserção de evidências);
- Editor de Croqui Pericial (React-Konva);
- Editor de Vídeo (eventos + frames + storyboard);
- Editor de Imagem Pericial;
- Central de Evidências + Integridade;
- Backup do workspace;
- Relatório de saúde do sistema;
- Exportação HTML / PDF / DOCX do laudo.

A versão Alpha **não** substitui a análise humana do perito. Use em
workspaces de teste ou em ocorrências de baixo risco até a versão
Beta.

---

## 2. Criar ou abrir uma ocorrência

Na tela inicial:

- **Nova ocorrência**: cria um `.sicro/` vazio com manifesto +
  SQLite + diretórios padrão.
- **Abrir workspace…**: escolhe um `.sicro/` existente no disco.
- **Importar .sicroapp…**: traz um pacote do SICRO Operacional para
  dentro do SICRO Desktop.

Após abrir, a Home mostra o **AlphaDashboard** com o workspace ativo,
contadores e atalhos.

---

## 3. Importar do SICRO Operacional

1. Home → "Importar `.sicroapp`…".
2. Escolha o arquivo `.sicroapp`.
3. O importador valida o pacote (hashes), copia para o workspace e
   gera o Dossiê.
4. Confira o relatório de import (`Dossiê → aba Importação`).

---

## 4. Usar o Dossiê

Abas:
- **Resumo**: visão geral da ocorrência.
- **Fotos**: galeria.
- **Checklist**: itens técnicos respondidos no campo.
- **Entidades**: veículos / vítimas.
- **Vestígios / Medições / Observações / Linha do tempo**.
- **Importação**: status do `.sicroapp` (botão "Recarregar pacote").

---

## 5. Criar um laudo

1. Módulo Laudo → "Novo laudo".
2. Escolha o template (Documento Livre / Sinistro de Trânsito).
3. Edite o conteúdo no canvas A4.
4. Use o Inspector lateral (Validações / Estrutura / Evidências /
   Cabeçalho / Página / Dados) para configurar.
5. Insira evidências pelo painel **Evidências** do Inspector (aba
   com 6 sub-tabs).
6. Ctrl+S para salvar.

---

## 6. Usar o Croqui

1. Módulo Croqui → "Novo croqui".
2. Toolbar lateral com 9 grupos (Seleção / Referencial / Via /
   Veículos / Pessoas / Vestígios / Anotação / Imagem / Editar).
3. "Modelos…" no grupo Via insere um cruzamento ou via reta com 1
   clique.
4. Definir escala, adicionar veículos e R1/R2.
5. **Exportar PNG** com carimbo técnico (BO + escala + timestamp).

---

## 7. Usar o Vídeo

1. Módulo Vídeo → "Registrar vídeo" (cópia para o workspace + hash).
2. Adicione eventos com timestamp.
3. Colete frames via FFmpeg (botão "Coletar frame").
4. Use o storyboard para montar a sequência.

Requisitos: `ffmpeg` e `ffprobe` no PATH. A Home exibe alerta
quando estão ausentes.

---

## 8. Usar o Editor de Imagem

1. Módulo Imagem → "Nova análise".
2. Origem: foto do Dossiê, frame de vídeo ou arquivo local.
3. Anote (seta, retângulo, texto, marcador numerado, medida,
   tarja…).
4. Ajuste brilho/contraste/gamma/saturação.
5. Defina escala em metros.
6. **Exportar** → gera PNG derivado + sidecar JSON técnico.

O original NUNCA é modificado. O derivado fica em
`imagens/exports/`.

---

## 9. Inserir evidências no laudo

No editor de Laudo → painel direito → aba **Evidências** → escolha a
sub-aba (Fotos / Croquis / Vídeo / Dossiê / Tabelas) → botão
"Inserir".

Cada inserção:
- cria um node TipTap no `.sicrodoc` com atributos de procedência;
- grava uma linha em `evidence_links` (audit).

---

## 10. Exportar PDF

Toolbar do Laudo → "Exportar" → escolher PDF.

O SICRO renderiza HTML completo → headless Edge → PDF. Imagens reais
ficam embutidas via data URI.

DOCX também está disponível — **ressalva conhecida** (KNOWN_LIMITATIONS):
DOCX ainda exporta placeholder em vez de imagem real. Use PDF como
saída oficial.

---

## 11. Verificar integridade

Na Home → "Verificar integridade" abre a **Central de Evidências**.

- Aba Integridade → "Verificação leve" (sempre) e "Verificação
  profunda" (recompute SHA-256).
- Botão "Gerar relatório HTML" salva em
  `<workspace>/reports/workspace_integrity_<TS>.html`.

A verificação leve sinaliza:
- arquivo ausente;
- caminho inseguro;
- link quebrado em laudo.

---

## 12. Gerar backup

Na Home → "Gerar backup".

Produz `<workspace>/backups/backup_BO_<id>_<TS>.sicrobackup` — um
`.zip` contendo `manifest.json`, `sicro.sqlite`, todos os documentos,
imagens, vídeos, exports, sidecars + um manifesto de backup interno
(`_sicro_backup_manifest.json`). `cache/` e `logs/` são excluídos.

O SHA-256 do backup é registrado para audit.

---

## 13. Limitações conhecidas

Veja `KNOWN_LIMITATIONS.md` na raiz do repo para a lista completa.

Principais:
- DOCX com imagens reais ainda exporta placeholder;
- paginação do editor de laudo é soft (visualização aproximada);
- vídeo depende de codecs suportados pelo WebView + ffmpeg/ffprobe
  no PATH;
- Editor de Imagem ainda não tem FFT/Wavelets/CLAHE/autenticação
  profunda — operações geométricas (rotate/flip/crop/resize) existem
  no backend mas não na UI;
- Croqui ainda não tem OSM / correção de perspectiva;
- não há instalador final validado em múltiplas máquinas.

**Alpha não substitui validação humana do perito.**
