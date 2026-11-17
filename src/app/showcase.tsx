"use client";

import {
  ArrowUpRight,
  Briefcase,
  Code2,
  FolderKanban,
  Home,
  Mail,
  PenLine,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sidebar, type SidebarSection } from "@/components/ui/sidebar";
import { VenomButton } from "@/components/ui/venom-button";
import { useScrollSpy } from "@/hooks/use-scroll-spy";

const SECTIONS: SidebarSection[] = [
  {
    title: "Portfolio",
    items: [
      { id: "home", label: "Home", href: "#home", icon: <Home /> },
      { id: "projects", label: "Projects", href: "#projects", icon: <FolderKanban />, badge: 6 },
      { id: "skills", label: "Skills", href: "#skills", icon: <Code2 /> },
      { id: "experience", label: "Experience", href: "#experience", icon: <Briefcase /> },
    ],
  },
  {
    title: "More",
    items: [
      { id: "blog", label: "Blog", href: "#blog", icon: <PenLine />, badge: "new" },
      { id: "contact", label: "Contact", href: "#contact", icon: <Mail /> },
    ],
  },
];

const IDS = SECTIONS.flatMap((s) => s.items.map((i) => i.id));

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
            <span className="grid size-10 place-items-center rounded-xl bg-fg text-bg">
              <Sparkles className="size-[18px]" />
            </span>
          ),
          name: "Your Name",
          subtitle: "Frontend developer",
        }}
        footer={({ open }) => (
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center">
              <span className="size-9 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-600" />
            </span>
            <div
              className="flex min-w-0 flex-1 items-center justify-between gap-2 transition-opacity duration-300"
              style={{ opacity: open ? 1 : 0 }}
              aria-hidden={!open}
            >
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium">Your Name</div>
                <div className="truncate text-xs text-muted">Open to work</div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        )}
      />

      <main className="overflow-x-clip px-4 pb-24 pt-20 sm:px-8 md:pl-[calc(72px+2.5rem)] md:pt-10 lg:pr-12">
        <div className="mx-auto max-w-5xl">
          <Hero />
          <DemoSection id="projects" title="Projects" kicker="06 selected">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <article
                  key={i}
                  className="group rounded-3xl bg-card p-5 shadow-[inset_0_0_0_1px_var(--border)] transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="mb-4 aspect-[4/3] rounded-2xl bg-card-2" />
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Project {String(i + 1).padStart(2, "0")}</h3>
                    <ArrowUpRight className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted">Next.js · TypeScript · Motion</p>
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
                props={{ gravity: 650, thickness: 1.4 }}
              />
              <Swatch
                label="Carnage"
                style={{ "--venom-color": "#4a0a0a", "--venom-color-2": "#ef4444", "--venom-fg": "#fff" } as React.CSSProperties}
                props={{ radius: 14, tendrils: 4, lunge: 1.5 }}
              />
            </div>
          </DemoSection>

          <DemoSection id="experience" title="Experience" kicker="placeholder">
            <Placeholder />
          </DemoSection>
          <DemoSection id="blog" title="Blog" kicker="placeholder">
            <Placeholder />
          </DemoSection>

          <section id="contact" className="scroll-mt-10 py-24 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Got an idea?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted">Bring the cursor close to the button. On touch screens, tap it.</p>
            <div className="mt-10">
              <VenomButton reach={140} className="h-14 px-9 text-base">
                Say hello <ArrowUpRight className="size-4" />
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
      <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-card px-3 py-1 text-xs text-muted shadow-[inset_0_0_0_1px_var(--border)]">
        <span className="size-1.5 rounded-full bg-emerald-500" /> Available for freelance
      </p>
      <h1 className="max-w-3xl text-[clamp(2.4rem,7vw,5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
        Interfaces that feel <span className="text-accent">alive</span>.
      </h1>
      <p className="mt-6 max-w-xl text-base text-muted sm:text-lg">
        Hover the sidebar on the left (or tap the menu on mobile), then move your cursor toward the button. The
        symbiote reaches out for it.
      </p>
      <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-8">
        <VenomButton className="h-16 px-10 text-lg">let&rsquo;s collaborate</VenomButton>
        <a href="#contact" className="text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
          or get in touch
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
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-10 py-16">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        <span className="font-mono text-xs uppercase tracking-widest text-muted">{kicker}</span>
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
  return <div className="h-64 rounded-3xl bg-card shadow-[inset_0_0_0_1px_var(--border)]" />;
}
