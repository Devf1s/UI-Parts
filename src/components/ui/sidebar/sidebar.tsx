"use client";

import { ArrowLeftToLine, ArrowRightToLine, ChevronDown, ChevronRight, Menu, X } from "lucide-react";
import {
  animate,
  AnimatePresence,
  LayoutGroup,
  m,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MotionProvider } from "@/components/motion-provider";
import { useCanHover, useMediaQuery, usePrefersReducedMotion } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { displacementMap, shapePath, supportsRefraction } from "./sidebar-glass";
import "./sidebar.css";

export type SidebarItem = {
  id: string;
  label: string;
  /** Leave out for a group header (an item with `items`). */
  href?: string;
  icon?: ReactNode;
  badge?: string | number;
  /** Show a trailing chevron (e.g. the item leads to a sub-page). */
  chevron?: boolean;
  /** Nested items, drawn on a tree line under the parent. One level deep. */
  items?: SidebarItem[];
  /** Start expanded (a group that holds the active item is always expanded). */
  defaultOpen?: boolean;
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
  /** User card under the brand. In the rail only the avatar shows. */
  profile?: { avatar: ReactNode; name: ReactNode; badge?: ReactNode; meta?: ReactNode; online?: boolean };
  /** Promo / notice card above the footer. Shown only while expanded. */
  card?: ReactNode;
  /** Rendered at the bottom (theme switch, settings...). Receives `open`. */
  footer?: ReactNode | ((state: { open: boolean }) => ReactNode);
  /** Width of the collapsed rail, px. */
  collapsedWidth?: number;
  /** Width of the expanded panel, px. */
  expandedWidth?: number;
  /** How far the right edge bows in at the waist, px. 0 = straight slab. */
  curve?: number;
  /** Corner radius of the glass, px. */
  radius?: number;
  /** Lens refraction at the glass rim. "auto" = on where supported (Chromium desktop). */
  refraction?: boolean | "auto";
  /** Expand on hover on devices with a fine pointer. Touch devices use the logo / pin. */
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
const EASE = [0.32, 0.72, 0, 1] as const;

/* ------------------------------------------------------------------ */

/** Brings its own Motion scope, so it can be dropped into any page. */
export function Sidebar(props: SidebarProps) {
  return (
    <MotionProvider>
      <SidebarRoot {...props} />
    </MotionProvider>
  );
}

function SidebarRoot({
  sections,
  activeId,
  onNavigate,
  brand,
  profile,
  card,
  footer,
  collapsedWidth = 76,
  expandedWidth = 288,
  curve = 12,
  radius = 26,
  refraction = "auto",
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
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<number>(undefined);

  // Keyboard focus opens it on every device (an iPad with a keyboard has no hover).
  const open = pinned || keyboardFocus || (hovered && expandOnHover && canHover);

  // Close the drawer when we leave mobile layout (rotation, resize).
  if (!isMobile && drawerOpen) setDrawerOpen(false);

  // A page that is navigated away from is hidden (Activity), not unmounted: coming back must not
  // find the drawer open or the rail stuck in its hover state.
  useLayoutEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
      setHovered(false);
      setKeyboardFocus(false);
      setDrawerOpen(false);
    },
    [],
  );

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
    "--sb-radius": `${radius}px`,
    ...style,
  } as CSSProperties;

  const handleNavigate = useCallback(
    (item: SidebarItem) => {
      onNavigate?.(item);
      setDrawerOpen(false);
    },
    [onNavigate],
  );

  const body = { sections, activeId, onNavigate: handleNavigate, brand, profile, card, footer };

  return (
    <>
      {/* ---------------- Desktop / tablet rail ---------------- */}
      <nav
        ref={navRef}
        aria-label={ariaLabel}
        data-open={open}
        className={cn("pointer-events-none fixed inset-y-3 left-3 z-40 hidden md:block", className)}
        style={{ ...vars, width: expandedWidth }}
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
        onFocus={(e) => {
          // :focus-visible = keyboard focus; a tap on a link must not expand the rail
          if (e.target.matches(":focus-visible")) setKeyboardFocus(true);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setKeyboardFocus(false);
        }}
      >
        <GlassPanel
          width={expandedWidth}
          rail={collapsedWidth}
          open={open}
          curve={curve}
          radius={radius}
          refraction={refraction}
        >
          <LayoutGroup id="sb-desktop">
            <SidebarBody
              {...body}
              open={open}
              headerAction={
                <button
                  type="button"
                  onClick={() => setPinned((p) => !p)}
                  aria-pressed={pinned}
                  aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
                  tabIndex={open ? 0 : -1}
                  className={cn("sb-label", "sb-tile sb-tile-btn ml-auto size-9 shrink-0")}
                >
                  {pinned ? <ArrowLeftToLine className="size-4" /> : <ArrowRightToLine className="size-4" />}
                </button>
              }
              onBrandClick={canHover ? undefined : () => setPinned((p) => !p)}
            />
          </LayoutGroup>
        </GlassPanel>
      </nav>

      {/* ---------------- Mobile drawer ---------------- */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        className={cn(
          "sb-glass sb-fallback fixed left-3 top-3 z-40 grid size-11 place-items-center rounded-2xl md:hidden",
          "text-[var(--sb-fg)] shadow-[inset_0_0_0_1px_var(--sb-tile-border),0_8px_24px_-12px_rgb(0_0_0/0.35)]",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        <Menu className="size-5" />
      </button>

      <AnimatePresence>
        {isMobile && drawerOpen && (
          <MobileDrawer onClose={() => setDrawerOpen(false)} width={Math.min(expandedWidth, 320)} vars={vars} curve={curve} radius={radius}>
            <SidebarBody
              {...body}
              open
              headerAction={
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="sb-tile sb-tile-btn ml-auto size-10 shrink-0"
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
/*  Glass panel: curved silhouette, refraction, rim light, shadow       */
/* ------------------------------------------------------------------ */

function GlassPanel({
  width,
  rail,
  open,
  curve,
  radius,
  refraction,
  className,
  style,
  children,
}: {
  width: number;
  /** Collapsed width. Equal to `width` for a panel that never collapses. */
  rail: number;
  open: boolean;
  curve: number;
  radius: number;
  refraction: boolean | "auto";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<SVGPathElement>(null);
  const rimInRef = useRef<SVGPathElement>(null);
  const [h, setH] = useState(0);
  const [refract, setRefract] = useState(false);
  const progress = useMotionValue(open ? 1 : 0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Refraction is decided on the client only (SSR renders the blur fallback).
  useEffect(() => {
    const ok = refraction === true || (refraction === "auto" && supportsRefraction() && window.matchMedia("(pointer: fine)").matches);
    const t = window.setTimeout(() => setRefract(ok), 0);
    return () => window.clearTimeout(t);
  }, [refraction]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(Math.round(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One path, two uses: clip (glass + hit area) and rim stroke. Updated without React renders.
  const draw = useCallback(
    (p: number) => {
      if (!h || !panelRef.current) return;
      const w = rail + (width - rail) * p;
      const bow = curve * (0.55 + 0.45 * p);
      panelRef.current.style.clipPath = `path("${shapePath({ w, h, r: radius, bow })}")`;
      rimRef.current?.setAttribute("d", shapePath({ w, h, r: radius, bow, inset: 0.75 }));
      rimInRef.current?.setAttribute("d", shapePath({ w, h, r: radius, bow, inset: 2.5 }));
    },
    [h, rail, width, curve, radius],
  );

  useMotionValueEvent(progress, "change", draw);
  useEffect(() => draw(progress.get()), [draw, progress]);

  useEffect(() => {
    const to = open ? 1 : 0;
    if (reduced) {
      progress.set(to);
      return;
    }
    const a = animate(progress, to, { duration: 0.42, ease: EASE });
    return () => a.stop();
  }, [open, reduced, progress]);

  const map = useMemo(() => (refract && h ? displacementMap(width, h, radius, 34) : ""), [refract, h, width, radius]);
  const filterId = `sb-glass-${uid}`;
  return (
    <div className={cn("absolute inset-0", className)} style={style}>
      {/* Soft shadow outside the glass only (masked, so it never darkens the pane). Blurred SVG is
          costly to re-raster, so there are two static shadows, rail and open, and the transition
          cross-fades them (opacity runs on the compositor). */}
      {h > 0 && (
        <>
          <PanelShadow id={`${filterId}-s0`} w={rail} h={h} r={radius} bow={curve * 0.55} box={width} opacity={progress} invert />
          {rail !== width && <PanelShadow id={`${filterId}-s1`} w={width} h={h} r={radius} bow={curve} box={width} opacity={progress} />}
        </>
      )}

      {map && (
        <svg aria-hidden width="0" height="0" className="absolute">
          {/* objectBoundingBox units: userSpaceOnUse regions are misplaced on HiDPI screens */}
          <filter id={filterId} x="0" y="0" width="1" height="1" filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            {/* bend first, then frost: blurring last hides any sample Chrome leaves unfiltered */}
            <feDisplacementMap in="SourceGraphic" in2="map" scale="60" xChannelSelector="R" yChannelSelector="G" result="bentRaw" />
            <feGaussianBlur in="bentRaw" stdDeviation="7" edgeMode="duplicate" result="bent" />
            <feColorMatrix in="bent" type="saturate" values="1.5" />
          </filter>
        </svg>
      )}

      <div
        ref={panelRef}
        className={cn("sb-glass pointer-events-auto absolute inset-0 flex flex-col text-[var(--sb-fg)]", !map && "sb-fallback")}
        style={{
          width,
          clipPath: `inset(0 ${width - (open ? width : rail)}px 0 0 round ${radius}px)`,
          ...(map ? { backdropFilter: `url(#${filterId})` } : null),
        }}
      >
        {children}
      </div>

      {/* rim light: bright top-left, iridescent bottom-right, like the edge of a glass slab */}
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={h}>
        <defs>
          <linearGradient id={`${filterId}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--sb-rim)" />
            <stop offset="0.35" stopColor="var(--sb-rim)" stopOpacity="0.25" />
            <stop offset="0.7" stopColor="var(--sb-rim)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--sb-rim-2)" />
          </linearGradient>
        </defs>
        {/* outer rim + a faint inner one: reads as the thickness of the glass edge */}
        <path ref={rimRef} fill="none" stroke={`url(#${filterId}-rim)`} strokeWidth="1.5" />
        <path ref={rimInRef} fill="none" stroke="var(--sb-rim)" strokeOpacity="0.14" strokeWidth="1" />
      </svg>
    </div>
  );
}

const PAD = 48;

function PanelShadow({
  id,
  w,
  h,
  r,
  bow,
  box,
  opacity,
  invert,
}: {
  id: string;
  w: number;
  h: number;
  r: number;
  bow: number;
  box: number;
  opacity: MotionValue<number>;
  invert?: boolean;
}) {
  const o = useTransform(opacity, (p) => (invert ? 1 - p : p));
  const d = shapePath({ w, h, r, bow });
  return (
    <m.svg
      aria-hidden
      // own compositor layer: rasterised once, then only faded and composited
      className="pointer-events-none absolute overflow-visible will-change-[opacity,transform]"
      style={{ left: -PAD, top: -PAD, width: box + PAD * 2, height: h + PAD * 2, opacity: o }}
    >
      <defs>
        <filter id={`${id}-b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-PAD} y={-PAD} width={box + PAD * 4} height={h + PAD * 4}>
          <rect x={-PAD} y={-PAD} width={box + PAD * 4} height={h + PAD * 4} fill="#fff" />
          <path d={d} transform={`translate(${PAD} ${PAD})`} fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${id}-m)`}>
        <path d={d} transform={`translate(${PAD} ${PAD + 14})`} fill="var(--sb-shadow)" filter={`url(#${id}-b)`} />
      </g>
    </m.svg>
  );
}

/* ------------------------------------------------------------------ */

function MobileDrawer({
  children,
  onClose,
  width,
  vars,
  curve,
  radius,
}: {
  children: ReactNode;
  onClose: () => void;
  width: number;
  vars: CSSProperties;
  curve: number;
  radius: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(width);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden"; // scroll lock
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a[aria-current], a")?.focus({ preventScroll: true });
    const fit = () => setW(Math.min(width, window.innerWidth - 56));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      root.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fit);
    };
  }, [onClose, width]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -w * 0.3 || info.velocity.x < -500) onClose();
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
        className="absolute inset-y-2 left-2 will-change-transform"
        style={{ width: w }}
        initial={{ x: "-115%" }}
        animate={{ x: 0 }}
        exit={{ x: "-115%" }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        onDragEnd={onDragEnd}
      >
        <GlassPanel width={w} rail={w} open curve={curve * 0.7} radius={radius} refraction={false}>
          <LayoutGroup id="sb-mobile">{children}</LayoutGroup>
        </GlassPanel>
      </m.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type BodyProps = Pick<SidebarProps, "sections" | "activeId" | "onNavigate" | "brand" | "profile" | "card" | "footer"> & {
  open: boolean;
  headerAction?: ReactNode;
  onBrandClick?: () => void;
};

function SidebarBody({ sections, activeId, onNavigate, brand, profile, card, footer, open, headerAction, onBrandClick }: BodyProps) {
  let index = 0;
  const BrandTag = onBrandClick ? "button" : "div";
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <>
      {brand && (
        <div className="flex h-[68px] shrink-0 items-center gap-3 px-3.5">
          <BrandTag
            {...(onBrandClick
              ? { type: "button" as const, onClick: onBrandClick, "aria-label": open ? "Collapse sidebar" : "Expand sidebar" }
              : {})}
            className="grid w-12 shrink-0 place-items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {brand.logo}
          </BrandTag>
          <div className={cn("sb-label", "min-w-0 leading-tight")} style={{ "--i": 0 } as CSSProperties}>
            <div className="truncate text-[13px] font-semibold uppercase tracking-[0.32em]">{brand.name}</div>
            {brand.subtitle && <div className="truncate text-[11px] text-[var(--sb-muted)]">{brand.subtitle}</div>}
          </div>
          {headerAction}
        </div>
      )}
      <Divider />

      {profile && (
        <>
          <div className="flex shrink-0 items-center gap-3 px-3.5 py-3.5">
            <span className="grid w-12 shrink-0 place-items-center">
              <span className="relative size-11 rounded-full p-[2px] [background:linear-gradient(140deg,var(--sb-rim),transparent_60%,var(--sb-rim-2))]">
                <span className="block size-full overflow-hidden rounded-full">{profile.avatar}</span>
                {profile.online && (
                  <span aria-label="Online" role="img" className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-emerald-500 ring-[2.5px] ring-[var(--sb-ring-bg)]" />
                )}
              </span>
            </span>
            <div className={cn("sb-label", "min-w-0 leading-tight")} style={{ "--i": 1 } as CSSProperties}>
              <div className="flex items-center gap-2">
                <span className="truncate text-[17px] font-semibold tracking-tight">{profile.name}</span>
                {profile.badge && (
                  <span className="rounded-md bg-[var(--sb-badge-bg)] px-1.5 py-px text-[10px] font-bold tracking-wider text-[var(--sb-badge-fg)]">
                    {profile.badge}
                  </span>
                )}
              </div>
              {profile.meta && <div className="mt-0.5 truncate text-xs text-[var(--sb-muted)]">{profile.meta}</div>}
            </div>
          </div>
          <Divider inset />
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3.5 py-3 [scrollbar-width:none]">
        {sections.map((section, si) => (
          <div key={section.title ?? si} className="flex flex-col gap-0.5">
            {section.title && (
              <div className="relative flex h-7 items-center">
                <span
                  className={cn("sb-label", "flex flex-1 items-center gap-3 pl-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--sb-muted)]")}
                  style={{ "--i": index } as CSSProperties}
                >
                  {section.title}
                  <span aria-hidden className="h-px flex-1 bg-[var(--sb-line)]" />
                </span>
                <span aria-hidden className={cn("sb-collapsed-only", "absolute left-4 top-1/2 h-px w-4 bg-[var(--sb-line)]")} />
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                if (!item.items?.length) {
                  return (
                    <li key={item.id}>
                      <NavRow item={item} active={item.id === activeId} index={++index} open={open} onNavigate={onNavigate} />
                    </li>
                  );
                }
                const holdsActive = item.items.some((c) => c.id === activeId);
                const expanded = toggled[item.id] ?? (holdsActive || !!item.defaultOpen);
                const groupIndex = ++index;
                return (
                  <li key={item.id}>
                    <NavRow
                      item={item}
                      active={false}
                      tileActive={holdsActive}
                      // the group header carries the pill while its active child is hidden
                      pill={holdsActive && !expanded}
                      index={groupIndex}
                      open={open}
                      expanded={expanded}
                      onToggle={() => setToggled((t) => ({ ...t, [item.id]: !expanded }))}
                    />
                    <div className="sb-sub" data-expanded={expanded} inert={!expanded}>
                      <ul id={`sb-sub-${item.id}`} className="flex flex-col">
                        {item.items.map((child, ci) => (
                          <li key={child.id} className="relative">
                            <Tree last={ci === item.items!.length - 1} active={child.id === activeId} />
                            <NavRow
                              item={child}
                              sub
                              active={child.id === activeId}
                              index={++index}
                              open={open}
                              onNavigate={onNavigate}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {card && (
          <div className={cn("sb-label", "mt-auto pt-3")} style={{ "--i": index + 1 } as CSSProperties} inert={!open}>
            {card}
          </div>
        )}
      </div>

      {footer && (
        <>
          <Divider inset />
          <div className="shrink-0 px-3.5 py-3">{typeof footer === "function" ? footer({ open }) : footer}</div>
        </>
      )}
    </>
  );
}

function Divider({ inset }: { inset?: boolean }) {
  return <div aria-hidden className={cn("h-px shrink-0 bg-[var(--sb-line)]", inset ? "mx-4" : "mx-0")} />;
}

/** Tree connector for a nested row: a vertical line from the parent icon and an elbow into a dot. */
function Tree({ last, active }: { last: boolean; active: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-12">
      <span className={cn("absolute left-[23.5px] top-0 w-px bg-[var(--sb-line-strong)]", last ? "h-1/2" : "h-full")} />
      {last ? (
        <span className="absolute left-[23.5px] top-1/2 h-2.5 w-3 -translate-y-full rounded-bl-[9px] border-b border-l border-[var(--sb-line-strong)]" />
      ) : (
        <span className="absolute left-[24px] top-1/2 h-px w-2.5 bg-[var(--sb-line-strong)]" />
      )}
      <span
        className={cn(
          "absolute left-[35px] top-1/2 -translate-y-1/2 rounded-full transition-all duration-300",
          active
            ? "size-[7px] -ml-[1px] bg-[var(--sb-fg)] shadow-[0_0_8px_1px_var(--sb-glow)]"
            : "size-[5px] bg-[var(--sb-muted)] opacity-70",
        )}
      />
    </span>
  );
}

function NavRow({
  item,
  active,
  tileActive = active,
  pill = active,
  sub,
  index,
  open,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: SidebarItem;
  active: boolean;
  tileActive?: boolean;
  pill?: boolean;
  sub?: boolean;
  index: number;
  open: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onNavigate?: (item: SidebarItem) => void;
}) {
  const isGroup = !!onToggle;
  const common = {
    "aria-label": open ? undefined : item.label,
    className: cn(
      "group relative flex w-full items-center rounded-[14px] text-left outline-none",
      "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      sub ? "h-10" : "h-11",
      active || tileActive ? "text-[var(--sb-fg)]" : "text-[var(--sb-muted)] hover:text-[var(--sb-fg)]",
    ),
  };

  const inner = (
    <>
      {/* hover wash: plain CSS */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 rounded-[inherit] bg-[var(--sb-hover)] opacity-0 transition-opacity duration-200 group-hover:opacity-100",
          sub ? "sb-pill-sub left-[42px]" : "sb-pill left-0",
        )}
      />
      {/* active glass pill: shared-layout animation, transforms only */}
      {pill && (
        <m.span
          layoutId="sb-active"
          aria-hidden
          className={cn("sb-glass-pill absolute inset-y-0 right-0 rounded-[inherit]", sub ? "sb-pill-sub left-[42px]" : "sb-pill left-0")}
          transition={SPRING}
        />
      )}
      {sub ? (
        <span className="w-12 shrink-0" />
      ) : (
        <span className="relative grid h-full w-12 shrink-0 place-items-center">
          <span
            className={cn(
              "sb-tile size-[34px] [&>svg]:size-[17px] [&>svg]:transition-transform [&>svg]:duration-300",
              "group-hover:[&>svg]:scale-110 group-active:[&>svg]:scale-95",
              tileActive && "sb-tile-active",
            )}
          >
            {item.icon}
          </span>
          {item.badge != null && (
            <span
              aria-hidden
              className={cn("sb-collapsed-only", "absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--sb-ring-bg)]")}
            />
          )}
        </span>
      )}
      <span
        className={cn("sb-label", "relative min-w-0 flex-1 truncate pr-2", sub ? "pl-2.5 text-[13.5px]" : "pl-1.5 text-[14px] font-medium")}
        style={{ "--i": index } as CSSProperties}
      >
        {item.label}
      </span>
      {item.badge != null && (
        <span
          className={cn("sb-label", "relative mr-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--accent-fg)]")}
          style={{ "--i": index } as CSSProperties}
        >
          {item.badge}
        </span>
      )}
      {(isGroup || item.chevron) && (
        <span className={cn("sb-label", "relative mr-2.5 text-[var(--sb-muted)]")} style={{ "--i": index } as CSSProperties}>
          {isGroup ? (
            <ChevronDown className={cn("size-4 transition-transform duration-300", !expanded && "-rotate-90")} />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>
      )}
    </>
  );

  if (isGroup) {
    return (
      <button type="button" {...common} aria-expanded={expanded} aria-controls={`sb-sub-${item.id}`} onClick={onToggle}>
        {inner}
      </button>
    );
  }
  return (
    <a href={item.href} {...common} aria-current={active ? "page" : undefined} onClick={() => onNavigate?.(item)}>
      {inner}
    </a>
  );
}
