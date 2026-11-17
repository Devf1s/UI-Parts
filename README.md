# ui-parts

Small, production-minded UI components for a portfolio landing, built with
**Next.js (App Router) · TypeScript · Tailwind CSS v4 · Motion · next-themes**.

| Component | What it does |
| --- | --- |
| `Sidebar` | Floating rail that expands on hover (desktop), on tap (touch tablets) and turns into a swipeable drawer on phones. Shared-layout active pill, staggered labels, badges, scroll-spy friendly. |
| `VenomButton` | Glossy black "symbiote" pill. Strings fizz on the edge as the cursor nears, 2–6 tendrils lunge out and coil around the cursor (a cartoon glove), stretch, bead and web together as you pull, then pinch off and recoil. Idle bursts keep it alive. |

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
  sections={[{ title: "Portfolio", items: [{ id: "home", label: "Home", href: "#home", icon: <Home /> }] }]}
  activeId={active}
  onNavigate={(item) => setActive(item.id)}
  brand={{ logo: <Logo />, name: "Your Name", subtitle: "Frontend developer" }}
  footer={({ open }) => <UserCard compact={!open} />}
/>

<VenomButton tendrils={6} reach={140}>let’s collaborate</VenomButton>
```

### Sidebar props

| Prop | Default | Notes |
| --- | --- | --- |
| `sections` | — | `{ title?, items: { id, label, href, icon, badge? }[] }[]` |
| `activeId` / `onNavigate` | — | Controlled active item. Pair with `useScrollSpy`. |
| `brand`, `footer` | — | `footer` may be a function of `{ open }`. |
| `collapsedWidth` / `expandedWidth` | `72` / `264` | px |
| `expandOnHover` | `true` | Only on devices with a fine pointer. |
| `defaultPinned` | `false` | Start expanded on desktop. |
| `mobileQuery` | `(max-width: 767px)` | Below it the sidebar is a drawer. |

CSS variables: `--sb-bg --sb-fg --sb-muted --sb-hover --sb-active-bg --sb-active-fg --sb-radius --sb-ease --sb-duration`.

### VenomButton props

All native `<button>` props, plus:

| Prop | Default | Notes |
| --- | --- | --- |
| `tendrils` | `6` | Max tendrils at once, one per finger/wrist (1–6). 2 launch at the edge of reach, more as you get closer. |
| `sense` | `220` | Distance from the edge where surface strings start to fizz, px. |
| `reach` | `120` | Distance from the edge where tendrils launch, px. |
| `maxLength` | `170` | A held tendril always snaps past this length, px. |
| `snapStretch` | `1.6` | A held tendril snaps past this stretch ratio (rest length creeps up slowly, so slow pulls stretch further). |
| `lunge` | `1` | Lunge speed multiplier. |
| `thickness` | `1` | Strand thickness multiplier. |
| `gravity` | `320` | Sag, px/s². |
| `radius` | pill | Corner radius of the body, px. |
| `splash` | `6` | Ink droplets on click. `0` disables. |
| `idle` | `true` | Small bursts of strings every ~2 s while nobody is near (woken by a timer, no running loop). |
| `cursor` | `"glove"` | `"glove"` morphs the cursor into a cartoon glove while it is caught; `"native"` keeps the system cursor. |
| `autoplay` | `"touch"` | Ghost glove plays the effect when nobody points. `true`, `false` or `"touch"` (touch screens only). |

CSS variables: `--venom-color` (body and ink), `--venom-color-2` (highlight), `--venom-fg` (label),
`--venom-edge` (outline around strands, used in dark theme so ink reads on a dark page).

> The strands are drawn on a canvas that overflows the button by `max(reach, sense)` px. Avoid
> `overflow: hidden` on the direct parent, or use `overflow: clip` higher up as the demo page does.

## Performance notes

- **Sidebar never animates `width`.** The panel is always laid out at its expanded width and only
  its `clip-path` changes, so nothing reflows. `clip-path` also clips hit-testing, so the hidden
  part never blocks clicks. Labels animate `opacity`/`transform` only.
- **Active pill** uses Motion's shared layout (`layoutId`), which animates transforms.
- **Motion is lazy-loaded** with `LazyMotion` + `m` components, so animation features are split
  out of the first JS chunk. `MotionConfig reducedMotion="user"` respects the OS setting.
- **VenomButton body is pure CSS** (gradients, inset shadows, a blurred specular pseudo-element).
  Only the strands are drawn, on a 2D canvas sized to the button plus reach.
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
- VenomButton on touch: a ghost glove plays the effect on its own; a tap makes the strands grab the finger, then snap.
- `prefers-reduced-motion`: static button, no loop or listeners; sidebar transitions are instant.
- Light, dark and system themes via `next-themes`; all colours are CSS tokens in `globals.css`.

## Testing

| Command | What runs |
| --- | --- |
| `npm test` | Vitest unit tests for the venom physics: outline geometry, sense/reach thresholds, tendril cap, grab, snap and sleep, stability under erratic input, determinism. |
| `npm run test:e2e` | Playwright against the production build (`npm run build` first) on four devices: desktop 1440×900, iPad Mini, Pixel 7, iPhone SE. |
| `npm run test:all` | Lint, types, unit, build and e2e, the same as CI. |

The e2e suite covers:

- **Responsive:** no horizontal scroll, rail vs drawer per breakpoint, content clear of the rail, readable text, landscape, tap targets ≥ 24 px (WCAG 2.5.8).
- **Accessibility:** axe (WCAG 2.2 AA + best practice) in light and dark, with the navigation closed and open; heading order, landmarks, hidden decorative canvases, reduced motion.
- **Usability:** hover, pin, tap-to-open on tablets, keyboard navigation, scroll spy, drawer open/close by button, `Esc`, backdrop and swipe, scroll lock and focus.
- **Venom button:** real labelled button, canvas never blocks clicks, mouse grab and release, touch autoplay, theme switch.
- **Performance budgets:** LCP < 2.5 s, CLS < 0.1, first-load JS < 250 kB compressed, idle main thread < 10 %, p95 frame < 50 ms with 4× CPU throttle, off-screen canvases stop drawing.

CI (`.github/workflows/ci.yml`) runs all of it on every pull request. If you already have Chromium installed, point the tests at it with `PW_CHROMIUM_PATH=/path/to/chrome`.

## References

The venom button recreates the effect from the reel by xitij / exteestudio
([repo](https://github.com/exteestudio/venom-button), MIT, [live demo](https://exteestudio.github.io/venom-button/)).
Behaviour and numbers (launch distances, lunge spring, volume conservation, viscous flow, 1.6× snap,
beads, webs, finger wraps, idle bursts) follow its documentation; the code here is a separate
implementation for this stack: a 2D canvas instead of ray-marched WebGL, a CSS body, and original glove artwork.
The sidebar follows the collapsible rail + mobile drawer pattern of Linear-style dashboards.
