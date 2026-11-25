"use client";

import { useEffect } from "react";
import { PAGES } from "@/site/pages";
import { ToonScreen, toonButton } from "./_components/toon-screen";

/**
 * A page that failed to render: try it again, or go back to the index. The way home is a plain
 * link, so it also recovers from a broken client state with a fresh load.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <ToonScreen
      code="Oops"
      title="Something broke"
      actions={
        <>
          <button type="button" onClick={() => retry()} className={toonButton("bg-[#8be37a]")}>
            Try again
          </button>
          <a href={PAGES.home.href} className={toonButton("bg-[#ffd447]")}>
            Take me home
          </a>
        </>
      }
    >
      This page fell over while drawing itself. Trying again usually helps.
      {digest && <span className="mt-2 block font-mono text-xs">ref {digest}</span>}
    </ToonScreen>
  );
}
