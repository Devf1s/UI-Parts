# Fonts

One module per family. `next/font` preloads a family on every route whose layout or page imports
it, so a family is imported only where it is rendered:

| Family           | Variable            | Imported by                                        |
| ---------------- | ------------------- | -------------------------------------------------- |
| Geist Mono       | `--font-geist-mono` | root layout (every page uses it)                   |
| Geist            | `--font-geist-sans` | `app/(site)/layout.tsx`: the portfolio and the lab |
| Fredoka          | `--font-toon`       | the index, 404 and the error page                  |
| Instrument Serif | `--font-serif`      | `app/(site)/portfolio/gallery/layout.tsx`          |

Keep one family per file: a module that declares several families attaches all of them to every
route that imports any one of them. To give a family to a subtree without adding a box, wrap it in
`<FontScope fonts={[family]}>`.
