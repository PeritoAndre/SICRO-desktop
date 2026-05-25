import { MapPin, FileText, X } from "lucide-react";
import { Card } from "@components/Card/Card";
import { StatusPill } from "@components/StatusPill/StatusPill";
import { formatRelative } from "@core/formatters";
import type { RecentOccurrence } from "@domain/occurrence";
import styles from "./RecentOccurrenceCard.module.css";

interface RecentOccurrenceCardProps {
  entry: RecentOccurrence;
  onOpen: (entry: RecentOccurrence) => void;
  onForget: (entry: RecentOccurrence) => void;
}

export function RecentOccurrenceCard({
  entry,
  onOpen,
  onForget,
}: RecentOccurrenceCardProps) {
  return (
    <Card
      interactive
      onClick={() => onOpen(entry)}
      aria-label={`Abrir ocorrência ${entry.occurrence_label}`}
    >
      <div className={styles.card}>
        <div className={styles.headRow}>
          <h3 className={styles.title}>{entry.occurrence_label}</h3>
          <StatusPill status={entry.status} />
        </div>
        <div className={styles.metaRow}>
          {entry.tipo_pericia && (
            <span className={styles.metaItem}>
              <FileText size={12} aria-hidden /> {entry.tipo_pericia}
            </span>
          )}
          {entry.municipio && (
            <span className={styles.metaItem}>
              <MapPin size={12} aria-hidden /> {entry.municipio}
            </span>
          )}
        </div>
        <code className={styles.path} title={entry.workspace_path}>
          {entry.workspace_path}
        </code>
        <div className={styles.footer}>
          <span className={styles.timestamp}>
            Aberta {formatRelative(entry.last_opened_at)}
          </span>
          <button
            type="button"
            className={styles.forget}
            onClick={(e) => {
              e.stopPropagation();
              onForget(entry);
            }}
            aria-label="Remover dos recentes"
            title="Remover dos recentes (não exclui o workspace em disco)"
          >
            <X size={12} aria-hidden /> esquecer
          </button>
        </div>
      </div>
    </Card>
  );
}
