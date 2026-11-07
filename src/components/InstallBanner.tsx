import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/pwa";

/**
 * Install prompt. It only appears when the browser fires
 * `beforeinstallprompt` (i.e. installation is actually possible) and hides
 * itself for good once the app is installed or dismissed.
 */
export function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <section className="install-banner" aria-label="Instalar o AngoStudy">
      <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        <strong>Instala o AngoStudy</strong> para abrir em ecrã inteiro, sem barra do navegador, e
        continuar a estudar offline.
      </p>
      <Button size="sm" onClick={() => void promptInstall()}>
        Instalar
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Agora não">
        <X aria-hidden="true" />
      </Button>
    </section>
  );
}
