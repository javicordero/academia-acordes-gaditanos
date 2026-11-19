import { readFileSync } from 'node:fs';

/** Regla global declarada: comprobar la declaración evita depender de píxeles
 *  calculados por jsdom ni de que TestBed inyecte los estilos globales. */
function ruleBody(selector: string): string {
  const css = readFileSync('src/styles.scss', 'utf8');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('Enlace de salto', () => {
  it('permanece fuera de pantalla sin foco y se muestra al enfocarse', () => {
    expect(ruleBody('.skip-link')).toMatch(/top:\s*-[\d.]+(?:rem|px)/);
    expect(ruleBody('.skip-link:focus')).toMatch(/top:\s*0(?![\d.])/);
    expect(ruleBody('.skip-link:focus')).toMatch(/z-index:\s*100/);
  });
});

const ACTION_SELECTOR = ":is(a, button, [role='button'], .button, .home-button, .link-button)";

describe('Acciones sin subrayado en estilos globales', () => {
  it('no declara text-decoration: underline en ninguna regla global', () => {
    const css = readFileSync('src/styles.scss', 'utf8');
    expect(css).not.toMatch(/text-decoration\s*:\s*underline/i);
  });

  it('anula el subrayado de enlaces y botones en reposo y en todos los estados', () => {
    expect(ruleBody(ACTION_SELECTOR)).toMatch(/text-decoration\s*:\s*none/);
    expect(ruleBody(`${ACTION_SELECTOR}:is(:hover, :focus, :visited, :active)`)).toMatch(
      /text-decoration\s*:\s*none/,
    );
  });

  it('mantiene el foco visible por outline con el token --focus', () => {
    expect(ruleBody(':focus-visible')).toMatch(/outline:\s*3px solid var\(--focus\)/);
  });
});
