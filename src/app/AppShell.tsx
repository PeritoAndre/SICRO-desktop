import type { ReactNode } from "react";
import { ActivityRail } from "./ActivityRail";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.rail}>
        <ActivityRail />
      </div>
      <div className={styles.top}>
        <TopBar />
      </div>
      <main className={styles.main}>{children}</main>
      <div className={styles.status}>
        <StatusBar />
      </div>
    </div>
  );
}
