# ui-parts

Small, production-minded UI components for a portfolio landing, built with
**Next.js (App Router) · TypeScript · Tailwind CSS v4 · Motion · next-themes**.

| Component | What it does |
| --- | --- |
| `Sidebar` | Floating rail that expands on hover (desktop), on tap (touch tablets) and turns into a swipeable drawer on phones. Shared-layout active pill, staggered labels, badges, scroll-spy friendly. |
| `VenomButton` | Glossy black "symbiote" pill. A bundle of thin ink strands lunges at the cursor (a cartoon glove), grabs it, sags while you drag, and snaps strand by strand when you pull away. |

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build + type check
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

<VenomButton reach={240} tendrils={20}>let’s collaborate</VenomButton>
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
| `reach` | `230` | A held strand snaps once stretched past this length, px. |
| `sense` | `170` | How close to the edge the cursor must come to wake the strands, px. |
| `tendrils` | `16` | Strands in the bundle (max 40). |
| `thickness` | `1` | Strand thickness multiplier. |
| `gravity` | `0.32` | Sag and drip. |
| `stiffness` | `1` | Lunge/follow speed. |
| `radius` | pill | Corner radius of the body, px. |
| `splash` | `10` | Ink droplets on click. `0` disables. |
| `cursor` | `"glove"` | `"glove"` swaps the cursor for a cartoon glove near the button, `"native"` keeps it. |
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
- **One `requestAnimationFrame` loop** runs verlet physics for the strands and draws them
  (zero React re-renders per frame). Layout is read from a cached rect, refreshed on scroll/resize.
  The loop sleeps as soon as the strands settle or the button scrolls out of view
  (`IntersectionObserver`); far-away pointer moves are rejected without waking it.
- The body lean toward the cursor is a CSS-variable `transform`, so it stays on the compositor.
- Scroll-spy uses `IntersectionObserver`, not scroll listeners.

## Responsive & accessibility

- Phone: drawer with backdrop, swipe-left to close, `Esc`, scroll lock, focus moved inside.
- Tablet (touch): rail, tap the logo or the pin button to expand, tap outside to close.
- Desktop: hover to peek (with a 60 ms intent delay), pin to keep it open, keyboard focus expands it.
- VenomButton on touch: a ghost glove plays the effect on its own; a tap makes the strands grab the finger, then snap.
- `prefers-reduced-motion`: static button, no loop or listeners; sidebar transitions are instant.
- Light, dark and system themes via `next-themes`; all colours are CSS tokens in `globals.css`.

## References

The venom button recreates the effect from the reel by xitij (exteestudio,
[live demo](https://exteestudio.github.io/venom-button/)). The implementation here is written
from scratch for this stack: verlet ropes on a 2D canvas, CSS body, original glove artwork.
The sidebar follows the collapsible rail + mobile drawer pattern of Linear-style dashboards.
