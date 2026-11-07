import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiLogo } from "@/components/AiLogo";

describe("AiLogo", () => {
  it("is a CSS-only mark with four colour orbs and two eyes", () => {
    const { container } = render(<AiLogo />);
    const mark = container.querySelector(".ai-logo");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".ai-logo__ball")).toHaveLength(4);
    expect(container.querySelectorAll(".ai-logo__eye")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
  });

  it("exposes an accessible name only when it carries meaning", () => {
    const { rerender } = render(<AiLogo label="Assistente de estudo" />);
    expect(screen.getByRole("img", { name: "Assistente de estudo" })).toBeInTheDocument();

    rerender(<AiLogo />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("scales and opts into motion explicitly", () => {
    const { container } = render(<AiLogo size="3.25rem" animated interactive />);
    const mark = container.querySelector(".ai-logo") as HTMLElement;
    expect(mark.style.getPropertyValue("--ai-logo-size")).toBe("3.25rem");
    expect(mark).toHaveAttribute("data-animated", "true");
    expect(mark).toHaveAttribute("data-interactive", "true");
  });
});
