import { readFileSync } from 'node:fs';

const TOKENS_PATH = 'src/app/core/theme/theme-tokens.scss';
const COMPONENTS_PATH = 'src/app/core/theme/theme-components.scss';
const FONTS_PATH = 'src/app/core/theme/fonts.scss';
const STYLES_PATH = 'src/styles.scss';
const INDEX_PATH = 'src/index.html';

const css = readFileSync(TOKENS_PATH, 'utf8');
const components = readFileSync(COMPONENTS_PATH, 'utf8');

const REQUIRED_TOKENS = [
  '--bg', '--surface', '--ink', '--muted', '--accent', '--accent-ink',
  '--accent-strong', '--accent-strong-ink',
  '--border', '--focus', '--radius', '--font-body', '--font-display',
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5',
  '--space-6', '--space-7', '--section-gap', '--block-gap',
  '--card-pad', '--card-gap', '--grid-gap',
  '--radius-sm', '--radius-md', '--radius-lg', '--shadow-card',
  '--shadow-raised', '--border-width', '--content-max-width',
  '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg',
  '--font-size-xl', '--font-size-2xl', '--font-size-3xl',
  '--line-height-tight', '--line-height-normal', '--line-height-relaxed',
  '--weight-regular', '--weight-medium', '--weight-semibold', '--weight-bold',
  '--icon-sm', '--icon-md', '--icon-lg', '--stroke-width',
  '--tap-min', '--focus-ring', '--z-panel', '--z-overlay', '--z-toast',
  '--success', '--success-ink', '--warning', '--warning-ink',
  '--danger', '--danger-ink', '--info', '--info-ink',
  '--elevation-0', '--elevation-1', '--elevation-2',
  '--density', '--heading-transform', '--heading-tracking',
  '--button-fill', '--card-surface', '--list-divider', '--card-display',
  '--admin-surface', '--admin-surface-soft', '--admin-surface-hover',
  '--admin-field-bg', '--admin-border', '--admin-border-strong',
  '--admin-text', '--admin-text-muted', '--admin-accent',
  '--admin-accent-strong', '--admin-accent-ink', '--admin-focus',
  '--admin-disabled-border', '--admin-disabled-surface', '--admin-disabled-text',
  '--admin-success', '--admin-success-surface', '--admin-success-text',
  '--admin-warn', '--admin-warn-surface', '--admin-warn-text',
  '--admin-danger', '--admin-danger-surface', '--admin-danger-text',
];

function blockFor(text: string, id: string): string {
  return text.match(
    new RegExp(`:root\\[data-theme=['"]${id}['"]\\]\\s*\\{([\\s\\S]*?)\\}`),
  )?.[1] ?? '';
}

