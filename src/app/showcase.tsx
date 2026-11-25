"use client";

import {
  ArrowUpRight,
  Briefcase,
  Code2,
  FolderKanban,
  Gem,
  Home,
  Layers,
  Mail,
  Palette,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useId } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar, type SidebarSection } from "@/components/ui/sidebar";
import { VenomButton } from "@/components/ui/venom-button";
import { useScrollSpy } from "@/hooks/use-scroll-spy";

const SECTIONS: SidebarSection[] = [
  {
    title: "Menu",
    items: [
      { id: "home", label: "Home", href: "#home", icon: <Home /> },
      {
        id: "work",
        label: "Work",
        icon: <Layers />,
        defaultOpen: true,
        items: [
          { id: "projects", label: "Projects", href: "#projects", icon: <FolderKanban />, badge: 6 },
          { id: "skills", label: "Skills", href: "#skills", icon: <Code2 /> },
          { id: "experience", label: "Experience", href: "#experience", icon: <Briefcase /> },
        ],
      },
      { id: "portfolio", label: "Portfolio", href: "/portfolio", icon: <Sparkles />, chevron: true },
      { id: "blog", label: "Blog", href: "#blog", icon: <PenLine />, chevron: true },
      { id: "contact", label: "Contact", href: "#contact", icon: <Mail />, chevron: true },
    ],
  },
];

// scroll-spy only follows in-page sections, not links to other pages
const IDS = SECTIONS.flatMap((s) => s.items.flatMap((i) => (i.items ? i.items : [i])))
  .filter((i) => i.href?.startsWith("#"))
  .map((i) => i.id);

export function Showcase() {
  const [active, setActive] = useScrollSpy(IDS);

  return (
    <>
      <Sidebar
        sections={SECTIONS}
        activeId={active}
        onNavigate={(item) => setActive(item.id)}
        brand={{
          logo: (
            <span className="sb-tile size-10 text-[var(--sb-fg)]">
              <Gem className="size-[18px]" strokeWidth={1.8} />
            </span>
          ),
          name: "Lorem",
        }}
        profile={{
          avatar: (
            <span className="grid size-full place-items-center bg-gradient-to-br from-zinc-700 to-zinc-950 text-sm font-semibold text-white">
              LI
            </span>
          ),
          name: "Lorem Ipsum",
          meta: "Dolor sit amet",
          online: true,
        }}
        card={<NoticeCard />}
        footer={({ open }) => (
          <div className="flex items-center">
            <span className="grid w-12 shrink-0 place-items-center">
              <span className="sb-tile size-[34px] text-[var(--sb-muted)]">
                <Palette className="size-[17px]" />
              </span>
            </span>
            <div
              className="flex min-w-0 flex-1 items-center justify-between gap-2 pl-1.5 transition-opacity duration-300"
              style={{ opacity: open ? 1 : 0 }}
              // inert, not aria-hidden: hidden content must not stay keyboard-focusable
              inert={!open}
            >
              <span className="text-sm font-medium text-[var(--sb-muted)]">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        )}
      />

      <Backdrop />

      <main className="overflow-x-clip px-4 pb-24 pt-20 sm:px-8 md:pl-[calc(76px+2.5rem)] md:pt-10 lg:pr-12">
        <div className="mx-auto max-w-5xl">
          <Hero />
          <DemoSection id="projects" title="Lorem ipsum">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <article
                  key={i}
                  className="group rounded-3xl bg-card p-5 shadow-[inset_0_0_0_1px_var(--border)] transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="mb-4 aspect-[4/3] rounded-2xl bg-card-2" />
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Lorem {String(i + 1).padStart(2, "0")}</h3>
                    <ArrowUpRight className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted">Dolor sit amet</p>
                </article>
              ))}
            </div>
          </DemoSection>

          <DemoSection id="skills" title="Customisation" kicker="props & css vars">
            <div className="grid gap-4 md:grid-cols-3">
              <Swatch label="Default" />
              <Swatch
                label="Toxic"
                style={{ "--venom-color": "#0f2e12", "--venom-color-2": "#4ade80", "--venom-fg": "#eaffea" } as React.CSSProperties}
                props={{ gravity: 1800, thickness: 1.4 }}
              />
              <Swatch
                label="Carnage"
                style={{ "--venom-color": "#4a0a0a", "--venom-color-2": "#ef4444", "--venom-fg": "#fff" } as React.CSSProperties}
                props={{ radius: 14, tendrils: 4, lunge: 1.5 }}
              />
            </div>
          </DemoSection>

          <DemoSection id="experience" title="Dolor sit amet">
            <Placeholder />
          </DemoSection>
          <DemoSection id="blog" title="Consectetur">
            <Placeholder />
          </DemoSection>

          <section id="contact" className="scroll-mt-10 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Lorem ipsum</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">Dolor sit amet, consectetur adipiscing elit.</p>
            <div className="mt-10">
              <VenomButton reach={140} className="h-14 px-9 text-base">
                Lorem ipsum <ArrowUpRight className="size-4" />
              </VenomButton>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function Hero() {
  return (
    <section id="home" className="flex min-h-[calc(100dvh-8rem)] scroll-mt-10 flex-col justify-center py-10">
      <h1 className="max-w-3xl text-[clamp(2.4rem,7vw,5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
        Lorem ipsum <span className="text-accent">dolor</span>.
      </h1>
      <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      </p>
      <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-8">
        <VenomButton className="h-16 px-10 text-lg">let&rsquo;s collaborate</VenomButton>
        <a href="#contact" className="inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
          Lorem ipsum
        </a>
      </div>
    </section>
  );
}

