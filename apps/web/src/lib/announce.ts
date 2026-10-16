let region: HTMLElement | null = null;

const ensureRegion = (): HTMLElement => {
  if (region === null) {
    region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  return region;
};

export const announce = (message: string): void => {
  const el = ensureRegion();
  el.textContent = '';
  setTimeout(() => {
    el.textContent = message;
  }, 30);
};
