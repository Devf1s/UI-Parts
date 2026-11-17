# ui-parts

Small, production-minded UI components for a portfolio landing, built with
**Next.js (App Router) · TypeScript · Tailwind CSS v4 · Motion · next-themes**.

| Component | What it does |
| --- | --- |
| `Sidebar` | Curved glass panel: a slab with an hourglass waist, lens refraction at the rim (Chromium) or frosted blur elsewhere, and an iridescent rim light. Rail that expands on hover (desktop), on tap (touch tablets), swipeable drawer on phones. Profile card, nested groups on a tree line, sliding glass pill, promo card, scroll-spy friendly. |
| `VenomButton` | Black "symbiote" button rendered as a lit 3D scene (WebGL2). Strings sprout on the edge as the cursor nears, 2–6 glossy tendrils lunge out and coil around the cursor (which becomes a 3D hand), stretch, bead and web together as you pull, then pinch off and recoil. Idle bursts keep it alive. Falls back to a 2D canvas without a GPU. |

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build + type check
npm run test:all  # lint, types, unit, build, e2e (see Testing)
```

## Usage

```tsx
import { Sidebar } from "@/components/ui/sidebar";
import { VenomButton } from "@/components/ui/venom-button";

<Sidebar
  sections={[
    {
      title: "Menu",
      items: [
        { id: "home", label: "Home", href: "#home", icon: <Home /> },
        { id: "work", label: "Work", icon: <Layers />, items: [{ id: "projects", label: "Projects", href: "#projects" }] },
        { id: "contact", label: "Contact", href: "#contact", icon: <Mail />, chevron: true },
      ],
    },
  ]}
  activeId={active}
  onNavigate={(item) => setActive(item.id)}
  brand={{ logo: <Logo />, name: "Lumen" }}
  profile={{ avatar: <Avatar />, name: "Your Name", badge: "PRO", meta: "Frontend developer", online: true }}
  card={<NoticeCard />}
  footer={({ open }) => <ThemeRow inert={!open} />}
/>

