import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const styles = read("src/styles.css");
const animations = read("src/styles/animations.css");
const root = read("src/routes/__root.tsx");
const aiInput = read("src/components/AIInput.tsx");
const tutor = read("src/routes/tutor.tsx");
const shell = read("src/components/AppShell.tsx");

/**
 * Regression guards for the responsive/a11y audit. These assert the *rules*
 * that were added or corrected, so a future change cannot silently bring back
 * fixed viewport heights, missing safe areas or tiny touch targets.
 */
describe("Responsive and accessibility rules", () => {
  it("keeps every safe-area inset available as a token", () => {
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(styles).toContain(`env(safe-area-inset-${side}`);
    }
    expect(styles).toContain("--tap-min: 2.75rem");
  });

  it("never locks the viewport height with 100vh or a screen unit", () => {
    expect(styles).not.toMatch(/\b\d+vh\b/);
    expect(styles).not.toContain("min-h-screen");
    expect(styles).toContain("100svh");
    expect(tutor).not.toContain("calcdvh");
    expect(tutor).not.toContain("min-h-[520px]");
  });

  it("prevents the document from scrolling horizontally", () => {
    expect(styles).toMatch(/body\s*{[\s\S]*?overflow-x:\s*clip/);
    expect(styles).toMatch(/\.app-frame\s*{[\s\S]*?overflow-x:\s*clip/);
  });

  it("reserves space for the bottom navigation plus the home indicator", () => {
    expect(styles).toMatch(
      /\.app-frame\s*{[\s\S]*?padding-bottom:\s*calc\(var\(--shell-tabbar-h\) \+ var\(--shell-safe-bottom\)/,
    );
    expect(animations).toMatch(/\.tabbar\s*{[\s\S]*?min-height:\s*calc\(var\(--shell-tabbar-h\)/);
  });

  it("gives touch pointers a minimum 44px target and visible focus", () => {
    expect(styles).toMatch(/@media \(pointer: coarse\)\s*{[\s\S]*?min-height:\s*var\(--tap-min\)/);
    expect(styles).toContain("--focus-outline: 2px solid var(--color-ring)");
    expect(animations).toContain(".tabbar a:focus-visible");
  });

  it("scrolls wide content inside its own block, never the page", () => {
    expect(styles).toMatch(/\.message-table-wrap\s*{[\s\S]*?overflow-x:\s*auto/);
    expect(styles).toMatch(/\.message-code-block\s*{[\s\S]*?overflow-x:\s*auto/);
    expect(styles).toMatch(/\.message-content \.katex-display\s*{[\s\S]*?overflow-x:\s*auto/);
    expect(styles).toMatch(/\.chat-suggestions\s*{[\s\S]*?overflow-x:\s*auto/);
  });

  it("keeps the tutor composer inside the viewport with the virtual keyboard", () => {
    expect(styles).toMatch(/\.tutor-panel\s*{[\s\S]*?100svh/);
    expect(styles).toMatch(/@supports \(height: 100dvh\)/);
    expect(styles).toContain(".tutor-scroll");
    expect(styles).toContain(".tutor-composer");
    // 16px avoids iOS zooming the page when the textarea gets focus
    expect(styles).toMatch(/\.ai-input \.chat-field\s*{[\s\S]*?font-size:\s*1rem/);
  });

  it("respects reduced motion and removed the marquee animation", () => {
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).not.toContain("scroll-marquee-left");
    expect(styles).not.toContain("chat-marquee");
  });

  it("uses the documented dark + gold identity", () => {
    expect(styles).toMatch(/--primary:\s*oklch\(0\.79 0\.135 85\)/);
    expect(styles).toMatch(/--sidebar-primary:\s*oklch\(0\.79 0\.135 85\)/);
  });

  it("exposes navigation state to assistive technology", () => {
    expect(shell).toContain('className="skip-link"');
    expect(shell).toContain('id="conteudo"');
    expect(shell).toContain("aria-current");
    expect(shell).toContain('role="dialog"');
    expect(shell).toContain("aria-expanded={moreOpen}");
    expect(shell).toContain('aria-controls={moreOpen ? "mais-navegacao" : undefined}');
    expect(aiInput).toContain("aria-describedby");
    expect(aiInput).toContain("aria-expanded={appendixOpen}");
    expect(aiInput).toContain('aria-controls={appendixOpen ? "anexos" : undefined}');
    expect(aiInput).not.toContain("user-select");
  });

  it("allows browser zoom and covers the notch area", () => {
    expect(root).toContain("viewport-fit=cover");
    expect(root).not.toContain("user-scalable=no");
    expect(root).not.toContain("maximum-scale");
  });
});
