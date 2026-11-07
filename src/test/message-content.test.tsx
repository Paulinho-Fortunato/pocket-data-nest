import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageContent } from "../components/MessageContent";

// Keep the copy-button test dependency-free: dispatch a real DOM click.
const fireClick = (element: Element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
};

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MessageContent", () => {
  it("renders common markdown", async () => {
    render(<MessageContent content={"# Título\n\nTexto **forte** e *itálico*."} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Título");
    expect(await screen.findByText("forte")).toBeInTheDocument();
  });

  it("renders GFM tables with a scrollable wrapper", async () => {
    const { container } = render(
      <MessageContent content={"| Nome | Nota |\n| --- | --- |\n| Ana | 18 |"} />,
    );
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Nome" })).toBeInTheDocument();
    expect(container.querySelector(".message-table-wrap")).not.toBeNull();
  });

  it("renders fenced code with language and a working copy button", async () => {
    render(<MessageContent content={"```ts\nconst a: number = 1;\n```"} />);
    expect(await screen.findByText("ts")).toBeInTheDocument();
    const button = await screen.findByRole("button", { name: /copiar bloco de código ts/i });
    fireClick(button);
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const a: number = 1;");
      expect(screen.getByRole("button", { name: /código copiado/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent(/copiado/i);
  });

  it("renders inline and display math with KaTeX", async () => {
    const { container } = render(
      <MessageContent content={"Inline \\(x^2\\) e bloco:\n\n\\[\\frac{a}{b}\\]"} />,
    );
    // KaTeX is loaded on demand; the raw formula is the fallback until then.
    await vi.waitFor(() => {
      expect(container.querySelector(".katex")).not.toBeNull();
      expect(container.querySelector(".katex-display")).not.toBeNull();
    });
  });

  it("does not crash on an incomplete math delimiter while streaming", () => {
    const { container } = render(<MessageContent content={"A fórmula é \\(x + "} isStreaming />);
    expect(container.textContent).toContain("A fórmula é x +");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("does not crash on an open code fence while streaming", () => {
    const { container } = render(<MessageContent content={"```ts\nconst a = 1"} isStreaming />);
    expect(container.querySelector(".message-code")).not.toBeNull();
    expect(container.textContent).toContain("const a = 1");
  });

  it("opens external links in a new, safe tab", async () => {
    render(<MessageContent content={"[Exemplo](https://example.com/x)"} />);
    const link = await screen.findByRole("link", { name: /exemplo/i });
    expect(link).toHaveAttribute("href", "https://example.com/x");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(/abre numa nova janela/i);
  });

  it("rejects javascript: URLs", () => {
    const { container } = render(<MessageContent content={"[mau](javascript:alert(1))"} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector(".message-link-blocked")).not.toBeNull();
  });

  it("never renders raw HTML from the model", () => {
    const { container } = render(<MessageContent content={'<img src="x" onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });
});
