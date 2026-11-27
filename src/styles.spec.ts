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
    expect(ruleBody('.skip-link')).toContain('translateY(calc(-100% - 1rem))');
    expect(ruleBody('.skip-link:focus')).toMatch(/transform:\s*none/);
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

  it('mantiene el foco visible por outline con los tokens --focus-ring y --focus', () => {
    expect(ruleBody(':focus-visible')).toMatch(
      /outline:\s*var\(--focus-ring\)\s+solid\s+var\(--focus\)/,
    );
  });
});

describe('Base de espaciado y jerarquía tipográfica global', () => {
  it('usa tokens en el ritmo vertical y las alturas de línea', () => {
    expect(ruleBody('body')).toMatch(/font-size:\s*var\(--font-size-md\)/);
    expect(ruleBody('body')).toMatch(/line-height:\s*var\(--line-height-relaxed\)/);
    expect(ruleBody('h1,\nh2,\nh3')).toMatch(/margin:\s*0 0 var\(--space-3\)/);
    expect(ruleBody('h1,\nh2,\nh3')).toMatch(/line-height:\s*var\(--line-height-tight\)/);
    expect(ruleBody('p')).toMatch(/margin:\s*0 0 var\(--space-4\)/);
  });

  it('aplica clamp() a h1 y h2 con máximo 3rem y 2rem respectivamente', () => {
    expect(ruleBody('h1')).toMatch(/font-size:\s*clamp\(2rem,\s*1\.5rem \+ 2\.5vw,\s*3rem\)/);
    expect(ruleBody('h2')).toMatch(/font-size:\s*clamp\(1\.5rem,\s*1\.35rem \+ 1vw,\s*2rem\)/);
    expect(ruleBody('h2')).toMatch(/margin-top:\s*var\(--space-6\)/);
  });

  it('limita el ancho de lectura de .lead a 66ch', () => {
    expect(ruleBody('.lead')).toMatch(/max-inline-size:\s*66ch/);
  });
});
