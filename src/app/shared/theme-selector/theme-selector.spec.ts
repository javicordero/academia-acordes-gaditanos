import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { THEME_STORAGE_KEY, ThemeService } from '../../core/theme/theme.service';
import { ThemeSelector } from './theme-selector';

const LABELS = [
  'Creador', 'Flamenco editorial', 'Conservatorio', 'Escuela clásica',
  'Editorial de bolsillo', 'Cuaderno del profesor', 'Minimal técnico',
  'Atelier boutique', 'Taller artesanal', 'Estudio de grabación',
  'Impacto AG', 'Línea precisa', 'Brutalista AG', 'Energía en pista',
  'Juguetón', 'Cristal sereno', 'Serio corporativo', 'Prensa cultural',
];

const NEW_IDS = [
  ['Cuaderno del profesor', 'cuaderno'], ['Cristal sereno', 'glass'],
  ['Serio corporativo', 'serio'], ['Prensa cultural', 'prensa'],
] as const;

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
    return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
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

  it('botón accesible de 44px, foco visible y panel con scroll', async () => {
    await create();
    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');
    expect(trigger().getAttribute('aria-label')).toBe('Cambiar tema');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-controls')).toBe('theme-selector-menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(options()).toHaveLength(0);
    expect(css).toContain('min-height: 44px');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('max-height: min(70vh, 28rem)');
  });

  it('abre dieciocho opciones claras, sin nocturno, con Creador marcado', async () => {
    await create();
    await openMenu();
    const normalize = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Temas');
    expect(options()).toHaveLength(18);
    expect(options().map((candidate) => normalize(candidate.textContent ?? undefined))).toEqual(
      LABELS.map((label) => (label === 'Creador' ? '✓ Creador' : label)),
    );
    expect(options().map((candidate) => candidate.getAttribute('aria-checked'))).toEqual(
      LABELS.map((_, index) => (index === 0 ? 'true' : 'false')),
    );
    expect(normalize(root.textContent ?? undefined)).not.toContain('Nocturno AG');
  });

  it('Escape cierra y devuelve el foco al botón', async () => {
    await create();
    await openMenu();
    option('Prensa cultural').focus();
    option('Prensa cultural').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('Enter y space seleccionan y cierran', async () => {
    await create();
    await openMenu();
    const setTheme = vi.spyOn(theme, 'setTheme');
    option('Cristal sereno').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('glass');
    expect(theme.theme()).toBe('glass');
    expect(options()).toHaveLength(0);
    await openMenu();
    option('Energía en pista').dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('energia');
    expect(theme.theme()).toBe('energia');
  });

  it('click en opción cambia el tema vía setTheme', async () => {
    await create();
    await openMenu();
    const setTheme = vi.spyOn(theme, 'setTheme');
    option('Serio corporativo').click();
    await fixture.whenStable();
    expect(setTheme).toHaveBeenCalledWith('serio');
    expect(theme.theme()).toBe('serio');
    expect(options()).toHaveLength(0);
  });

  it('los cuatro temas nuevos aplican su id estable', async () => {
    for (const [label, id] of NEW_IDS) {
      TestBed.resetTestingModule();
      localStorage.removeItem(THEME_STORAGE_KEY);
      TestBed.configureTestingModule({ imports: [ThemeSelector] });
      await create();
      await openMenu();
      expect(option(label).getAttribute('role')).toBe('menuitemradio');
      option(label).click();
      await fixture.whenStable();
      expect(theme.theme()).toBe(id);
      expect(document.documentElement.getAttribute('data-theme')).toBe(id);
    }
  });

  it('refleja el persistido y aísla Escape y clicks del menú móvil', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 1, theme: 'glass' }));
    await create();
    await openMenu();
    expect(options().find((candidate) => candidate.getAttribute('aria-checked') === 'true')?.textContent)
      .toContain('Cristal sereno');

    const parent = root.parentElement ?? document.body;
    const onKey = vi.fn();
    const onClick = vi.fn();
    parent.addEventListener('keydown', onKey);
    parent.addEventListener('click', onClick);
    option('Prensa cultural').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    trigger().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(onKey).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    parent.removeEventListener('keydown', onKey);
    parent.removeEventListener('click', onClick);
  });
});
