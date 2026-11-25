import { FontScope } from "@/components/font-scope";
import { geistSans } from "@/fonts/geist";

/** The portfolio and the UI parts lab: Geist UI type. The cartoon pages outside this group never download it. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <FontScope fonts={[geistSans]} className="font-sans">
      {children}
    </FontScope>
  );
}
