import { useState } from "react";
import { NavLink } from "react-router-dom";
import { IconChevronDown, IconChevronRight, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { classNames } from "../../lib/classNames";
import { navigationGroups, primaryNavigationItems, type NavigationItem } from "./navigation";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Markets: true,
    Trading: true,
    Analysis: true,
    System: true,
  });

  return (
    <aside
      className={classNames(
        "flex h-full shrink-0 flex-col border-r border-border/70 bg-panel/82 backdrop-blur-xl transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-[244px]",
      )}
    >
      <div className={classNames("flex h-12 items-center gap-2 border-b border-border/70 px-2", collapsed && "justify-center")}>
        {!collapsed && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-panel bg-accent text-xs font-bold text-white">PT</div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">Paper Trader</p>
          </div>
        )}
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-panel border border-border/80 text-text-muted hover:bg-panel-muted hover:text-text"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          {collapsed ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
        </button>
      </div>

      <nav className={classNames("min-h-0 flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}>
        <div className="space-y-1">
          {primaryNavigationItems.map((item) => (
            <SidebarLink key={item.path} item={item} collapsed={collapsed} primary />
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {navigationGroups.map((group) => {
            const isOpen = openGroups[group.label];
            const ChevronIcon = isOpen ? IconChevronDown : IconChevronRight;

            return (
              <section key={group.label}>
                <button
                  className={classNames(
                    "flex w-full items-center gap-2 rounded-panel px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-text-muted hover:bg-panel-muted",
                    collapsed && "justify-center",
                  )}
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !isOpen }))}
                  title={collapsed ? group.label : undefined}
                  type="button"
                >
                  <ChevronIcon size={14} />
                  {!collapsed && <span>{group.label}</span>}
                </button>
                {isOpen && (
                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <SidebarLink key={item.path} item={item} collapsed={collapsed} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  collapsed,
  primary = false,
}: {
  item: NavigationItem;
  collapsed: boolean;
  primary?: boolean;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        classNames(
          "flex items-center gap-3 rounded-panel px-3 py-2 text-sm font-medium transition",
          collapsed && "h-9 justify-center px-0",
          isActive
            ? "bg-accent text-white shadow-sm [&_svg]:text-white"
            : primary
              ? "text-text hover:bg-panel-muted"
              : "text-text-muted hover:bg-panel-muted hover:text-text",
        )
      }
    >
      <Icon className="h-5 w-5 shrink-0" size={20} stroke={1.8} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}
