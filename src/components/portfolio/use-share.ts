"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ShareStatus = "idle" | "shared" | "copied" | "failed";

type Nav = Pick<Navigator, "share" | "canShare" | "clipboard"> | undefined;

/** Native share sheet where the browser has one for this data, otherwise the clipboard. */
export function shareMethod(nav: Nav, data: ShareData): "native" | "clipboard" | "none" {
  if (nav?.share && (!nav.canShare || nav.canShare(data))) return "native";
  if (nav?.clipboard?.writeText) return "clipboard";
  return "none";
}

function legacyCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/**
 * Shares the current page (or `url`). Status resets after a few seconds so a live region can
 * announce "Link copied" every time.
 */
export function useShare({ title, text, url }: { title: string; text?: string; url?: string }) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const share = useCallback(async () => {
    const data: ShareData = { title, text, url: url ?? window.location.href };
    const set = (s: ShareStatus) => {
      setStatus(s);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus("idle"), 2600);
    };
    const method = shareMethod(typeof navigator === "undefined" ? undefined : navigator, data);
    if (method === "native") {
      try {
        await navigator.share(data);
        set("shared");
        return;
      } catch (err) {
        // the user closed the sheet: nothing to report
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(data.url!);
      set("copied");
    } catch {
      set(legacyCopy(data.url!) ? "copied" : "failed");
    }
  }, [title, text, url]);

  return { share, status };
}

export const shareMessage: Record<ShareStatus, string> = {
  idle: "",
  shared: "Thanks for sharing!",
  copied: "Link copied to the clipboard",
  failed: "Could not copy the link",
};
