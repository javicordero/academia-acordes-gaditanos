import { readFileSync } from 'node:fs';

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SkeletonBlock } from './skeleton';
import { SKELETON_VARIANTS, SkeletonVariant } from './skeleton.models';

const SCSS_PATH = 'src/app/shared/skeleton/skeleton.scss';
const TS_PATH = 'src/app/shared/skeleton/skeleton.ts';

/** Igual que styles.spec.ts: comprobar la regla declarada evita depender de que
 *  jsdom aplique media queries o calcule geometría. */
const css = readFileSync(SCSS_PATH, 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

async function render(variant?: SkeletonVariant, overrides: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [SkeletonBlock] }).compileComponents();
  const fixture = TestBed.createComponent(SkeletonBlock);
  if (variant) fixture.componentRef.setInput('variant', variant);
  for (const [name, value] of Object.entries(overrides)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('SkeletonBlock', () => {
  it('renderiza las seis variantes con su geometría reservada', async () => {
    const expected: Record<SkeletonVariant, string> = {
      title: '.skeleton__title',
      text: '.skeleton__text',
      card: '.skeleton__card .skeleton__visual',
      list: '.skeleton__list .skeleton__row',
      video: '.skeleton__video',
      index: '.skeleton__index .skeleton__index-row',
    };
    for (const variant of SKELETON_VARIANTS) {
      const { root } = await render(variant);
      expect(root.querySelector('.skeleton')?.getAttribute('data-variant')).toBe(variant);
      expect(root.querySelector(expected[variant])).not.toBeNull();
      expect(root.querySelectorAll('.skeleton__shape').length).toBeGreaterThan(0);
    }
  });

  it('por defecto es texto de tres líneas y responde a lines, acotándolo', async () => {
    const initial = (await render()).root;
    expect(initial.querySelectorAll('.skeleton__line')).toHaveLength(3);

    const five = (await render('text', { lines: 5 })).root;
    expect(five.querySelectorAll('.skeleton__line')).toHaveLength(5);

    const zero = (await render('text', { lines: 0 })).root;
    expect(zero.querySelectorAll('.skeleton__line')).toHaveLength(1);
  });

  it('marca solo las formas como decorativas y anuncia una única vez el estado', async () => {
    const { root } = await render('card');
    const shapes = root.querySelector('.skeleton__shapes');
    expect(shapes?.getAttribute('aria-hidden')).toBe('true');
    expect(shapes?.querySelectorAll('.skeleton__shape').length).toBeGreaterThan(0);

    const status = root.querySelectorAll('.sr-only[role="status"]');
    expect(status).toHaveLength(1);
    expect(status[0].getAttribute('aria-atomic')).toBe('true');
    expect(status[0].textContent?.trim()).toBe('Cargando contenido…');
    expect(shapes?.querySelector('[role="status"]')).toBeNull();
  });

  it('omite el aviso cuando es vacío, para no duplicar estados en una misma vista', async () => {
    const { root } = await render('index', { ariaLabel: '' });
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(root.querySelectorAll('.skeleton__shape').length).toBeGreaterThan(0);
  });

  it('permite personalizar el aviso sin anunciar cada barra', async () => {
    const { fixture, root } = await render('list', { ariaLabel: 'Cargando el temario…' });
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('.sr-only')?.textContent?.trim()).toBe('Cargando el temario…');
    expect(root.querySelectorAll('.skeleton__shape').length).toBeGreaterThan(1);

    fixture.componentRef.setInput('ariaLabel', 'Cargando las lecciones…');
    await fixture.whenStable();
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('.sr-only')?.textContent?.trim()).toBe('Cargando las lecciones…');
  });

  it('no contiene elementos interactivos ni autos foco', async () => {
    const { fixture, root } = await render('video');
    expect(root.querySelectorAll('button, a, input, select, textarea, [tabindex], [autofocus]')).toHaveLength(0);
    expect(document.activeElement).not.toBe(root.querySelector('.sr-only'));
    fixture.componentRef.setInput('variant', 'index');
    await fixture.whenStable();
    expect(root.querySelector('.skeleton')?.getAttribute('data-variant')).toBe('index');
    expect(root.querySelector('.skeleton__index-row')).not.toBeNull();
  });

  it('declara aspect-ratio 16/9 y alturas estables por regla', () => {
    expect(code).toMatch(/\.skeleton__video[^{}]*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
    expect(code).toMatch(/\.skeleton__visual[^{}]*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
    expect(code).toMatch(/--sk-title:\s*var\(--font-size-2xl\)/);
    expect(code).toMatch(/\.skeleton__title\s*\{[^}]*block-size:\s*var\(--sk-title\)/);
    expect(code).toMatch(/\.skeleton__line\s*\{[^}]*block-size:\s*var\(--sk-line\)/);
    expect(code).toMatch(/\.skeleton__row\s*\{[^}]*block-size:\s*var\(--sk-row\)/);
    expect(code).toMatch(/\.skeleton__index-row\s*\{[^}]*block-size:/);
  });

  it('el shimmer solo se declara con prefers-reduced-motion: no-preference', () => {
    expect(code).toMatch(/@keyframes\s+skeleton-shimmer/);
    expect(code).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[\s\S]*animation:\s*skeleton-shimmer/,
    );
    expect(code.match(/animation:/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('usa tokens de tema para color, radio y espaciado, sin colores hardcodeados', () => {
    for (const token of [
      '--surface', '--border', '--muted', '--radius', '--radius-sm', '--radius-md',
      '--space-3', '--space-4', '--border-width', '--card-pad', '--tap-min',
      '--font-size-2xl',
    ]) {
      expect(code).toContain(`var(${token})`);
    }
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/\brgba?\(|\bhsla?\(/i);
  });

  it('es presentacional: sin peticiones, repositorios ni estado propio', () => {
    const source = readFileSync(TS_PATH, 'utf8');
    expect(source).not.toMatch(/HttpClient|fetch\(|repository|\.subscribe\(/i);
    expect(source).toContain("input('Cargando contenido…')");
  });
});
