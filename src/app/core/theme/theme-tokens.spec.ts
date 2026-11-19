import { readFileSync } from 'node:fs';

import { DEFAULT_THEME_ID, THEME_IDS, THEME_META_COLORS } from './theme.service';

const TOKENS_PATH = 'src/app/core/theme/theme-tokens.scss';
const COMPONENTS_PATH = 'src/app/core/theme/theme-components.scss';
const FONTS_PATH = 'src/app/core/theme/fonts.scss';
const STYLES_PATH = 'src/styles.scss';
const INDEX_PATH = 'src/index.html';
const css = readFileSync(TOKENS_PATH, 'utf8');
const components = readFileSync(COMPONENTS_PATH, 'utf8');

const GEOMETRIC_TOKENS = [
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
  '--section-gap', '--card-pad', '--card-gap', '--grid-gap',
  '--radius-sm', '--radius-md', '--radius-lg', '--shadow-card',
  '--shadow-raised', '--border-width', '--content-max-width',
];

const NEW_TOKENS = [
  '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg',
  '--font-size-xl', '--font-size-2xl', '--font-size-3xl',
  '--line-height-tight', '--line-height-normal', '--line-height-relaxed',
  '--weight-regular', '--weight-medium', '--weight-bold',
  '--icon-sm', '--icon-md', '--icon-lg', '--stroke-width',
  '--tap-min', '--focus-ring', '--z-panel', '--z-overlay', '--z-toast',
  '--success', '--success-ink', '--warning', '--warning-ink',
  '--danger', '--danger-ink', '--info', '--info-ink',
  '--elevation-0', '--elevation-1', '--elevation-2',
  '--density', '--heading-transform', '--heading-tracking',
  '--button-fill', '--card-surface', '--list-divider', '--card-display',
];

const BASE_TOKENS = [
  '--bg', '--surface', '--ink', '--muted', '--accent', '--accent-ink',
  '--border', '--focus', '--radius', '--font-body', '--font-display',
];

const ADMIN_TOKENS = [
  '--admin-surface', '--admin-surface-soft', '--admin-surface-hover',
  '--admin-field-bg', '--admin-border', '--admin-border-strong',
  '--admin-text', '--admin-text-muted', '--admin-accent',
  '--admin-accent-strong', '--admin-accent-ink', '--admin-focus',
  '--admin-disabled-border', '--admin-disabled-surface', '--admin-disabled-text',
  '--admin-success', '--admin-success-surface', '--admin-success-text',
  '--admin-warn', '--admin-warn-surface', '--admin-warn-text',
  '--admin-danger', '--admin-danger-surface', '--admin-danger-text',
];

/** Siete dimensiones visibles exigidas por el encargo. */
const DIMENSIONS = [
  '--font-body', '--font-display', '--space-3', '--radius-md', '--shadow-card',
  '--card-pad', '--heading-transform', '--heading-tracking', '--button-fill',
  '--card-surface', '--list-divider', '--card-display', '--density',
];

function blockFor(text: string, id: string): string {
  return text.match(
    new RegExp(`:root\\[data-theme=['"]${id}['"]\\]\\s*\\{([\\s\\S]*?)\\}`),
  )?.[1] ?? '';
}

