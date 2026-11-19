import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { THEME_STORAGE_KEY, ThemeService } from '../../core/theme/theme.service';
import { ThemeSelector } from './theme-selector';

describe('ThemeSelector', () => {
  let fixture: ComponentFixture<ThemeSelector>;
  let root: HTMLElement;
  let theme: ThemeService;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ThemeSelector);
    root = fixture.nativeElement as HTMLElement;
    theme = TestBed.inject(ThemeService);
    await fixture.whenStable();
  }

  function trigger(): HTMLButtonElement {
    const found = root.querySelector<HTMLButtonElement>('.theme-selector__trigger');
    expect(found).not.toBeNull();
    return found!;
  }

  function options(): HTMLButtonElement[] {
    return Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
  }

  function option(label: string): HTMLButtonElement {
    const found = options().find((candidate) => candidate.textContent?.includes(label));
    expect(found).toBeDefined();
    return found!;
  }

  async function openMenu(): Promise<void> {
    trigger().click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({ imports: [ThemeSelector] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('botón accesible de 44px con foco visible; menú cerrado por defecto', async () => {
    await create();
    const button = trigger();
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(button.getAttribute('aria-label')).toBe('Cambiar tema');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-controls')).toBe('theme-selector-menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(options()).toHaveLength(0);
    expect(css).toContain('min-height: 44px');
    expect(css).toContain(':focus-visible');
  });

  it('abre seis opciones en español con Creador marcado como actual', async () => {
    await create();
    await openMenu();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe(
      'Temas',
    );
    const normalize = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    expect(options().map((candidate) => normalize(candidate.textContent ?? undefined))).toEqual([
      '✓ Creador',
      'Flamenco editorial',
      'Conservatorio',
      'Nocturno AG',
      'Alto contraste',
      'Brutalista AG',
    ]);
    expect(options().map((candidate) => candidate.getAttribute('aria-checked'))).toEqual(
      ['true', 'false', 'false', 'false', 'false', 'false'],
    );
  });

  it('Escape cierra y devuelve el foco al botón', async () => {
    await create();
    await openMenu();
    option('Nocturno AG').focus();

    option('Nocturno AG').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();

    expect(options()).toHaveLength(0);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('Enter y space seleccionan el tema y cierran el menú', async () => {
    await create();
    await openMenu();
    const setTheme = vi.spyOn(theme, 'setTheme');

    option('Nocturno AG').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('nocturno');
    expect(theme.theme()).toBe('nocturno');
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());

    await openMenu();
    option('Alto contraste').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('contraste');
    expect(theme.theme()).toBe('contraste');
  });

  it('el click en una opción cambia el tema a través de setTheme', async () => {
    await create();
    await openMenu();
    const setTheme = vi.spyOn(theme, 'setTheme');

    option('Flamenco editorial').click();
    await fixture.whenStable();

    expect(setTheme).toHaveBeenCalledWith('flamenco');
    expect(theme.theme()).toBe('flamenco');
    expect(options()).toHaveLength(0);
  });

  it('selecciona Brutalista AG con su id estable', async () => {
    await create();
    await openMenu();

    option('Brutalista AG').click();
    await fixture.whenStable();

    expect(theme.theme()).toBe('brutalista');
    expect(document.documentElement.getAttribute('data-theme')).toBe('brutalista');
    expect(options()).toHaveLength(0);
  });

  it('los clicks del selector no burbujean al menú móvil', async () => {
    await create();
    await openMenu();
    const parent = root.parentElement ?? document.body;
    const sibling = document.createElement('button');
    sibling.type = 'button';
    parent.appendChild(sibling);
    const onParentClick = vi.fn();
    parent.addEventListener('click', onParentClick);

    root.querySelector<HTMLElement>('.theme-selector__panel')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onParentClick).not.toHaveBeenCalled();

    sibling.click();
    expect(onParentClick).toHaveBeenCalledTimes(1);

    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onParentClick).toHaveBeenCalledTimes(1);

    parent.removeEventListener('click', onParentClick);
    sibling.remove();
  });
});
