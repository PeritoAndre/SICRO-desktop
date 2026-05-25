/**
 * ActivityRail — left vertical navigation, fixed across the entire app.
 *
 * Lists every module from doc 03 §6.2. In the Spike A only "Início" is
 * enabled; the others render as placeholder routes so the wiring is in place.
 */

import { NavLink } from "react-router-dom";
import {
  BookOpen,
  Camera,
  ClipboardList,
  FileText,
  Film,
  FolderOpen,
  Home as HomeIcon,
  PieChart,
  Settings,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import styles from "./ActivityRail.module.css";

interface RailItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Disabled means: route exists, but module is not yet implemented. */
  disabled?: boolean;
}

const items: RailItem[] = [
  { to: "/", label: "Início", icon: HomeIcon },
  { to: "/dossie", label: "Dossiê", icon: FolderOpen, disabled: true },
  { to: "/laudo", label: "Laudo", icon: FileText },
  { to: "/croqui", label: "Croqui", icon: Shapes, disabled: true },
  { to: "/video", label: "Vídeo", icon: Film, disabled: true },
  { to: "/imagens", label: "Imagens", icon: Camera, disabled: true },
  { to: "/midias", label: "Mídias", icon: ClipboardList, disabled: true },
  { to: "/estatisticas", label: "Estatísticas", icon: PieChart, disabled: true },
];

const settings: RailItem = {
  to: "/configuracoes",
  label: "Configurações",
  icon: Settings,
  disabled: true,
};

export function ActivityRail() {
  return (
    <nav className={styles.rail} aria-label="Navegação principal">
      <div className={styles.brand} aria-label="SICRO">
        S
      </div>
      <div className={styles.divider} aria-hidden />

      {items.map((item) => (
        <RailLink key={item.to} {...item} />
      ))}

      <div className={styles.spacer} aria-hidden />

      <div className={styles.divider} aria-hidden />
      <RailLink {...settings} />
    </nav>
  );
}

function RailLink({ to, label, icon: Icon, disabled }: RailItem) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      title={label + (disabled ? " (em breve)" : "")}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={({ isActive }) =>
        [
          styles.item,
          isActive ? styles.itemActive : null,
          disabled ? styles.itemDisabled : null,
        ]
          .filter(Boolean)
          .join(" ")
      }
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
    >
      <Icon size={20} aria-hidden />
    </NavLink>
  );
}

// BookOpen is re-imported to avoid tree-shaking warnings if future modules need it.
void BookOpen;
