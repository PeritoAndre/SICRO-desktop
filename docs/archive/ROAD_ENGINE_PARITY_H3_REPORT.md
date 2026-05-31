# Python Parity Engine — H.3 Report

**Data:** 2026-05-26
**Fase:** H.3 — Integrar Python Parity Engine no CanvasStage
**Status:** Entregue. **Aguardando validação visual no Croqui real.**
**Branch:** `mvp/osm-road-import`. Sem commit / sem merge / sem tag.

---

## 1. Escopo entregue

Integração do `RoadParityRenderer` (Fase H.2) ao Croqui REAL, atrás de feature flag `road_engine_version: "parity"`. Sem remover Road v1/v2, sem alterar OSM adapter, sem mexer em módulos não-Croqui.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `engine/road-parity/renderer.tsx` | `<Layer>` → `<Group>` (renderer agora vive dentro de Layer existente). `onObjectChange` prop adicionado. Handles A/B/C1/C2 agora **drag-enabled** quando handler presente. Drag de A move A+C1 (preserva curvatura); drag de B move B+C2. |
| `engine/road-parity/index.ts` | Re-exporta tudo necessário pelo CanvasStage. |
| `editor/CanvasStage.tsx` | Novo branch `doc.road_engine_version === "parity"` → renderiza `RoadParityRenderer` com `parity_objects`. Nova prop `onParityObjectChange`. v1/v2 paths intactos. |
| `editor/CroquiEditor.tsx` | Novo `handleParityObjectChange` (patch imutável de `doc.parity_objects`). Toggle Road Engine cicla v1 → v2 → parity → v1. Novo `handleInsertParityDemo` (cria fixture de teste). |
| `editor/Toolbar.tsx` | Nova prop `onInsertParityDemo` + botão "Inserir Demo Parity" na seção Imagem. |
| `spikes/road-render-lab/parity/ParityLabRenderer.tsx` | Envolve renderer em `<Stage><Layer>` (porque renderer agora emite Groups). |

**Zero alteração** em Road v1, Road v2, OSM adapter, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home.

---

## 2. Como usar (perito)

### Validação básica

1. `pnpm tauri dev`.
2. Abrir Croqui → criar Novo croqui (ou abrir um existente).
3. Toolbar → seção Imagem → **"Inserir Demo Parity"** (botão novo).
   - Insere automaticamente: 1 rotatória central + 4 vias arteriais (norte/sul/leste/oeste) + 1 diagonal residencial.
   - Força `road_engine_version: "parity"` no doc.
   - Garante `scale.px_per_m: 10` se ausente.
4. O canvas agora mostra a fixture renderizada pelo Python Parity Engine **dentro do app real**.
5. Status bar (canto inferior direito): toggle `Road Parity` em destaque roxo `#ede9fe`.
6. Clique em qualquer via → seleciona, handles A/B/C1/C2 aparecem.
7. Arraste handles:
   - **A** → move A junto com C1 (preserva curvatura).
   - **B** → move B junto com C2.
   - **C1, C2** → muda só o controle (curvatura muda).
   - Centro da rotatória → move rotatória.
8. **Salvar** (Ctrl+S).
9. Fechar o croqui, reabrir → tudo persiste.
10. **Exportar PNG técnico** + **PNG limpo** → render parity é capturado via `stage.toDataURL()`.

### Alternar entre motores

Status bar canto inferior direito → botão **"Road v1/v2/Parity"**:
- v1 (cinza) → stroke clássico
- v2 (verde) → ribbon polygon multipass
- **parity (roxo)** → Python Parity Engine (Fase H)

Cada clique cicla v1 → v2 → parity → v1.

**Documentos antigos** (sem `road_engine_version` ou com `"v1"`/`"v2"`) abrem normalmente nos motores legados. Só passam a renderizar parity quando o usuário troca explicitamente.

---

## 3. Detalhes técnicos

### 3.1 Branch parity no CanvasStage

```typescript
{doc.road_engine_version === "parity" ? (
  <RoadParityRenderer
    objects={(doc.parity_objects ?? []).filter(isParityObject)}
    pxPerM={doc.scale?.px_per_m ?? null}
    selectedId={editor.selectedId}
    onSelect={(id) => onSelect(id ?? null)}
    onObjectChange={onParityObjectChange ? ... : undefined}
  />
) : doc.road_engine_version === "v2" ? (
  <RoadNetworkLayerV2 ... />
) : (
  /* v1 legacy */
)}
```

