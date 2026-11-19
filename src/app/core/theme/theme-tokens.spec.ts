import { readFileSync } from 'node:fs';

import { THEME_IDS } from './theme.service';

const TOKENS_PATH = 'src/app/core/theme/theme-tokens.scss';
const FONTS_PATH = 'src/app/core/theme/fonts.scss';
/** Igual que styles.spec.ts: comprobar el archivo evita depender del CSS inyectado. */
const css = readFileSync(TOKENS_PATH, 'utf8');

function blockFor(id: string): string {
  const match = css.match(
    new RegExp(`:root\\[data-theme=['"]${id}['"]\\]\\s*\\{([\\s\\S]*?)\\}`),
  );
  return match?.[1] ?? '';
}

describe('tokens de temas', () => {
  it('existe y declara exactamente los seis bloques de la unión cerrada', () => {
    expect(css.length).toBeGreaterThan(0);
    expect(css.match(/:root\[data-theme=/g) ?? []).toHaveLength(THEME_IDS.length);
    expect(THEME_IDS).toHaveLength(6);
    for (const id of THEME_IDS) {
      expect(blockFor(id)).not.toBe('');
    }
    expect(css).toMatch(/creator \(PREDETERMINADO/);
    expect(css).toMatch(/brutalista[\s\S]*NO copia colores exactos/i);
  });

  it('no tiene llaves desbalanceadas ni reglas que carguen fuentes', () => {
    /** Los comentarios documentan la integración futura: no son CSS ejecutable. */
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect((code.match(/\{/g) ?? []).length).toBe(
      (code.match(/\}/g) ?? []).length,
    );
    expect(code).not.toMatch(/@font-face/i);
    expect(code).not.toMatch(/url\(/i);
  });

  it('cada tema declara los mismos tokens base, de fuente y de administración', () => {
    const required = [
      '--bg',
      '--surface',
      '--ink',
      '--muted',
      '--accent',
      '--accent-ink',
      '--border',
      '--focus',
      '--radius',
      '--font-body',
      '--font-display',
      '--admin-surface',
      '--admin-border',
      '--admin-text',
      '--admin-accent',
      '--admin-focus',
    ];

    for (const id of THEME_IDS) {
      const block = blockFor(id);
      for (const token of required) {
        expect(block, `${token} falta en ${id}`).toMatch(
          new RegExp(`${token}\\s*:`),
        );
      }
    }
  });

  it('declara las pilas de fuentes por nombre sin aplicarlas a selectores', () => {
    expect(css).toMatch(/--font-body:\s*'Roboto Mono'/);
    expect(css).toMatch(/--font-display:\s*'Bodoni Moda', Georgia, serif/);
    expect(css).not.toMatch(/(?:body|h1|h2|h3)\s*\{[^}]*font-family/);
  });
});

describe('fuentes locales', () => {
  it('fonts.scss apunta a los woff2 locales con sus licencias OFL', () => {
    const fonts = readFileSync(FONTS_PATH, 'utf8');

    expect(fonts).toMatch(/@font-face[\s\S]*font-family:\s*'Roboto Mono'/);
    expect(fonts).toMatch(/font-weight:\s*100 700/);
    expect(fonts).toMatch(/url\('\/fonts\/roboto-mono-latin\.woff2'\)/);
    expect(fonts).toMatch(/@font-face[\s\S]*font-family:\s*'Bodoni Moda'/);
    expect(fonts).toMatch(/url\('\/fonts\/bodoni-moda-latin\.woff2'\)/);
    expect(fonts).toMatch(/OFL-RobotoMono\.txt/);
    expect(fonts).toMatch(/OFL-BodoniModa\.txt/);

    for (const file of [
      'public/fonts/roboto-mono-latin.woff2',
      'public/fonts/bodoni-moda-latin.woff2',
      'public/fonts/OFL-RobotoMono.txt',
      'public/fonts/OFL-BodoniModa.txt',
    ]) {
      expect(() => readFileSync(file, 'utf8'), `falta ${file}`).not.toThrow();
    }
  });
});
