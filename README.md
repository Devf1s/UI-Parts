# ui-parts

Small, production-minded UI components for a portfolio landing, built with
**Next.js (App Router) · TypeScript · Tailwind CSS v4 · Motion · next-themes**.

| Component | What it does |
| --- | --- |
| `Sidebar` | Floating rail that expands on hover (desktop), on tap (touch tablets) and turns into a swipeable drawer on phones. Shared-layout active pill, staggered labels, badges, scroll-spy friendly. |
| `VenomButton` | A button that grows a liquid, symbiote-like tendril toward the cursor, swells on hover and splashes droplets on click/tap. |

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

<VenomButton reach={160} viscosity={10} headSize={16}>Say hello</VenomButton>
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
| `reach` | `140` | px from the edge where the tendril starts reaching. |
| `tendrils` | `9` | Blobs in the strand. |
| `headSize` | `14` | Radius of the blob under the cursor. |
| `viscosity` | `9` | Goo blur radius. Higher is thicker. |
| `stiffness` | `1` | How tightly the blob follows the pointer. |
| `radius` | pill | Corner radius of the body, px. |
| `splash` | `7` | Droplets on click. `0` disables. |
| `hideCursor` | `false` | Hide the native cursor over the button. |

CSS variables: `--venom-color --venom-color-2 --venom-fg`. Set them on any parent to re-skin
(see the "Toxic" and "Carnage" variants on the demo page).

> The goo is drawn in an SVG that overflows the button by `reach` px. Avoid `overflow: hidden`
> on the direct parent, or use `overflow: clip` higher up as the demo page does.

## Performance notes

- **Sidebar never animates `width`.** The panel is always laid out at its expanded width and only
  its `clip-path` changes, so nothing reflows. `clip-path` also clips hit-testing, so the hidden
  part never blocks clicks. Labels animate `opacity`/`transform` only.
- **Active pill** uses Motion's shared layout (`layoutId`), which animates transforms.
- **Motion is lazy-loaded** with `LazyMotion` + `m` components, so animation features are split
  out of the first JS chunk. `MotionConfig reducedMotion="user"` respects the OS setting.
- **VenomButton runs one `requestAnimationFrame` loop** that writes SVG attributes directly
  (zero React re-renders per frame), reads layout at most once per frame from a cached rect,
  and goes to sleep as soon as the goo settles or the button scrolls out of view
  (`IntersectionObserver`). Far-away pointer moves are rejected without waking the loop.
- The goo filter covers only the button plus `reach`, never the whole viewport.
- Scroll-spy uses `IntersectionObserver`, not scroll listeners.

## Responsive & accessibility

- Phone: drawer with backdrop, swipe-left to close, `Esc`, scroll lock, focus moved inside.
- Tablet (touch): rail, tap the logo or the pin button to expand, tap outside to close.
- Desktop: hover to peek (with a 60 ms intent delay), pin to keep it open, keyboard focus expands it.
- VenomButton on touch: a tap spawns the tendril and splash at the finger, then it retracts.
- `prefers-reduced-motion`: static button, no loop or listeners; sidebar transitions are instant.
- Light, dark and system themes via `next-themes`; all colours are CSS tokens in `globals.css`.

## References

The original Instagram reels could not be opened from the build environment, so the components
follow the well-known patterns they belong to: the "metaball / gooey" SVG filter technique
(blur + alpha colour matrix) for the venom effect, and the collapsible rail + mobile drawer
pattern popularised by Linear-style dashboards and Aceternity UI's sidebar.
