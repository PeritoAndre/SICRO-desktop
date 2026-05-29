/**
 * N — HeaderToolbar: barra de controle do cabeçalho.
 *
 * Aparece flutuante no topo do editor quando `editingRegion === "header"`.
 * Em modo body, fica oculta — a entrada para modo header é via
 * double-click no PageHeaderRegion ou via botão na toolbar principal
 * do editor (a ser plugado em N8.2).
 *
 * Controles:
 *   - Título "Editando cabeçalho" + dica de que vale para todas as pgs.
 *   - Input numérico "Altura" em cm (clamped 0..6, default 2.5).
 *   - Botão "Desativar cabeçalho" (toggle enabled=false e volta pro body).
 *   - Botão "Fechar cabeçalho" (apenas volta pro body sem desativar).
 */

import { useCallback } from "react";
import {
  clampHeaderHeightCm,
  HEADER_HEIGHT_MAX_CM,
  HEADER_HEIGHT_MIN_CM,
  type SicroDocHeader,
} from "../document-engine";
import styles from "./HeaderToolbar.module.css";

export interface HeaderToolbarProps {
  /** Altura atual do header em cm (já clamped pela schema). */
  heightCm: number;
  /** Margem superior do laudo. A altura do header não pode passar dela. */
  maxAllowedHeightCm: number;
  /** Estado atual do header (pra montar o patch quando desliga). */
  header: SicroDocHeader;
  /** Persiste mudanças no header (enabled, content). */
  onHeaderChange: (next: SicroDocHeader) => void;
  /** Persiste a altura no layout. */
  onHeightChange: (heightCm: number) => void;
  /** Sai do modo edição do header (volta pro body). */
  onClose: () => void;
}

export function HeaderToolbar({
  heightCm,
  maxAllowedHeightCm,
  header,
  onHeaderChange,
  onHeightChange,
  onClose,
}: HeaderToolbarProps) {
  const handleHeightInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFloat(e.target.value);
      if (Number.isNaN(parsed)) return;
      const clamped = Math.min(
        clampHeaderHeightCm(parsed),
        maxAllowedHeightCm,
      );
      onHeightChange(clamped);
    },
    [maxAllowedHeightCm, onHeightChange],
  );

  const handleDisable = useCallback(() => {
    onHeaderChange({
      enabled: false,
      content: header.content,
    });
    onClose();
  }, [header.content, onHeaderChange, onClose]);

  // Sugestões de altura comuns no padrão Word (mm convertidos pra cm).
  const presets = [1.5, 2.0, 2.5, 3.0, 4.0].filter(
    (v) => v <= maxAllowedHeightCm,
  );

  return (
    <div className={styles.bar} role="toolbar" aria-label="Cabeçalho do laudo">
      <div className={styles.title}>
        <span className={styles.dot} aria-hidden />
        <span>Editando cabeçalho</span>
        <span className={styles.subtitle}>
          aplicado em todas as páginas
        </span>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="header-height-input">
          Altura
        </label>
        <input
          id="header-height-input"
          className={styles.numberInput}
          type="number"
          min={HEADER_HEIGHT_MIN_CM}
          max={Math.min(HEADER_HEIGHT_MAX_CM, maxAllowedHeightCm)}
          step={0.1}
          value={heightCm.toFixed(1)}
          onChange={handleHeightInput}
          aria-label="Altura do cabeçalho em centímetros"
        />
        <span className={styles.unit}>cm</span>
        <div className={styles.presets} role="group" aria-label="Alturas comuns">
          {presets.map((v) => (
            <button
              key={v}
              type="button"
              className={`${styles.presetBtn} ${
                Math.abs(heightCm - v) < 0.05 ? styles.presetBtnActive : ""
              }`}
              onClick={() => onHeightChange(v)}
              title={`${v.toFixed(1)} cm`}
            >
              {v.toFixed(1)}
            </button>
          ))}
        </div>
        {maxAllowedHeightCm < HEADER_HEIGHT_MAX_CM && (
          <span className={styles.cap} title="Limitado pela margem superior">
            (máx {maxAllowedHeightCm.toFixed(1)} — margem)
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.dangerBtn}
          onClick={handleDisable}
          title="Desativa o cabeçalho (mantém o conteúdo salvo)"
        >
          Desativar
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={onClose}
          title="Volta para edição do corpo (Esc)"
        >
          Fechar cabeçalho
        </button>
      </div>
    </div>
  );
}
