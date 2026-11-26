import type { Metadata } from "next";
import { PAGES } from "@/site/pages";
import { PeekingCat, ToonScreen, toonButton } from "./_components/toon-screen";

export const metadata: Metadata = { title: "Page not found" };

/** Any unknown address: the cat knows the way back. A server component with no client code. */
export default function NotFound() {
  return (
    <ToonScreen
      code="404"
      title="This page wandered off"
      art={<PeekingCat />}
      actions={
        <a href={PAGES.home.href} className={toonButton("bg-[#ffd447]")}>
          Take me home
        </a>
      }
    >
      Nothing lives at this address. The cat knows the way back to every page.
    </ToonScreen>
  );
}
