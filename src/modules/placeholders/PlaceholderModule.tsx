/**
 * PlaceholderModule — used by every module not yet implemented in Spike A.
 *
 * The spike's job is to prove the shell + workspace round-trip. The other
 * modules render a friendly empty state with a pointer to the spike that
 * will deliver them.
 */

import { Construction } from "lucide-react";
import { EmptyState } from "@components/EmptyState/EmptyState";
import styles from "./PlaceholderModule.module.css";

interface PlaceholderModuleProps {
  module: string;
  scheduled: string;
  description?: string;
}

export function PlaceholderModule({
  module,
  scheduled,
  description,
}: PlaceholderModuleProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.content}>
        <EmptyState
          icon={<Construction size={36} strokeWidth={1.5} />}
          title={`Módulo ${module}`}
          description={
            description ??
            `Este módulo será entregue em ${scheduled}. Por enquanto a rota existe apenas para preservar a navegação do shell.`
          }
        />
      </div>
    </div>
  );
}