function valueFor(id: string, token: string): string {
  return blockFor(css, id).match(new RegExp(`${token}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? '';
}

/** Las reglas de componentes tienen llaves anidadas: se corta por el selector siguiente. */
function componentBlockFor(text: string, id: string): string {
  const start = text.indexOf(`:root[data-theme='${id}']`);
  if (start < 0) return '';
  const next = text.indexOf(':root[data-theme=', start + 1);
  return text.slice(start, next < 0 ? text.length : next);
}

describe('tokens del estilo único Línea precisa', () => {
  it('hay un solo bloque de tema y no queda rastro de los otros dieciocho', () => {
    expect(css.match(/:root\[data-theme=/g) ?? []).toHaveLength(1);
    expect(components.match(/:root\[data-theme=/g) ?? []).toHaveLength(1);
    expect(blockFor(css, 'linea')).not.toBe('');
    expect(blockFor(components, 'linea')).not.toBe('');
    expect(css).not.toMatch(/creator|flamenco|nocturno|high-contrast/i);
    expect(components).not.toMatch(/nocturno/i);
  });

  it('declara todos los tokens necesarios sin valores vacíos', () => {
    const block = blockFor(css, 'linea');
    for (const token of REQUIRED_TOKENS) {
      expect(block, `${token} falta`).toMatch(new RegExp(`${token}\\s*:`));
      expect(valueFor('linea', token), `${token} vacío`).not.toBe('');
    }
  });

  it('es claro y conserva las dimensiones reales del tema linea', () => {
    const block = blockFor(css, 'linea');
    expect(block).toContain('color-scheme: light');
    for (const token of ['--bg', '--surface', '--card-surface']) {
      expect(valueFor('linea', token)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(valueFor('linea', '--bg')).toBe('#eef0f5');
    expect(valueFor('linea', '--accent-strong')).toBe('#BE3D24');
    expect(valueFor('linea', '--accent-strong-ink')).toBe('#ffffff');
    expect(valueFor('linea', '--font-body')).toBe("'Courier New', Courier, monospace");
    expect(valueFor('linea', '--font-display')).toBe('system-ui, sans-serif');
    expect(valueFor('linea', '--space-1')).toBe('0.25rem');
    expect(valueFor('linea', '--space-3')).toBe('0.75rem');
    expect(valueFor('linea', '--space-5')).toBe('1.5rem');
    expect(valueFor('linea', '--space-6')).toBe('2rem');
    expect(valueFor('linea', '--space-7')).toBe('3rem');
    expect(valueFor('linea', '--section-gap')).toBe('3rem');
    expect(valueFor('linea', '--block-gap')).toBe('1.5rem');
    expect(valueFor('linea', '--card-pad')).toBe('1rem');
    expect(valueFor('linea', '--card-gap')).toBe('0.5rem');
    expect(valueFor('linea', '--grid-gap')).toBe('1rem');
    expect(valueFor('linea', '--font-size-xs')).toBe('0.75rem');
    expect(valueFor('linea', '--font-size-md')).toBe('1rem');
    expect(valueFor('linea', '--font-size-lg')).toBe('1.125rem');
    expect(valueFor('linea', '--font-size-xl')).toBe('1.25rem');
    expect(valueFor('linea', '--font-size-2xl')).toBe('2rem');
    expect(valueFor('linea', '--font-size-3xl')).toBe('3rem');
    expect(valueFor('linea', '--line-height-tight')).toBe('1.1');
    expect(valueFor('linea', '--line-height-normal')).toBe('1.5');
    expect(valueFor('linea', '--line-height-relaxed')).toBe('1.65');
    expect(valueFor('linea', '--weight-semibold')).toBe('600');
    expect(valueFor('linea', '--radius-md')).toBe('5px');
    expect(valueFor('linea', '--content-max-width')).toBe('72rem');
    expect(valueFor('linea', '--heading-tracking')).toBe('0.03em');
    expect(valueFor('linea', '--button-fill')).toBe('ghost');
    expect(valueFor('linea', '--card-display')).toBe('stack');
    expect(valueFor('linea', '--density')).toBe('compact');
    expect(valueFor('linea', '--tap-min')).toBe('2.75rem');
    expect(valueFor('linea', '--focus-ring')).toBe('3px');
  });

  it('index.html aplica el tema sin JS y el meta coincide con --bg', () => {
    const index = readFileSync(INDEX_PATH, 'utf8');
    expect(index).toMatch(/<html[^>]*\bdata-theme="linea"/);
    const initial = index.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{6})"/i)?.[1];
    expect(initial).toBe(valueFor('linea', '--bg'));
  });

  it('mantiene las fuentes OFL locales intactas y sin descargas', () => {
    const fonts = readFileSync(FONTS_PATH, 'utf8');
    expect((fonts.match(/@font-face/g) ?? []).length).toBe(2);
    expect(fonts).toMatch(/url\('\/fonts\/roboto-mono-latin\.woff2'\)/);
    expect(fonts).toMatch(/url\('\/fonts\/bodoni-moda-latin\.woff2'\)/);
    expect(fonts).not.toMatch(/https?:\/\/|@import/);
  });

  it('styles.scss incluye las tres hojas sin tocar angular.json', () => {
    const styles = readFileSync(STYLES_PATH, 'utf8');
    expect(styles).toMatch(/@use\s+['"][^'"]*fonts['"]/);
    expect(styles).toMatch(/@use\s+['"][^'"]*theme-tokens['"]/);
    expect(styles).toMatch(/@use\s+['"][^'"]*theme-components['"]/);
    expect(styles.indexOf('theme-tokens')).toBeLessThan(styles.indexOf('theme-components'));
  });

  it('theme-components.scss conserva las reglas globales del estilo único', () => {
    const block = componentBlockFor(components, 'linea');
    for (const selector of ['.button', '.card', '.course-card', '.feedback', '.status-chip', '.admin-workspace', '.aula-content']) {
      expect(block, selector).toContain(selector);
    }
    expect(block).toContain('var(--heading-transform)');
    expect(block).toContain('var(--card-surface)');
    expect(block).toContain('var(--tap-min)');
    const code = components.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/position:\s*fixed/);
    expect(code).not.toMatch(/\.nav-list[^{]*\{[^}]*display:\s*none/);
    expect(code).toMatch(/@media\s*\(max-width:\s*40rem\)/);
  });
});
