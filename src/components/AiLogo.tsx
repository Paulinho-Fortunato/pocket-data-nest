import type { CSSProperties } from "react";

export type AiLogoProps = {
  /** CSS length; scales every part of the mark. */
  size?: string;
  /** Gentle orbit + blink. Reserved for the header/welcome mark. */
  animated?: boolean;
  /** Swaps the capsule eyes for a smile on hover (pointer devices only). */
  interactive?: boolean;
  className?: string;
  /** Supply only when the mark is the sole meaning of the element. */
  label?: string;
};

/**
 * AngoStudy's AI mark: a glass tile with four soft colour orbs and two eyes.
 *
 * It is deliberately CSS-only (no images, no styled-components) so it stays
 * crisp at 16 px, follows the theme and costs nothing on the critical path.
 */
export function AiLogo({
  size = "2.15rem",
  animated = false,
  interactive = false,
  className,
  label,
}: AiLogoProps) {
  return (
    <span
      className={className ? `ai-logo ${className}` : "ai-logo"}
      style={{ "--ai-logo-size": size } as CSSProperties}
      data-animated={animated || undefined}
      data-interactive={interactive || undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="ai-logo__aura" aria-hidden="true">
        <span className="ai-logo__ball ai-logo__ball--violet" />
        <span className="ai-logo__ball ai-logo__ball--green" />
        <span className="ai-logo__ball ai-logo__ball--pink" />
        <span className="ai-logo__ball ai-logo__ball--cyan" />
      </span>
      <span className="ai-logo__glass" aria-hidden="true" />
      <span className="ai-logo__eyes" aria-hidden="true">
        <span className="ai-logo__eye" />
        <span className="ai-logo__eye" />
      </span>
      <span className="ai-logo__happy" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8.28386 16.2843C8.9917 15.7665 9.8765 14.731 12 14.731C14.1235 14.731 15.0083 15.7665 15.7161 16.2843C17.8397 17.8376 18.7542 16.4845 18.9014 15.7665C19.4323 13.1777 17.6627 11.1066 17.3088 10.5888C16.3844 9.23666 14.1235 8 12 8C9.87648 8 7.61556 9.23666 6.69122 10.5888C6.33728 11.1066 4.56771 13.1777 5.09858 15.7665C5.24582 16.4845 6.16034 17.8376 8.28386 16.2843Z"
          />
        </svg>
      </span>
    </span>
  );
}