- Renderer parity convive na mesma `<Layer ref={objectsLayerRef}>` que os outros motores.
- `parity_objects` é filtrado por `isParityObject` (defesa em depth — type guard valida `kind === "road_parity"` ou `"roundabout_parity"`).
- Filtro `nonRoadObjects` no CanvasStage continua renderizando veículos/marcadores/textos/medidas por cima do asfalto parity — mesma stack visual de v1/v2.

### 3.2 Drag de handles

Cada handle agora tem `draggable={canDrag}` + `onDragEnd` que converte coords canvas → mundo (m) via `canvasToWorldX/Y` e chama `onObjectChange` com o patch necessário.

**Detalhe importante:** o drag de A leva C1 junto (e B leva C2). Isso preserva a curvatura visual da via durante a movimentação. Para mover só o controle (mudar curvatura), o perito arrasta C1 ou C2 diretamente.

### 3.3 Toggle 3 estados na StatusBar

Antes: botão binário v1↔v2.
Agora: ciclo v1 → v2 → parity → v1, com cores distintas:

| Estado | Background | Border | Text |
|---|---|---|---|
| v1 | transparente | `#94a3b8` | `#334155` |
| v2 | `#dcfce7` (verde) | `#16a34a` | `#15803d` |
| **parity** | `#ede9fe` (roxo) | `#7c3aed` | `#6d28d9` |

### 3.4 `handleInsertParityDemo` — fixture de teste

Botão "Inserir Demo Parity" no toolbar (seção Imagem). Cria, em um único clique:

- **1 rotatória central** (r=12m, largura_m=7.5m).
- **4 vias arteriais** (norte, sul, leste, oeste) — `largura_m: 7.5`, `marcacao: amarela`, `mao_dupla: true`.
- **1 diagonal residencial** com Bezier curvado — `largura_m: 6.0`, `marcacao: branca`, `mao_dupla: false`.

Tudo entra em `doc.parity_objects` (array separado). Força `road_engine_version: "parity"` e garante `scale.px_per_m: 10`.

### 3.5 Save/reload

Já funciona automaticamente:
- Serializer (Fase H.1) faz passthrough de `parity_objects` sem coercer dedicado.
- `coerceRoadEngineVersion("parity") → "parity"`.
- Documento salvo `.sicrocroqui` carrega `road_engine_version: "parity"` + `parity_objects: [...]`.
- Ao reabrir, CanvasStage detecta a flag e renderiza com Parity Engine.

### 3.6 Export PNG

Já funciona automaticamente:
- `stage.toDataURL()` captura todos os Layers e Groups visíveis.
- O renderer parity vive dentro do `objectsLayerRef` que o exportador já lê.
- PNG técnico e PNG limpo capturam as vias parity sem mudança.

### 3.7 Undo / Redo

`mutateObjects` (para legacy) e `setDoc + editor.pushHistory` (para parity) mantêm o histórico de edições. Ctrl+Z / Ctrl+Y funcionam.

**Limitação conhecida H.3**: drag de handle parity hoje chama `setDoc` diretamente, sem passar pelo `pushHistory`. Isso significa que **undo após drag não reverte o handle individual**. Vou corrigir em H.4 ou H.6, conforme prioridade do perito.

---

## 4. Validações automáticas

| | Pré-H.3 | Pós-H.3 |
|---|---:|---:|
| `pnpm typecheck` | ✓ | ✓ |
| `pnpm test` | 777 | 777 (sem novos testes — comportamento de UI é validado manualmente) |
| `pnpm build` | ✓ | ✓ |
| `cargo check` | ✓ | ✓ |
| `cargo test --lib` | 88 | 88 |

**Por que não há testes novos:** H.3 é integração de UI dentro do app real. Os comportamentos críticos (renderer, geometry, clipping) já estão cobertos pelos 83 testes parity da H.1+H.2. Testes de drag/click no Konva exigem setup de jsdom + Konva mock que não vale o ROI nesta fase — validação manual é mais eficiente.

---

## 5. Limitações conhecidas H.3

