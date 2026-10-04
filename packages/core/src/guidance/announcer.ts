const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/** Announces guidance to screen readers and optionally vibrates. */
export class Announcer {
  private region: HTMLElement | null = null;

  constructor(
    container: HTMLElement | null,
    private vibrate: boolean,
  ) {
    if (container && typeof document !== 'undefined') {
      this.region = document.createElement('div');
      this.region.setAttribute('aria-live', 'polite');
      this.region.setAttribute('aria-atomic', 'true');
      this.region.setAttribute('role', 'status');
      this.region.style.cssText = VISUALLY_HIDDEN;
      container.appendChild(this.region);
    }
  }

  announce(text: string): void {
    if (this.region) this.region.textContent = text;
  }

  buzz(pattern: number | number[]): void {
    if (this.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Not allowed (e.g. no user activation yet).
      }
    }
  }

  dispose(): void {
    this.region?.remove();
    this.region = null;
  }
}
