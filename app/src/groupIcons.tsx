import {
  Book,
  Briefcase,
  Calendar,
  ChartBar,
  FlaskConical,
  Folder,
  Folders,
  Globe,
  GraduationCap,
  Hash,
  House,
  Laptop,
  Lightbulb,
  Lock,
  Mail,
  Microscope,
  NotebookPen,
  Package,
  Palette,
  Rocket,
  Settings,
  Sprout,
  Target,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const DEFAULT_GROUP_ICON = "folder";

const GROUP_ICON_MAP = {
  folder: Folder,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  home: House,
  "flask-conical": FlaskConical,
  book: Book,
  laptop: Laptop,
  globe: Globe,
  "notebook-pen": NotebookPen,
  hash: Hash,
  target: Target,
  settings: Settings,
  folders: Folders,
  calendar: Calendar,
  lock: Lock,
  lightbulb: Lightbulb,
  wrench: Wrench,
  package: Package,
  palette: Palette,
  "chart-bar": ChartBar,
  mail: Mail,
  rocket: Rocket,
  microscope: Microscope,
  sprout: Sprout,
} as const satisfies Record<string, LucideIcon>;

export type GroupIconId = keyof typeof GROUP_ICON_MAP;
export const GROUP_ICONS = Object.keys(GROUP_ICON_MAP) as GroupIconId[];

const EMOJI_TO_ICON: Record<string, GroupIconId> = {
  "📁": "folder",
  "💼": "briefcase",
  "🎓": "graduation-cap",
  "🏠": "home",
  "🧪": "flask-conical",
  "📚": "book",
  "💻": "laptop",
  "🌐": "globe",
  "📝": "notebook-pen",
  "🎯": "target",
  "⚙️": "settings",
  "🗂️": "folders",
  "📅": "calendar",
  "🔒": "lock",
  "💡": "lightbulb",
  "🛠️": "wrench",
  "📦": "package",
  "🎨": "palette",
  "📊": "chart-bar",
  "✉️": "mail",
  "🚀": "rocket",
  "🔬": "microscope",
  "🌱": "sprout",
};

export function resolveGroupIcon(raw?: string): GroupIconId {
  const icon = raw?.trim() ?? "";
  if (icon in GROUP_ICON_MAP) return icon as GroupIconId;
  if (icon in EMOJI_TO_ICON) return EMOJI_TO_ICON[icon];
  return DEFAULT_GROUP_ICON;
}

function GroupIcon({ id, size }: { id?: string; size: number }) {
  const Icon = GROUP_ICON_MAP[resolveGroupIcon(id)];
  return <Icon size={size} strokeWidth={1.4} />;
}

export function GroupGlyph({ id, large = false }: { id?: string; large?: boolean }) {
  return (
    <span className={large ? "group-glyph lg" : "group-glyph"} aria-hidden="true">
      <GroupIcon id={id} size={large ? 20 : 16} />
    </span>
  );
}
