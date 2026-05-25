/**
 * ActivityRail — left vertical navigation, fixed across the entire app.
 *
 * Lists every module from doc 03 §6.2. In the Spike A only "Início" is
 * enabled; the others render as placeholder routes so the wiring is in place.
 */

import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Boxes,
  Camera,
  ClipboardList,
  FileText,
  Film,
  FolderOpen,
  Home as HomeIcon,
  ImagePlus,
  PieChart,
  Settings,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import styles from "./ActivityRail.module.css";
import { useNavGuard } from "./navGuard";

interface RailItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Disabled means: route exists, but module is not yet implemented. */
  disabled?: boolean;
}

const items: RailItem[] = [
  { to: "/", label: "Início", icon: HomeIcon },
  { to: "/dossie", label: "Dossiê", icon: FolderOpen },
  { to: "/laudo", label: "Laudo", icon: FileText },
  { to: "/croqui", label: "Croqui", icon: Shapes },
  { to: "/video", label: "Vídeo", icon: Film },
  { to: "/evidencias", label: "Evidências", icon: Boxes },
  { to: "/imagem", label: "Imagem", icon: ImagePlus },
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
  const navigate = useNavigate();
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
        if (disabled) {
          e.preventDefault();
          return;
        }
        // MVP 9 Round 3 — consult the global navigation guard so editors
        // with unsaved work can intercept and prompt before leaving.
        const guard = useNavGuard.getState().guard;
        if (!guard) return;
        e.preventDefault();
        void useNavGuard.getState().attemptNavigation(() => navigate(to));
      }}
    >
      <Icon size={20} aria-hidden />
    </NavLink>
  );
}

// BookOpen / Camera are re-referenced to avoid tree-shaking warnings.
void BookOpen;
void Camera;
