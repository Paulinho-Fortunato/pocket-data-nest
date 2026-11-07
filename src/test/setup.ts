import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom 20 ships File/Blob without `.text()`. Browsers have had it for years, so
// the app keeps using the standard API and the test environment gets a shim.
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Object.defineProperty(Blob.prototype, "text", {
    configurable: true,
    writable: true,
    value: function text(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o Blob."));
        reader.readAsText(this);
      });
    },
  });
}

// jsdom's File also lacks `.arrayBuffer()`; the upload pipeline uses it to hash bytes.
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o Blob."));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
