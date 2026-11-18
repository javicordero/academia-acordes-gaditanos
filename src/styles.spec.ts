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
