import { FontScope } from "@/components/font-scope";
import { instrumentSerif } from "@/fonts/instrument-serif";
import "@/components/portfolio/gallery/gallery.css";

/** The Gallery's own typography and styles, so that no other page downloads them. */
export default function GalleryLayout({ children }: LayoutProps<"/portfolio/gallery">) {
  return <FontScope fonts={[instrumentSerif]}>{children}</FontScope>;
}