function valueFor(id: string, token: string): string {
  return blockFor(css, id).match(new RegExp(`${token}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? '';
}

function componentBlockFor(text: string, id: string): string {
  const start = text.indexOf(`:root[data-theme='${id}']`);
  if (start < 0) return '';
  const next = text.indexOf(':root[data-theme=', start + 1);
  return text.slice(start, next < 0 ? text.length : next);
}

function luminance(color: string): number {
  if (color.startsWith('rgba')) {
    const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 1;
  const [r, g, b] = hex.match(/../g)!.map((part) => parseInt(part, 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe('tokens de temas claros', () => {
  it('dieciocho bloques exactos, sin nocturno ni rastro de tema oscuro', () => {
    expect(THEME_IDS).toHaveLength(18);
    expect(DEFAULT_THEME_ID).toBe('creator');
    expect(css.match(/:root\[data-theme=/g) ?? []).toHaveLength(18);
    for (const id of THEME_IDS) expect(blockFor(css, id)).not.toBe('');
    expect(css).not.toMatch(/nocturno|high-contrast/i);
    expect(THEME_IDS).not.toContain('nocturno');
  });

  it('los dieciocho temas son claros: color-scheme light y superficies luminosas', () => {
    for (const id of THEME_IDS) {
      expect(blockFor(css, id)).toContain('color-scheme: light');
      for (const token of ['--bg', '--surface', '--card-surface']) {
        const color = valueFor(id, token);
        expect(luminance(color), `${token} oscuro en ${id}: ${color}`).toBeGreaterThan(0.6);
      }
    }
  });

  it('los dieciocho temas declaran todos los tokens sin valores vacíos', () => {
    for (const id of THEME_IDS) {
      const block = blockFor(css, id);
      for (const token of [...BASE_TOKENS, ...GEOMETRIC_TOKENS, ...NEW_TOKENS, ...ADMIN_TOKENS]) {
        expect(block, `${token} falta en ${id}`).toMatch(new RegExp(`${token}\\s*:`));
        expect(valueFor(id, token), `${token} vacío en ${id}`).not.toBe('');
      }
    }
  });

  it('cada tema cambia al menos siete dimensiones visibles frente a creator', () => {
    const creator = DIMENSIONS.map((token) => valueFor('creator', token));
    for (const id of THEME_IDS.filter((theme) => theme !== 'creator')) {
      const diff = DIMENSIONS.filter((token, index) => valueFor(id, token) !== creator[index]);
      expect(diff.length, `${id} solo cambia ${diff.length} dimensiones`).toBeGreaterThanOrEqual(7);
    }
    const tuples = THEME_IDS.map((id) => DIMENSIONS.map((token) => valueFor(id, token)).join('|'));
    expect(new Set(tuples).size).toBe(18);
  });

  it('meta theme-color de cada tema y el inicial de index.html coinciden con --bg', () => {
    for (const id of THEME_IDS) {
      expect(THEME_META_COLORS[id], `meta de ${id}`).toBe(valueFor(id, '--bg'));
    }
    const index = readFileSync(INDEX_PATH, 'utf8');
    const initial = index.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/i)?.[1];
    expect(initial).toBe(valueFor('creator', '--bg'));
    expect(initial).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('fuentes locales sin descargar nada nuevo', () => {
    const fonts = readFileSync(FONTS_PATH, 'utf8');
    expect((fonts.match(/@font-face/g) ?? []).length).toBe(2);
    expect(fonts).toMatch(/url\('\/fonts\/roboto-mono-latin\.woff2'\)/);
    expect(fonts).toMatch(/url\('\/fonts\/bodoni-moda-latin\.woff2'\)/);
    expect(valueFor('creator', '--font-body')).toMatch(/Roboto Mono/);
    expect(valueFor('creator', '--font-display')).toMatch(/Bodoni Moda/);
    for (const id of THEME_IDS) {
      expect(valueFor(id, '--font-body')).not.toMatch(/https?:|@import|url\(/);
    }
  });

  it('feedback legible y distinto por tema, con tap mínimo y foco visibles', () => {
    const feedback = ['--success', '--warning', '--danger', '--info'];
    const palettes = THEME_IDS.map((id) => feedback.map((token) => valueFor(id, token)).join('|'));
    expect(new Set(palettes).size).toBe(18);
    for (const id of THEME_IDS) {
      for (const token of feedback) {
        expect(valueFor(id, token)).toMatch(/^#[0-9a-f]{6}$/i);
        expect(valueFor(id, `${token}-ink`)).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(valueFor(id, '--tap-min')).toBe('2.75rem');
      expect(valueFor(id, '--focus-ring')).toMatch(/^[23]px$/);
    }
  });
});

describe('theme-components.scss', () => {
  it('genera reglas por tema para componentes globales existentes', () => {
    expect(components.match(/:root\[data-theme=/g) ?? []).toHaveLength(18);
    expect(components).not.toMatch(/nocturno/i);
    for (const id of THEME_IDS) {
      const block = componentBlockFor(components, id);
      for (const selector of ['.button', '.card', '.course-card', '.feedback', '.status-chip', '.admin-workspace', '.aula-content']) {
        expect(block, `${selector} falta en ${id}`).toContain(selector);
      }
      expect(block).toContain('var(--heading-transform)');
      expect(block).toContain('var(--card-surface)');
      expect(block).toContain('var(--tap-min)');
    }
    const code = components.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/position:\s*fixed/);
    expect(code).not.toMatch(/\.nav-list[^{]*\{[^}]*display:\s*none/);
    expect(code).toMatch(/@media\s*\(max-width:\s*40rem\)/);
  });

  it('styles.scss incluye las tres hojas sin tocar angular.json', () => {
    const styles = readFileSync(STYLES_PATH, 'utf8');
    expect(styles).toMatch(/@use\s+['"][^'"]*fonts['"]/);
    expect(styles).toMatch(/@use\s+['"][^'"]*theme-tokens['"]/);
    expect(styles).toMatch(/@use\s+['"][^'"]*theme-components['"]/);
    expect(styles.indexOf('theme-tokens')).toBeLessThan(styles.indexOf('theme-components'));
  });
});
