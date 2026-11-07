import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AIInput } from "@/components/AIInput";

function Harness({ onSubmit = () => {} }: { onSubmit?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <AIInput
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      suggestions={["Explica este conceito", "Faz um resumo"]}
      hint="Enter envia · Shift + Enter nova linha"
    />
  );
}

describe("AIInput composer", () => {
  it("renders suggestions as real buttons inside a scrollable list", () => {
    render(<Harness />);

    const suggestions = screen.getByRole("list", { name: "Sugestões rápidas" });
    expect(suggestions).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Explica este conceito" });
    fireEvent.click(chip);
    expect(screen.getByLabelText("Mensagem para o tutor")).toHaveValue("Explica este conceito ");
  });

  it("labels the textarea and ties the hint to it", () => {
    render(<Harness />);

    const field = screen.getByLabelText("Mensagem para o tutor");
    expect(field).toHaveAttribute("aria-describedby", "chat-input-hint");
    const hint = document.getElementById("chat-input-hint");
    expect(hint).toHaveTextContent("Enter envia · Shift + Enter nova linha");
  });

  it("opens the attach bar, moves focus into it and closes with Escape", async () => {
    render(<Harness />);

    const attach = screen.getByRole("button", { name: /Anexar documento/ });
    expect(attach).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Anexar conteúdo" })).not.toBeInTheDocument();

    fireEvent.click(attach);

    const bar = await screen.findByRole("group", { name: "Anexar conteúdo" });
    expect(attach).toHaveAttribute("aria-expanded", "true");
    expect(attach).toHaveAttribute("aria-controls", "anexos");
    await waitFor(() => expect(bar.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(bar, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Anexar conteúdo" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(attach));
  });

  it("gives every control an accessible name", () => {
    render(<Harness />);

    for (const button of screen.getAllByRole("button")) {
      const name = (button.getAttribute("aria-label") ?? button.textContent ?? "").trim();
      expect(name, button.outerHTML.slice(0, 120)).not.toBe("");
    }

    for (const link of screen.queryAllByRole("link")) {
      const name = (link.getAttribute("aria-label") ?? link.textContent ?? "").trim();
      expect(name).not.toBe("");
    }
  });

  it("keeps send and stop reachable with the same accessible names", () => {
    const { rerender } = render(<AIInput value="" onChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();

    rerender(
      <AIInput value="olá" onChange={() => {}} onSubmit={() => {}} onAbort={() => {}} loading />,
    );
    expect(screen.getByRole("button", { name: "Parar resposta" })).toBeInTheDocument();
  });
});
