import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/components/AppShell";

function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>conteúdo inicial</p>,
  });
  const tutorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tutor",
    component: () => <p>conteúdo do tutor</p>,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, tutorRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

async function renderShell() {
  const router = buildRouter();
  render(<RouterProvider router={router} />);
  await screen.findByText("conteúdo inicial");
  return router;
}

describe("AppShell navigation", () => {
  it("exposes a skip link targeting the main landmark", async () => {
    await renderShell();

    const skip = screen.getByRole("link", { name: "Saltar para o conteúdo" });
    expect(skip).toHaveAttribute("href", "#conteudo");
    expect(screen.getByRole("main")).toHaveAttribute("id", "conteudo");
  });

  it("marks the current tab for assistive technology", async () => {
    await renderShell();

    const home = screen.getAllByRole("link", { name: "Início" })[0]!;
    expect(home).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
  });

  it("gives every navigation control an accessible name", async () => {
    await renderShell();

    for (const button of screen.getAllByRole("button")) {
      const name = (button.getAttribute("aria-label") ?? button.textContent ?? "").trim();
      expect(name, button.outerHTML.slice(0, 120)).not.toBe("");
    }

    for (const link of screen.getAllByRole("link")) {
      const name = (link.getAttribute("aria-label") ?? link.textContent ?? "").trim();
      expect(name).not.toBe("");
    }
  });

  it("opens the 'Mais' sheet as a dialog and returns focus on Escape", async () => {
    await renderShell();

    const more = screen.getByRole("button", { name: "Mais opções" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);

    const sheet = await screen.findByRole("dialog", { name: "Mais opções de navegação" });
    expect(screen.getByRole("navigation", { name: "Mais navegação" })).toBeInTheDocument();
    expect(sheet).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(more).toHaveAttribute("aria-controls", "mais-navegacao");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(more).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});
