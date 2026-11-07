import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;

type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  orientation: string;
  theme_color: string;
  background_color: string;
  lang: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

const manifest = readJson<Manifest>("public/manifest.webmanifest");
const sw = read("public/sw.js");
const offline = read("public/offline.html");
const root = read("src/routes/__root.tsx");

function pngSize(path: string): [number, number] {
  const buffer = readFileSync(resolve(process.cwd(), path));
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe("web app manifest", () => {
  it("is installable in standalone mode with a scope and start url", () => {
    expect(manifest.start_url.startsWith("/")).toBe(true);
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toContain("standalone");
    expect(manifest.orientation).toBeTruthy();
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.lang).toBe("pt-PT");
  });

  it("ships 192, 512 and maskable icons at their real sizes", () => {
    for (const src of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) {
      const icon = manifest.icons.find((item) => item.src === src);
      expect(icon, `${src} missing from manifest`).toBeDefined();
      const [width, height] = pngSize(`public${src}`);
      expect(icon?.sizes).toBe(`${width}x${height}`);
      expect(icon?.type).toBe("image/png");
    }
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === "any")).toBe(true);
    expect(manifest.icons.some((icon) => icon.type === "image/svg+xml")).toBe(true);
    // iOS icon is linked from the document, not from the manifest.
    expect(pngSize("public/icons/apple-touch-icon.png")).toEqual([180, 180]);
  });

  it("links the new vector AI mark as the favicon", () => {
    expect(root).toContain('href: "/favicon.svg"');
    expect(root).toContain('href: "/favicon.ico"');
    const favicon = read("public/favicon.svg");
    expect(favicon).toContain("<svg");
    expect(favicon).toContain("#9147ff");
    expect(favicon).toContain("#05e0f5");
    expect(favicon).toContain('aria-label="AngoStudy"');
    expect(read("public/icons/ai-orb.svg")).toBe(favicon);

    expect(pngSize("public/icons/favicon-32.png")).toEqual([32, 32]);
    const ico = readFileSync(resolve(process.cwd(), "public/favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThan(0);
  });
});

describe("service worker safety", () => {
  it("never caches AI, API or non-GET requests", () => {
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("NEVER_CACHE");
    expect(sw).toMatch(/openrouter/);
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).not.toMatch(/cache\.put\([^)]*request\.url[^)]*\)/);
  });

  it("supports a controlled update and an honest offline fallback", () => {
    expect(sw).toContain("SKIP_WAITING");
    expect(sw).toContain("angostudy-3.1.0");
    expect(sw).toContain("/offline.html");
    expect(sw).toContain('caches.match("/offline.html")');
  });

  it("offline page explains what still works and what needs internet", () => {
    expect(offline).toContain("offline");
    expect(offline).toMatch(/IA|tutor/i);
    expect(offline).toMatch(/internet/i);
    expect(offline).toMatch(/cartões|documentos|notas/i);
  });
});

describe("root document wiring", () => {
  it("links the manifest, apple icons and splash screens", () => {
    expect(root).toContain('rel: "manifest"');
    expect(root).toContain("/manifest.webmanifest");
    expect(root).toContain('rel: "apple-touch-icon"');
    expect(root).toContain("apple-touch-startup-image");
    expect(root).toContain("apple-mobile-web-app-capable");
  });

  it("applies the theme before paint and registers the worker", () => {
    expect(root).toContain("preferencesBootScript()");
    expect(root).toContain("registerServiceWorker()");
    expect(root).toContain("resolveTheme(preferences.theme)");
    expect(root).toContain('id="theme-color-meta"');
    expect(root).not.toContain('className="dark"');
  });
});
