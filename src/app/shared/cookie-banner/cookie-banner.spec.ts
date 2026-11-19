import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CONSENT_STORAGE_KEY, ConsentService } from '../../core/consent/consent.service';
import { CookieBanner } from './cookie-banner';

describe('CookieBanner', () => {
  let fixture: ComponentFixture<CookieBanner>;
  let root: HTMLElement;
  let consent: ConsentService;

  async function createBanner(): Promise<void> {
    fixture = TestBed.createComponent(CookieBanner);
    root = fixture.nativeElement as HTMLElement;
    consent = TestBed.inject(ConsentService);
    await fixture.whenStable();
  }

  function button(text: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    expect(found).toBeDefined();
    return found!;
  }

  async function click(text: string): Promise<void> {
    button(text).click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CookieBanner] });
  });

  afterEach(() => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  it('es una región etiquetada, no un modal y no roba el foco al entrar', async () => {
    await createBanner();
    const region = root.querySelector<HTMLElement>('section[role="region"]');

    expect(region?.getAttribute('aria-label')).toBe('Preferencias de cookies');
    expect(region?.getAttribute('aria-modal')).toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('[autofocus]')).toBeNull();
    expect(root.contains(document.activeElement)).toBe(false);
  });

  it('ofrece aceptar, rechazar y personalizar con botones de 44px y foco visible', async () => {
    await createBanner();
    const labels = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).map(
      (candidate) => candidate.textContent?.trim(),
    );
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(labels).toEqual(['Aceptar todo', 'Rechazar opcional', 'Personalizar']);
    for (const candidate of root.querySelectorAll<HTMLButtonElement>('button')) {
      expect(candidate.tagName).toBe('BUTTON');
      expect(candidate.disabled).toBe(false);
    }
    expect(css).toContain('min-height: 44px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media');
  });

  it('Escape no cierra el aviso ni registra consentimiento', async () => {
    await createBanner();
    const region = root.querySelector<HTMLElement>('section[role="region"]')!;

    region.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(consent.hasDecision()).toBe(false);
    expect(consent.bannerVisible()).toBe(true);
    expect(root.textContent).toContain('Aceptar todo');
  });

  it('aceptar todo concede analítica y no deja ninguna barra persistente', async () => {
    await createBanner();

    await click('Aceptar todo');

    expect(consent.preferences().analytics).toBe(true);
    expect(consent.hasDecision()).toBe(true);
    expect(consent.bannerVisible()).toBe(false);
    expect(root.textContent).not.toContain('Preferencias de cookies guardadas.');
    expect(root.textContent).not.toContain('Cambiar preferencias');
    expect(root.querySelector('section[aria-label="Preferencias de cookies"]')).toBeNull();
    expect(getComputedStyle(root).display).toBe('none');
  });

  it('rechazar opcional no concede analítica ni muestra el aviso guardado', async () => {
    await createBanner();

    await click('Rechazar opcional');

    expect(consent.preferences().analytics).toBe(false);
    expect(consent.hasDecision()).toBe(true);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? '')).toEqual({
      version: 1,
      analytics: false,
    });
    expect(root.textContent).not.toContain('Preferencias de cookies guardadas.');
    expect(root.textContent).not.toContain('Cambiar preferencias');
    expect(getComputedStyle(root).display).toBe('none');
  });

  it('el panel se reabre manualmente sin cambiar la decisión', async () => {
    await createBanner();
    await click('Rechazar opcional');

    consent.openPreferences();
    await fixture.whenStable();

    expect(consent.bannerVisible()).toBe(true);
    expect(root.querySelector('section[aria-label="Preferencias de cookies"]')).not.toBeNull();
    expect(root.textContent).toContain('Guardar preferencias');
    expect(root.textContent).toContain('Cancelar');
    expect(consent.preferences().analytics).toBe(false);

    await click('Cancelar');
    expect(consent.preferencesOpen()).toBe(false);
    expect(getComputedStyle(root).display).toBe('none');
  });

  it('personalizar guarda la casilla elegida y cierra el panel', async () => {
    await createBanner();

    await click('Personalizar');
    expect(root.querySelector('fieldset')).not.toBeNull();
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(consent.draftAnalytics()).toBe(true);

    await click('Guardar preferencias');
    expect(consent.preferences().analytics).toBe(true);
    expect(consent.preferencesOpen()).toBe(false);
    expect(root.querySelector('fieldset')).toBeNull();
  });

  it('en el aula va en flujo para no tapar los controles', async () => {
    await createBanner();
    expect(getComputedStyle(root).position).toBe('sticky');

    fixture.componentRef.setInput('classroom', true);
    await fixture.whenStable();

    expect(root.classList.contains('cookie-banner--in-classroom')).toBe(true);
    expect(getComputedStyle(root).position).toBe('static');
  });
});