function DemoSection({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-10 py-16">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {kicker && <span className="font-mono text-xs uppercase tracking-widest text-muted">{kicker}</span>}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  label,
  style,
  props,
}: {
  label: string;
  style?: React.CSSProperties;
  props?: Partial<React.ComponentProps<typeof VenomButton>>;
}) {
  return (
    <div
      className="flex flex-col items-center justify-between gap-10 rounded-3xl bg-card px-6 py-10 shadow-[inset_0_0_0_1px_var(--border)]"
      style={style}
    >
      <VenomButton reach={100} sense={150} {...props}>
        {label}
      </VenomButton>
      <code className="max-w-full truncate font-mono text-[11px] text-muted">
        {props ? JSON.stringify(props) : "<VenomButton />"}
      </code>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="rounded-3xl bg-card p-6 text-muted shadow-[inset_0_0_0_1px_var(--border)] sm:p-8">
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
      <p className="mt-4">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
    </div>
  );
}

/** Original bulletin card for the sidebar: paper on the left, a glass gem on the right. */
function NoticeCard() {
  // the card renders in both the rail and the drawer: gradient ids must be unique per copy
  const id = `gem${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <a
      href="#projects"
      className="group/card relative flex h-[104px] overflow-hidden rounded-2xl shadow-[0_0_0_1px_var(--sb-tile-border),0_10px_24px_-14px_var(--sb-shadow)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <div className="flex w-[52%] flex-col justify-between bg-[#efebe4] px-3 py-2.5 text-[#141418]">
        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#141418]/60">Lorem · 01</span>
        <span className="text-[19px] font-extrabold uppercase leading-none tracking-tight">Ipsum</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#141418]/60">Dolor sit</span>
      </div>
      <div className="relative flex-1 bg-[radial-gradient(120%_90%_at_60%_40%,#2b2a44,#0d0d16)]">
        <svg viewBox="0 0 80 80" className="absolute inset-0 m-auto size-[78px] transition-transform duration-500 group-hover/card:-translate-y-1 group-hover/card:rotate-6" aria-hidden>
          <defs>
            <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e8f2ff" />
              <stop offset="1" stopColor="#7aa2ff" />
            </linearGradient>
            <linearGradient id={`${id}r`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b9a6ff" />
              <stop offset="1" stopColor="#3a3ad1" />
            </linearGradient>
          </defs>
          <ellipse cx="40" cy="46" rx="30" ry="7" fill="none" stroke="#c9c6ff" strokeOpacity="0.45" strokeWidth="0.8" transform="rotate(-12 40 46)" />
          <path d="M40 8 L27 40 L40 72 Z" fill={`url(#${id}l)`} />
          <path d="M40 8 L53 40 L40 72 Z" fill={`url(#${id}r)`} />
          <path d="M27 40 L40 46 L53 40" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.6" />
          <circle cx="62" cy="18" r="1.2" fill="#fff" />
          <circle cx="16" cy="58" r="0.8" fill="#fff" opacity="0.7" />
        </svg>
        <span className="absolute bottom-2 right-2.5 font-mono text-[7.5px] uppercase tracking-[0.18em] text-white/70">Amet ›</span>
      </div>
    </a>
  );
}

/**
 * Fixed decorative backdrop: soft monochrome swooshes give the glass something to bend.
 * One static SVG, no animation, so it costs a single paint.
 */
function Backdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full text-fg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="bd-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="bd-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M-120 330 C 260 120 620 140 980 300 S 1500 420 1620 260 L1620 -40 L-120 -40 Z" fill="url(#bd-a)" />
      <path d="M-160 520 C 200 330 540 360 860 520 S 1380 700 1600 520" fill="none" stroke="url(#bd-b)" strokeWidth="90" strokeLinecap="round" />
      <path d="M-100 860 C 300 700 700 720 1040 820 S 1460 900 1620 780 L1620 1000 L-100 1000 Z" fill="url(#bd-a)" />
    </svg>
  );
}
