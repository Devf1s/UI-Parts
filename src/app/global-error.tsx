"use client";

/**
 * Last resort, when the root layout itself fails: it replaces the whole document, so it carries
 * its own minimal styles (the app's stylesheet and fonts are not loaded here).
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#fff6e6", color: "#1b1530", font: "500 1.05rem/1.5 system-ui, sans-serif" }}>
        <title>Something broke · Devf1s</title>
        <main style={{ maxWidth: "26rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "2.25rem", margin: "0 0 0.5rem" }}>Something broke</h1>
          <p style={{ margin: "0 0 1.5rem" }}>The site could not start. Trying again usually helps.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ font: "inherit", fontWeight: 700, padding: "0.7rem 1.4rem", border: "3px solid #1b1530", borderRadius: 16, background: "#ffd447", boxShadow: "0 4px 0 #1b1530", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
