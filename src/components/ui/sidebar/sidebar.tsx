"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, m, type PanInfo } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useCanHover, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import "./sidebar.css";

export type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  badge?: string | number;
};

export type SidebarSection = {
  title?: string;
  items: SidebarItem[];
};

export type SidebarProps = {
  sections: SidebarSection[];
  /** id of the active item (controlled). */
  activeId?: string;
  onNavigate?: (item: SidebarItem) => void;
  brand?: { logo: ReactNode; name: ReactNode; subtitle?: ReactNode };
  /** Rendered at the bottom (user card, theme switch...). Receives `open`. */
  footer?: ReactNode | ((state: { open: boolean }) => ReactNode);
  /** Width of the collapsed rail, px. */
  collapsedWidth?: number;
  /** Width of the expanded panel, px. */
  expandedWidth?: number;
  /** Expand on hover on devices with a fine pointer. Touch devices use the toggle. */
  expandOnHover?: boolean;
  /** Start pinned open on desktop. */
  defaultPinned?: boolean;
  /** Below this media query the sidebar becomes a swipeable drawer. */
  mobileQuery?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

const SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;

/* ------------------------------------------------------------------ */

export function Sidebar({
  sections,
  activeId,
  onNavigate,
  brand,
  footer,
  collapsedWidth = 72,
  expandedWidth = 264,
  expandOnHover = true,
  defaultPinned = false,
  mobileQuery = "(max-width: 767px)",
  className,
  style,
  "aria-label": ariaLabel = "Main",
}: SidebarProps) {
  const isMobile = useMediaQuery(mobileQuery);
  const canHover = useCanHover();
  const [pinned, setPinned] = useState(defaultPinned);
  const [hovered, setHovered] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number>(undefined);

  const open = pinned || (hovered && expandOnHover && canHover);

  // Close the drawer when we leave mobile layout (rotation, resize).
  if (!isMobile && drawerOpen) setDrawerOpen(false);

  // Touch tablets: "pinned" acts as a temporary open state, close on outside tap / Esc.
  useEffect(() => {
    if (!pinned || isMobile) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    const onDown = (e: PointerEvent) => {
      if (canHover) return; // on desktop a pin is sticky
      if (navRef.current && !navRef.current.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pinned, isMobile, canHover]);

  const vars = {
    "--sb-rail": `${collapsedWidth}px`,
    "--sb-w": `${expandedWidth}px`,
    ...style,
  } as CSSProperties;

  const handleNavigate = useCallback(
    (item: SidebarItem) => {
      onNavigate?.(item);
      setDrawerOpen(false);
    },
    [onNavigate],
  );

  return (
    <>
      {/* ---------------- Desktop / tablet rail ---------------- */}
      <nav
        ref={navRef}
        aria-label={ariaLabel}
        data-open={open}
        className={cn(
          "pointer-events-none fixed inset-y-3 left-3 z-40 hidden md:block",
          className,
        )}
        style={vars}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => setHovered(true), 60); // ignore fly-overs
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          window.clearTimeout(hoverTimer.current);
          setHovered(false);
        }}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
        }}
      >
        <div
          className={cn(
            "sb-panel",
            "flex h-full flex-col overflow-hidden bg-[var(--sb-bg)] text-[var(--sb-fg)]",
            "shadow-[inset_0_0_0_1px_var(--border)]",
          )}
        >
          <LayoutGroup id="sb-desktop">
            <SidebarBody
              sections={sections}
              activeId={activeId}
              onNavigate={handleNavigate}
              brand={brand}
              footer={footer}
              open={open}
              headerAction={
                <button
                  type="button"
                  onClick={() => setPinned((p) => !p)}
                  aria-pressed={pinned}
                  aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
                  className={cn(
                    "sb-label",
                    "ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-[var(--sb-muted)] outline-none",
                    "hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  )}
                >
                  {pinned ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
              }
              onBrandClick={canHover ? undefined : () => setPinned((p) => !p)}
            />
          </LayoutGroup>
        </div>
      </nav>

      {/* ---------------- Mobile drawer ---------------- */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        className={cn(
          "fixed left-3 top-3 z-40 grid size-11 place-items-center rounded-2xl md:hidden",
          "bg-[var(--sb-bg)] text-[var(--sb-fg)] shadow-[inset_0_0_0_1px_var(--border),0_8px_24px_-12px_rgb(0_0_0/0.35)]",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        <Menu className="size-5" />
      </button>

      <AnimatePresence>
        {isMobile && drawerOpen && (
          <MobileDrawer onClose={() => setDrawerOpen(false)} width={Math.min(expandedWidth + 24, 320)} vars={vars}>
            <SidebarBody
              sections={sections}
              activeId={activeId}
              onNavigate={handleNavigate}
              brand={brand}
              footer={footer}
              open
              headerAction={
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="ml-auto grid size-9 place-items-center rounded-xl text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] outline-none"
                >
                  <X className="size-4" />
                </button>
              }
            />
          </MobileDrawer>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */

function MobileDrawer({
  children,
  onClose,
  width,
  vars,
}: {
  children: ReactNode;
  onClose: () => void;
  width: number;
  vars: CSSProperties;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden"; // scroll lock
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a[aria-current], a")?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -width * 0.3 || info.velocity.x < -500) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden" style={vars}>
      <m.div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-open="true"
        className="absolute inset-y-2 left-2 flex flex-col overflow-hidden rounded-[var(--sb-radius)] bg-[var(--sb-bg)] text-[var(--sb-fg)] shadow-2xl will-change-transform"
        style={{ width, maxWidth: "calc(100vw - 3.5rem)" }}
        initial={{ x: "-110%" }}
        animate={{ x: 0 }}
        exit={{ x: "-110%" }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        onDragEnd={onDragEnd}
      >
        <LayoutGroup id="sb-mobile">{children}</LayoutGroup>
      </m.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SidebarBody({
  sections,
  activeId,
  onNavigate,
  brand,
  footer,
  open,
  headerAction,
  onBrandClick,
}: Pick<SidebarProps, "sections" | "activeId" | "onNavigate" | "brand" | "footer"> & {
  open: boolean;
  headerAction?: ReactNode;
  onBrandClick?: () => void;
}) {
  let index = 0;
  const BrandTag = onBrandClick ? "button" : "div";

  return (
    <>
      {brand && (
        <div className="flex h-[72px] shrink-0 items-center gap-3 px-3">
          <BrandTag
            {...(onBrandClick
              ? { type: "button" as const, onClick: onBrandClick, "aria-label": open ? "Collapse sidebar" : "Expand sidebar" }
              : {})}
            className="grid size-12 shrink-0 place-items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {brand.logo}
          </BrandTag>
          <div className={cn("sb-label", "min-w-0 leading-tight")} style={{ "--i": 0 } as CSSProperties}>
            <div className="truncate text-[15px] font-semibold">{brand.name}</div>
            {brand.subtitle && <div className="truncate text-xs text-[var(--sb-muted)]">{brand.subtitle}</div>}
          </div>
          {headerAction}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-3 py-2 [scrollbar-width:none]">
        {sections.map((section, si) => (
          <div key={section.title ?? si} className="flex flex-col gap-1">
            {section.title && (
              <div className="relative h-6 px-3">
                <span
                  className={cn("sb-label", "absolute inset-x-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--sb-muted)]")}
                  style={{ "--i": index } as CSSProperties}
                >
                  {section.title}
                </span>
                <span
                  aria-hidden
                  className={cn("sb-collapsed-only", "absolute left-4 top-1/2 h-px w-4 bg-[var(--border)]")}
                />
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  index={++index}
                  open={open}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-[var(--border)] p-3">
          {typeof footer === "function" ? footer({ open }) : footer}
        </div>
      )}
    </>
  );
}

function SidebarLink({
  item,
  active,
  index,
  open,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  index: number;
  open: boolean;
  onNavigate?: (item: SidebarItem) => void;
}) {
  return (
    <li>
      <a
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-label={open ? undefined : item.label}
        onClick={() => onNavigate?.(item)}
        className={cn(
          "group relative flex h-11 items-center rounded-[14px] outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          active ? "text-[var(--sb-active-fg)]" : "text-[var(--sb-muted)] hover:text-[var(--sb-fg)]",
        )}
      >
        {/* Hover wash: plain CSS, cheapest possible */}
        <span
          aria-hidden
          className="sb-pill absolute inset-0 rounded-[inherit] bg-[var(--sb-hover)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />
        {/* Active pill: shared-layout animation, runs on transforms only */}
        {active && (
          <m.span
            layoutId="sb-active"
            aria-hidden
            className="sb-pill absolute inset-0 rounded-[inherit] bg-[var(--sb-active-bg)]"
            transition={SPRING}
          />
        )}
        <span className="relative grid h-full w-12 shrink-0 place-items-center [&>svg]:size-[19px] [&>svg]:transition-transform [&>svg]:duration-300 group-hover:[&>svg]:scale-110 group-active:[&>svg]:scale-95">
          {item.icon}
          {item.badge != null && (
            <span
              aria-hidden
              className={cn("sb-collapsed-only", "absolute right-2.5 top-2.5 size-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--sb-bg)]")}
            />
          )}
        </span>
        <span
          className={cn("sb-label", "relative min-w-0 flex-1 truncate pr-2 text-[14px] font-medium")}
          style={{ "--i": index } as CSSProperties}
        >
          {item.label}
        </span>
        {item.badge != null && (
          <span
            className={cn(
              "sb-label",
              "relative mr-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              active ? "bg-[var(--sb-active-fg)]/15" : "bg-[var(--accent)] text-[var(--accent-fg)]",
            )}
            style={{ "--i": index } as CSSProperties}
          >
            {item.badge}
          </span>
        )}
      </a>
    </li>
  );
}
