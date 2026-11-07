import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AttachmentPreview } from "@/components/tutor/AttachmentPreview";
import { ChatComposer } from "@/components/tutor/ChatComposer";
import { GenerationStatus } from "@/components/tutor/GenerationStatus";
import { MessageList } from "@/components/tutor/MessageList";

const listProps = {
  streamingId: null,
  busy: false,
  speechRate: 1,
  speechLang: "pt-PT",
  showSuggestions: true,
  onRegenerate: vi.fn(),
  onRetry: vi.fn(),
  onSuggestion: vi.fn(),
};

describe("full-screen tutor UI", () => {
  it("starts from an empty conversation with the documented suggestions", () => {
    const onSuggestion = vi.fn();
    render(<MessageList messages={[]} {...listProps} onSuggestion={onSuggestion} />);
    expect(
      screen.getByRole("heading", { name: /Em que posso ajudar a estudar/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Explica de forma simples/ }));
    expect(onSuggestion).toHaveBeenCalledWith(expect.stringContaining("Explica este conceito"));
  });

  it("hides suggestions when the preference is off", () => {
    render(<MessageList messages={[]} {...listProps} showSuggestions={false} />);
    expect(screen.queryByRole("button", { name: /Plano de estudo/ })).not.toBeInTheDocument();
  });

  it("marks the streaming answer and keeps the partial text visible", () => {
    render(
      <MessageList
        messages={[
          { id: "a", role: "assistant", content: "A resposta parcial", createdAt: Date.now() },
        ]}
        {...listProps}
        streamingId="a"
      />,
    );
    expect(screen.getByRole("article", { name: /Resposta do tutor/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByText("A resposta parcial")).toBeInTheDocument();
    expect(screen.getByText(/A resposta está a ser escrita/)).toBeInTheDocument();
  });

  it("offers a retry for recoverable errors and keeps the text", () => {
    const onRetry = vi.fn();
    render(
      <MessageList
        messages={[
          {
            id: "e1",
            role: "assistant",
            content: "Texto já recebido antes da falha.",
            createdAt: Date.now(),
            error: { message: "A ligação caiu.", retryable: true },
          },
        ]}
        {...listProps}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Texto já recebido antes da falha.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente a resposta/ }));
    expect(onRetry).toHaveBeenCalledWith("e1");
  });

  it("only shows “jump to latest” when the reader scrolled away", async () => {
    const { rerender } = render(
      <MessageList
        messages={[
          { id: "u1", role: "user", content: "Olá", createdAt: Date.now() },
          { id: "a1", role: "assistant", content: "Olá!", createdAt: Date.now() },
        ]}
        {...listProps}
      />,
    );
    const region = screen.getByRole("region", { name: "Conversa" });
    Object.defineProperty(region, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(region, "clientHeight", { configurable: true, value: 500 });
    region.scrollTo = vi.fn();

    region.scrollTop = 3000 - 500;
    fireEvent.scroll(region);
    expect(
      screen.queryByRole("button", { name: /Ir para o mais recente/ }),
    ).not.toBeInTheDocument();

    region.scrollTop = 0;
    fireEvent.scroll(region);
    rerender(
      <MessageList
        messages={[
          { id: "u1", role: "user", content: "Olá", createdAt: Date.now() },
          { id: "a1", role: "assistant", content: "Olá!", createdAt: Date.now() },
          { id: "a2", role: "assistant", content: "Mais uma resposta.", createdAt: Date.now() },
        ]}
        {...listProps}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ir para o mais recente/ })).toBeInTheDocument(),
    );
  });

  it("states that AI needs internet while offline and disables the composer", () => {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        onFile={vi.fn()}
        loading={false}
        disabled={false}
        offline
        suggestionList={[]}
        onPickSuggestion={vi.fn()}
        listening={false}
        onToggleMic={vi.fn()}
        voiceEnabled={false}
        onToggleVoice={vi.fn()}
        documentName={null}
        documentMeta={null}
        onOpenDocument={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/O tutor precisa de internet/);
    expect(screen.getByPlaceholderText(/Sem ligação/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("shows honest document progress with a cancel action", () => {
    const onCancel = vi.fn();
    render(
      <AttachmentPreview
        file={{ name: "apontamentos.pdf", size: 2_400_000, type: "application/pdf" }}
        progress={{
          stage: "pages",
          label: "A processar páginas",
          pagesDone: 3,
          totalPages: 12,
          chars: 18_500,
          percent: 25,
        }}
        record={null}
        error={null}
        cancelled={false}
        scanned={false}
        onCancel={onCancel}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );
    expect(screen.getByText("apontamentos.pdf")).toBeInTheDocument();
    expect(screen.getByText(/3\/12 páginas/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows a stop action while preparing or using a tool, never an endless spinner", () => {
    const onStop = vi.fn();
    const { rerender } = render(
      <GenerationStatus state="preparing" label="A procurar no documento…" onStop={onStop} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Parar resposta" }));
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(<GenerationStatus state="streaming" label="A escrever…" onStop={onStop} />);
    expect(screen.getByRole("button", { name: "Parar resposta" })).toBeInTheDocument();

    rerender(
      <GenerationStatus state="error" label="Não foi possível concluir" onRetry={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar resposta" })).not.toBeInTheDocument();

    rerender(<GenerationStatus state="idle" label="" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("labels a scanned PDF as probable scan instead of ready", () => {
    render(
      <AttachmentPreview
        file={{ name: "digitalizado.pdf", size: 900_000, type: "application/pdf" }}
        progress={null}
        record={null}
        error="Este PDF não tem camada de texto — é provavelmente uma digitalização."
        cancelled={false}
        scanned
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onOpenDocument={vi.fn()}
        onManualPaste={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/digitalização/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pronto a usar/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Colar texto/i })).toBeInTheDocument();
  });
});