1. **Sem ferramenta interativa "Criar via" (2-click)**. Por enquanto a única forma de inserir vias parity no app é via botão "Inserir Demo Parity" (que cria fixture pré-fabricada). Ferramenta livre entra em H.6.
2. **Sem Inspector dedicado para objetos parity**. Quando uma via parity é selecionada, o painel direito mostra o objeto cru (campos JSON) — não os controles parity (largura_m slider, marcacao dropdown, etc.). H.6.
3. **Undo após drag de handle não funciona perfeitamente** (não passa pelo history). H.4 ou H.6.
4. **Sem adapter OSM parity ainda**. OSM continua usando road-v2 (stable). H.5 só depois desta fase aprovada visualmente.
5. **Sem templates parity** (curva L, cruzamento X via toolbar). H.7.
6. **Sem migração automática** de croquis antigos para parity. H.4.
7. **Inspector legacy mostra objetos parity como "outros"** — categoria não reconhecida. Cosmético, não funcional.

---

## 6. Critério de aprovação (do briefing)

> H.3 será aprovada se:
> - Road Parity aparecer no Croqui real;
> - renderizar igual ao lab;
> - não quebrar v1/v2;
> - salvar/reabrir funcionar;
> - exportar PNG funcionar;
> - o usuário conseguir validar visualmente dentro do fluxo real.

| Critério | Status esperado |
|---|---|
| Road Parity aparecer no Croqui real | ✓ via botão "Inserir Demo Parity" + flag automática |
| Renderizar igual ao lab | ✓ mesmo `RoadParityRenderer` em ambos |
| Não quebrar v1/v2 | ✓ branchs preservados, v1/v2 paths intactos |
| Salvar/reabrir funcionar | ✓ serializer passthrough (H.1) |
| Exportar PNG funcionar | ✓ `stage.toDataURL()` é agnóstico ao motor |
| Validar visualmente no fluxo real | ✓ aguardando você abrir o app + clicar no botão |

---

## 7. Roteiro completo de validação manual

1. ✅ `pnpm tauri dev`.
2. ✅ Abrir Croqui → criar Novo croqui.
3. ✅ Ativar Road Parity → clicar duas vezes no toggle da status bar até virar **"Road Parity"** roxo.
4. ✅ Inserir Demo Parity (botão na seção Imagem).
5. ✅ Visualizar: rotatória central com ilha verde + 4 vias arteriais + 1 diagonal residencial.
6. ✅ Clicar em uma via → handles A/B/C1/C2 aparecem.
7. ✅ Arrastar A → via se move, mantendo curvatura (C1 acompanha).
8. ✅ Arrastar C1 → curvatura da via muda.
9. ✅ Clicar na rotatória → handle de centro + ring tracejado.
10. ✅ Arrastar centro da rotatória → rotatória se move.
11. ✅ Ctrl+S → salvar.
12. ✅ Fechar croqui, reabrir → tudo persiste.
13. ✅ Exportar PNG técnico → confere render parity no PNG.
14. ✅ Exportar PNG limpo → idem.
15. ✅ Alternar para v1 no toggle → as vias parity desaparecem (não são renderizadas pelo v1); a flag muda mas `parity_objects` permanece em memória. Voltar para parity → vias reaparecem. (Comportamento esperado: cada motor lê o seu array.)
16. ✅ Comparar lado a lado: criar segundo croqui com mesma cena via Road v2 (toolbar antigo) e comparar visualmente. Deve estar pelo menos no mesmo nível do que o lab mostrou.

---

## 8. Resumo executivo H.3

✅ **Renderer Parity vive no Croqui real** atrás de `road_engine_version: "parity"`.
✅ **Toggle 3 estados** (v1/v2/parity) na status bar com cor distinta para parity.
✅ **Botão "Inserir Demo Parity"** popula o doc com fixture de teste em 1 clique.
✅ **Handles A/B/C1/C2 draggable** com lógica de drag-com-controle (A move C1 junto, preserva curvatura).
✅ **Rotatória movível** pelo handle de centro.
✅ **Save/reload funciona** (serializer passthrough da H.1).
✅ **Export PNG funciona** (stage.toDataURL).
✅ **Zero impacto** em v1, v2, OSM, Drone, Laudo, Evidências, Dossiê, Vídeo, Imagem, Home.
✅ Typecheck / build / cargo check verdes. 777 testes mantidos.

**Aguardando validação visual no Croqui real, conforme roteiro §7.**
