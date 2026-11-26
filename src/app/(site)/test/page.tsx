import { pageMetadata } from "@/site/pages";
import { Showcase } from "./showcase";

export const metadata = pageMetadata("lab");

/** The component showcase: curved glass sidebar and venom button on a neutral landing page. */
export default function TestPage() {
  return <Showcase />;
}
