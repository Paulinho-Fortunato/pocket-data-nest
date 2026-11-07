import { useEffect, useState, type ReactNode } from "react";
import {
  Download,
  Gauge,
  MonitorSmartphone,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACCENT_LABELS, usePreferences, type Accent } from "@/lib/preferences";
import { formatMs, getMetricsSnapshot, resetMetrics, type MetricRow } from "@/lib/metrics";
import {
  registerServiceWorker,
  useInstallPrompt,
  useOnlineStatus,
  useServiceWorker,
} from "@/lib/pwa";
import { demoCards, demoCardsFor, isDemoCard, useCards } from "@/lib/store";

const ACCENTS: Accent[] = ["dourado", "azul", "verde", "violeta", "rosa"];

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="switch-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

/**
 * Personalization, PWA install/update and measured performance.
 *
 * Every option is persisted in a versioned schema and applied through
 * `data-*` attributes on `<html>` (see `lib/preferences.ts`), so it works
 * offline and never leaves inline styles scattered through components.
 */
export function PersonalizationPanel() {
  const { preferences, update, reset } = usePreferences();
  const online = useOnlineStatus();
  const install = useInstallPrompt();
  const serviceWorker = useServiceWorker();
  const [cards, setCards] = useCards();
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const demoCount = demoCardsFor(cards).length;

  useEffect(() => {
    setMetrics(getMetricsSnapshot());
  }, []);

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="personalizacao-titulo">
      <div className="flex items-center gap-2">
        <Palette className="size-5 text-primary" aria-hidden="true" />
        <h2 id="personalizacao-titulo" className="font-semibold">
          Personalização
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Aplicado imediatamente, guardado neste dispositivo e disponível offline. Respeita as
        preferências do sistema (tema claro/escuro e movimento reduzido).
      </p>

      <div className="settings-section">
        <h3 className="text-sm font-semibold">Aparência</h3>

        <Row title="Tema" description="Automático segue o sistema.">
          <select
            className="settings-select"
            value={preferences.theme}
            aria-label="Tema"
            onChange={(event) => update({ theme: event.target.value as typeof preferences.theme })}
          >
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
            <option value="auto">Automático</option>
          </select>
        </Row>

        <Row title="Cor de destaque">
          <div className="accent-swatches" role="group" aria-label="Cor de destaque">
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                className="accent-swatch"
                data-accent-color={accent}
                aria-pressed={preferences.accent === accent}
                aria-label={`Destaque ${ACCENT_LABELS[accent]}`}
                title={ACCENT_LABELS[accent]}
                onClick={() => update({ accent })}
              />
            ))}
          </div>
        </Row>

        <Row
          title="Contraste"
          description="O modo elevado aumenta o contraste do texto secundário."
        >
          <select
            className="settings-select"
            value={preferences.contrast}
            aria-label="Contraste"
            onChange={(event) =>
              update({ contrast: event.target.value as typeof preferences.contrast })
            }
          >
            <option value="normal">Normal (AA)</option>
            <option value="alto">Elevado</option>
          </select>
        </Row>

        <Row title="Tamanho do texto">
          <select
            className="settings-select"
            value={preferences.fontSize}
            aria-label="Tamanho do texto"
            onChange={(event) =>
              update({ fontSize: event.target.value as typeof preferences.fontSize })
            }
          >
            <option value="pequeno">Pequeno</option>
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </select>
        </Row>

        <Row title="Densidade" description="Espaçamento entre cartões, listas e mensagens.">
          <select
            className="settings-select"
            value={preferences.density}
            aria-label="Densidade"
            onChange={(event) =>
              update({ density: event.target.value as typeof preferences.density })
            }
          >
            <option value="compacta">Compacta</option>
            <option value="confortavel">Confortável</option>
            <option value="espacosa">Espaçosa</option>
          </select>
        </Row>

        <Row title="Largura do conteúdo">
          <select
            className="settings-select"
            value={preferences.contentWidth}
            aria-label="Largura do conteúdo"
            onChange={(event) =>
              update({ contentWidth: event.target.value as typeof preferences.contentWidth })
            }
          >
            <option value="estreita">Estreita</option>
            <option value="padrao">Padrão</option>
            <option value="larga">Larga</option>
          </select>
        </Row>

        <Row
          title="Animações"
          description="Desligadas automaticamente se o sistema pedir movimento reduzido."
        >
          <Switch
            label="Animações"
            checked={preferences.animations}
            onChange={(value) => update({ animations: value })}
          />
        </Row>

        <Row title="Deslocamento suave" description="A conversa acompanha a resposta suavemente.">
          <Switch
            label="Deslocamento suave"
            checked={preferences.smoothScroll}
            onChange={(value) => update({ smoothScroll: value })}
          />
        </Row>
      </div>

      <div className="settings-section">
        <h3 className="text-sm font-semibold">Navegação e conversa</h3>

        <Row title="Posição da navegação">
          <select
            className="settings-select"
            value={preferences.navPosition}
            aria-label="Posição da navegação"
            onChange={(event) =>
              update({ navPosition: event.target.value as typeof preferences.navPosition })
            }
          >
            <option value="baixo">Em baixo</option>
            <option value="topo">Em cima</option>
          </select>
        </Row>

        <Row title="Navegação compacta" description="Só ícones, com nomes acessíveis.">
          <Switch
            label="Navegação compacta"
            checked={preferences.navMode === "compacta"}
            onChange={(value) => update({ navMode: value ? "compacta" : "completa" })}
          />
        </Row>

        <Row
          title="Sugestões no tutor"
          description="Cartões de arranque quando a conversa está vazia."
        >
          <Switch
            label="Sugestões no tutor"
            checked={preferences.showSuggestions}
            onChange={(value) => update({ showSuggestions: value })}
          />
        </Row>

        <Row title="Confirmação antes de apagar">
          <Switch
            label="Confirmação antes de apagar"
            checked={preferences.confirmDelete}
            onChange={(value) => update({ confirmDelete: value })}
          />
        </Row>

        <Row
          title="Importar cartões automaticamente"
          description="Só se ativares: a pré-visualização deixa de ser obrigatória."
        >
          <Switch
            label="Importar cartões automaticamente"
            checked={preferences.autoSaveGeneratedCards}
            onChange={(value) => update({ autoSaveGeneratedCards: value })}
          />
        </Row>

        <Row title="Leitura focada" description="Reduz distrações no tutor (menos ações visíveis).">
          <Switch
            label="Leitura focada"
            checked={preferences.focusReading}
            onChange={(value) => update({ focusReading: value })}
          />
        </Row>
      </div>

      <div className="settings-section">
        <h3 className="text-sm font-semibold">Idioma e voz</h3>

        <Row
          title="Idioma da voz e do ditado"
          description="Controla o idioma do ditado e da leitura em voz alta. A interface está em português (Portugal)."
        >
          <select
            className="settings-select"
            value={preferences.uiLanguage}
            aria-label="Idioma da voz e do ditado"
            onChange={(event) =>
              update({ uiLanguage: event.target.value as typeof preferences.uiLanguage })
            }
          >
            <option value="pt-PT">Português (Portugal)</option>
            <option value="en">English</option>
          </select>
        </Row>

        <Row title="Idioma das respostas da IA">
          <select
            className="settings-select"
            value={preferences.aiLanguage}
            aria-label="Idioma das respostas da IA"
            onChange={(event) =>
              update({ aiLanguage: event.target.value as typeof preferences.aiLanguage })
            }
          >
            <option value="pt-PT">Português (Portugal)</option>
            <option value="en">Inglês</option>
            <option value="auto">Igual ao que escrevo</option>
          </select>
        </Row>

        <Row title="Ler respostas em voz alta" description="Desligado por predefinição.">
          <Switch
            label="Ler respostas em voz alta"
            checked={preferences.voiceEnabled}
            onChange={(value) => update({ voiceEnabled: value })}
          />
        </Row>

        <Row title="Velocidade da voz" description={`${preferences.speechRate.toFixed(1)}×`}>
          <input
            className="settings-range"
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={preferences.speechRate}
            aria-label="Velocidade da voz"
            onChange={(event) => update({ speechRate: Number(event.target.value) })}
          />
        </Row>
      </div>

      <div className="settings-section">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MonitorSmartphone className="size-4 text-primary" aria-hidden="true" />
          Aplicação instalável e offline
        </h3>

        <Row
          title={install.installed ? "Aplicação instalada" : "Instalar no dispositivo"}
          description={
            install.installed
              ? "Estás a usar a versão instalada (ecrã inteiro)."
              : install.manualInstructions
                ? "No iPhone/iPad: Partilhar → Adicionar ao ecrã principal. No Android/desktop usa o botão quando disponível."
                : "Abre em ecrã inteiro e funciona sem internet para os dados locais."
          }
        >
          {install.canInstall ? (
            <Button size="sm" onClick={() => void install.promptInstall()}>
              <Download aria-hidden="true" />
              Instalar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void registerServiceWorker({ force: true }).then((registration) => {
                  toast[registration ? "success" : "error"](
                    registration
                      ? "Service worker ativo: a app já pode funcionar offline."
                      : "Este navegador não permitiu ativar o modo offline.",
                  );
                  void serviceWorker.checkForUpdate();
                });
              }}
            >
              Ativar modo offline
            </Button>
          )}
        </Row>

        <Row
          title="Estado da ligação"
          description={
            online
              ? "Online: a IA, a transcrição e a pesquisa funcionam."
              : "Offline: os documentos guardados, cartões, notas e foco continuam disponíveis. A IA precisa de internet."
          }
        >
          <span className="online-dot" data-online={online}>
            {online ? (
              <Wifi className="size-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="size-3.5" aria-hidden="true" />
            )}
            {online ? "Online" : "Offline"}
          </span>
        </Row>

        <Row
          title="Atualização da aplicação"
          description={
            serviceWorker.updateReady
              ? "Há uma versão nova pronta. Aplicar recarrega a página."
              : "Verifica se há uma nova versão em cache."
          }
        >
          {serviceWorker.updateReady ? (
            <Button size="sm" onClick={() => void serviceWorker.applyUpdate()}>
              Aplicar atualização
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void serviceWorker.checkForUpdate().then((ok) => {
                  toast[ok ? "success" : "error"](
                    ok ? "Verificação feita." : "Não foi possível verificar agora.",
                  );
                });
              }}
            >
              Procurar atualização
            </Button>
          )}
        </Row>
      </div>

      <div className="settings-section">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-primary" aria-hidden="true" />
          Desempenho medido
        </h3>
        <p className="text-xs text-muted-foreground">
          Tempos reais desta sessão: quando o ficheiro apareceu, quando a primeira página foi lida,
          quando o documento ficou pronto e quando chegou o primeiro token.
        </p>
        {metrics.length === 0 ? (
          <p className="preview-source">
            Ainda sem medições. Anexa um documento ou faz uma pergunta ao tutor.
          </p>
        ) : (
          <ul className="metrics-list">
            {metrics.map((metric) => (
              <li key={metric.key}>
                <span>{metric.label}</span>
                <strong>{formatMs(metric.ms)}</strong>
              </li>
            ))}
          </ul>
        )}
        <div className="attachment-actions">
          <Button size="sm" variant="outline" onClick={() => setMetrics(getMetricsSnapshot())}>
            Atualizar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              resetMetrics();
              setMetrics([]);
            }}
          >
            Limpar medições
          </Button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Dados de exemplo e predefinições
        </h3>
        <Row
          title="Cartões de exemplo"
          description={
            demoCount > 0
              ? `${demoCount} cartões de exemplo no deck “Exemplo”. Nunca entram no quiz.`
              : "Nenhum cartão de exemplo carregado."
          }
        >
          {demoCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCards((current) => current.filter((card) => !isDemoCard(card)));
                toast.success("Cartões de exemplo removidos.");
              }}
            >
              <Trash2 aria-hidden="true" />
              Remover exemplo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCards((current) => [
                  ...current.filter((card) => !isDemoCard(card)),
                  ...demoCards,
                ]);
                toast.info("Exemplo carregado. Podes removê-lo aqui.");
              }}
            >
              Carregar exemplo
            </Button>
          )}
        </Row>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            toast.success("Predefinições de personalização restauradas.");
          }}
        >
          <RotateCcw aria-hidden="true" />
          Restaurar predefinições
        </Button>
      </div>
    </section>
  );
}