<VenomButton tendrils={6} reach={140}>let’s collaborate</VenomButton>
```

### Sidebar props

| Prop | Default | Notes |
| --- | --- | --- |
| `sections` | — | `{ title?, items: { id, label, href?, icon?, badge?, chevron?, items?, defaultOpen? }[] }[]`. An item with `items` is a foldable group drawn on a tree line; a group holding the active item stays open. |
| `activeId` / `onNavigate` | — | Controlled active item. Pair with `useScrollSpy`. |
| `brand`, `profile`, `card`, `footer` | — | `profile` = `{ avatar, name, badge?, meta?, online? }` (only the avatar shows in the rail). `card` shows while expanded. `footer` may be a function of `{ open }`. |
| `collapsedWidth` / `expandedWidth` | `76` / `288` | px |
| `curve` | `12` | How far the long edges bow in at the waist, px. `0` = straight slab. |
| `radius` | `26` | Corner radius of the glass, px. |
| `refraction` | `"auto"` | Lens at the rim. `"auto"` = Chromium desktop with ≥ 4 cores; elsewhere a frosted blur. |
| `expandOnHover` | `true` | Only on devices with a fine pointer. |
| `defaultPinned` | `false` | Start expanded on desktop. |
| `mobileQuery` | `(max-width: 767px)` | Below it the sidebar is a drawer. |

CSS variables (light and dark values in `globals.css`): glass `--sb-glass --sb-sheen --sb-blur --sb-solid`,
text `--sb-fg --sb-muted`, lines `--sb-line --sb-line-strong`, pill and tiles `--sb-pill --sb-pill-border --sb-tile
--sb-tile-border --sb-tile-active --sb-tile-active-fg`, rim `--sb-rim --sb-rim-2`, `--sb-shadow --sb-glow`, motion `--sb-ease --sb-duration`.

### VenomButton props

All native `<button>` props, plus:

| Prop | Default | Notes |
| --- | --- | --- |
| `tendrils` | `6` | Max tendrils at once, one per finger/wrist (1–6). 2 launch at the edge of reach, more as you get closer. |
| `sense` | `220` | Distance from the edge where surface strings start to fizz, px. |
| `reach` | `120` | Distance from the edge where tendrils launch, px. |
| `maxLength` | `160` | A held tendril always snaps past this length, px. |
| `snapStretch` | `1.6` | A held tendril snaps past this stretch ratio (rest length creeps up slowly, so slow pulls stretch further). |
| `lunge` | `1` | Lunge speed multiplier. |
| `thickness` | `1` | Strand thickness multiplier. |
| `gravity` | `900` | Sag, px/s². |
| `sheen` | `0` | Oily blue-violet thin-film sheen on the goo, 0–1 (WebGL). |
| `radius` | pill | Corner radius of the body, px. |
| `splash` | `4` | Droplets flicked off the rim on click, they land and crawl back in (max 5). `0` disables. |
| `idle` | `true` | Small bursts of strings every ~2 s while nobody is near (woken by a timer, no running loop). |
| `cursor` | `"glove"` | `"glove"` turns the cursor into a 3D arrow/hand near the button, which the tendrils coil around; `"native"` keeps the system cursor. |
| `autoplay` | `"touch"` | Ghost cursor plays the effect when nobody points. `true`, `false` or `"touch"` (touch screens only). |
| `renderer` | `"auto"` | `"auto"` uses WebGL2 when there is a GPU, else the 2D canvas; `"2d"` forces the 2D canvas. |

CSS variables: `--venom-color` (body and goo), `--venom-color-2` (rim lights and sheen), `--venom-fg` (label),
`--venom-edge` (coloured edge light on the goo; the dark theme uses it so black goo reads on a dark page).

> The scene is drawn on a canvas that overflows the button by about `max(sense, 1.15 × maxLength + 60)` px.
> Avoid `overflow: hidden` on the direct parent, or use `overflow: clip` higher up as the demo page does.

## Performance notes

- **Sidebar never animates `width`.** The panel is always laid out at its expanded width and only
  its curved `clip-path: path()` changes (driven by one Motion value, no React renders), so nothing
  reflows. `clip-path` also clips hit-testing, so the hidden part never blocks clicks. Labels
  animate `opacity`/`transform` only; groups fold with `grid-template-rows`, no measuring.
- **Glass:** the refraction map is computed once per panel size and cached; the lens is an SVG
  filter in `backdrop-filter` (bend, then blur). The drop shadow is two static, masked layers on
  their own compositor layer, cross-faded on open/close instead of re-blurred every frame.
  `prefers-reduced-transparency` gets a solid panel.
- **Active pill** uses Motion's shared layout (`layoutId`), which animates transforms.
- **Motion is lazy-loaded** with `LazyMotion` + `m` components, so animation features are split
  out of the first JS chunk. `MotionConfig reducedMotion="user"` respects the OS setting.
- **VenomButton renders with WebGL2**: the slab, goo, label and cursor are signed distance fields
  ray marched from above in one pass, shaded in a second (studio lights, heightfield shadows, AO)
  and anti-aliased in a third. The canvas covers only the button plus its reach, and the floor is
  transparent so only the shadow lands on the page. Nothing is created until the button first
  scrolls into view, shaders compile in the background (`KHR_parallel_shader_compile`), and the
  resolution steps down if a device can't keep up.
- **No GPU, no WebGL:** software rasterisers (SwiftShader, llvmpipe, WARP) and missing WebGL2 get
  the 2D canvas renderer instead (CSS body + strands on a 2D canvas), which is what CI tests by default.
- **One `requestAnimationFrame` loop** runs verlet physics for the strands (240 Hz substeps,
  volume-conserving radius, viscous rest length) and draws them (zero React re-renders per frame). Layout is read from a cached rect, refreshed on scroll/resize.
  The loop sleeps as soon as the strands settle or the button scrolls out of view
  (`IntersectionObserver`); far-away pointer moves are rejected without waking it.
- Idle bursts are scheduled with a timer while the loop sleeps, so an idle page costs nothing between bursts.
- Scroll-spy uses `IntersectionObserver`, not scroll listeners.

## Responsive & accessibility

- Phone: drawer with backdrop, swipe-left to close, `Esc`, scroll lock, focus moved inside.
- Tablet (touch): rail, tap the logo or the pin button to expand, tap outside to close.
- Desktop: hover to peek (with a 60 ms intent delay), pin to keep it open.
- Keyboard focus expands the rail on every device, including touch tablets with a keyboard; a tap does not.
- VenomButton on touch: a ghost cursor plays the effect on its own; a tap makes the strands grab the finger, then snap.
- VenomButton stays a real `<button>`: in WebGL mode its label is kept in the DOM (transparent) for
  screen readers and selection, and focus shows a ring around the slab.
- `prefers-reduced-motion`: static button, no loop or listeners; sidebar transitions are instant.
- Light, dark and system themes via `next-themes`; all colours are CSS tokens in `globals.css`.

## Testing

| Command | What runs |
| --- | --- |
| `npm test` | Vitest unit tests for the venom physics: outline geometry (pill and rounded rectangle), sense/reach thresholds, tendril cap, grab, snap and sleep, stability under erratic input, determinism. |
| `npm run test:e2e` | Playwright against the production build (`npm run build` first) on four devices: desktop 1440×900, iPad Mini, Pixel 7, iPhone SE. |
| `npm run test:all` | Lint, types, unit, build and e2e, the same as CI. |

The e2e suite covers:

- **Responsive:** no horizontal scroll, rail vs drawer per breakpoint, content clear of the rail, readable text, landscape, tap targets ≥ 24 px (WCAG 2.5.8).
- **Accessibility:** axe (WCAG 2.2 AA + best practice) in light and dark, with the navigation closed and open; heading order, landmarks, hidden decorative canvases, reduced motion.
- **Usability:** hover, pin, tap-to-open on tablets, keyboard navigation, scroll spy, drawer open/close by button, `Esc`, backdrop and swipe, scroll lock and focus.
- **Venom button:** real labelled button, canvas never blocks clicks, mouse grab and release, touch autoplay, theme switch,
  fallback to 2D without a GPU, and the WebGL renderer itself (forced on over SwiftShader and stepped
  deterministically): slab and transparent floor drawn, tendrils latch and snap, the 3D cursor appears and goes.
- **Performance budgets:** LCP < 2.5 s, CLS < 0.1, first-load JS < 250 kB compressed, idle main thread < 10 %, p95 frame < 50 ms with 4× CPU throttle, off-screen canvases stop drawing.

CI (`.github/workflows/ci.yml`) runs all of it on every pull request. If you already have Chromium installed, point the tests at it with `PW_CHROMIUM_PATH=/path/to/chrome`.

## References

The venom button recreates the effect from the reel by xitij / exteestudio
([repo](https://github.com/exteestudio/venom-button), MIT, [live demo](https://exteestudio.github.io/venom-button/)).
The WebGL renderer (`venom-gl.ts`, `venom-shaders.ts`) is adapted from that repo's engine, with its
Figma cursor icons: physics, SDF ray march and studio shading, reworked to live inside a page
(transparent floor, rounded-rect slab, CSS colours and themes, sleeping loop, lazy start, 2D fallback).
The 2D fallback (`venom-sim.ts`, `venom-draw.ts`) is a separate implementation with original glove artwork.
The sidebar recreates the look of the "Curved Sidebar" reel by code.xr (glass slab, refraction,
profile, tree of sub-items, sliding glass pill, bulletin card) from the video alone; code, gem
artwork and copy are original.
