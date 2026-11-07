import { useEffect, type ReactNode } from "react";

/**
 * Full-height chat shell.
 *
 * Layout is a flex column inside `main`: header (auto) → message list (the only
 * scroll area) → composer (auto). Nothing is absolutely positioned over the
 * conversation, so the composer can't be hidden behind the bottom navigation.
 *
 * On browsers with `visualViewport` (iOS Safari), the frame height follows the
 * visible viewport while the keyboard is open and the bottom nav slides away.
 */
export function TutorShell({
  header,
  list,
  composer,
  overlays,
}: {
  header: ReactNode;
  list: ReactNode;
  composer: ReactNode;
  overlays?: ReactNode;
}) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const frame = document.querySelector<HTMLElement>(".app-frame");
    if (!viewport || !frame) return;

    const update = () => {
      const height = Math.round(viewport.height);
      frame.style.setProperty("--tutor-viewport-height", `${height}px`);
      // ~140 px is smaller than any real keyboard, larger than browser chrome.
      const keyboardOpen = height < window.innerHeight - 140;
      frame.dataset["keyboard"] = keyboardOpen ? "open" : "closed";
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      delete frame.dataset["keyboard"];
      frame.style.removeProperty("--tutor-viewport-height");
    };
  }, []);

  return (
    <div className="tutor-app">
      {header}
      {list}
      {composer}
      {overlays}
    </div>
  );
}
