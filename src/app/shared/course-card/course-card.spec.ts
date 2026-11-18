import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { CourseAccess, PublicCourse } from '../../features/cursos/public-courses-repository';
import { CourseCard } from './course-card';

describe('CourseCard', () => {
  const curso: PublicCourse = {
    id: '1',
    slug: 'pasodoble',
    title: 'Pasodoble desde cero',
    summary: 'Ritmo y mano derecha',
    description: null,
    level: 'iniciacion',
  };

  async function render(checkoutTestEnabled = false, accessState?: CourseAccess, courseInput: PublicCourse = curso) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CourseCard], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled } },
    ] });
    const fixture = TestBed.createComponent(CourseCard);
    fixture.componentRef.setInput('course', courseInput);
    if (accessState) fixture.componentRef.setInput('accessState', accessState);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra nivel, título, resumen y visual decorativo con jerarquía', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('article.card');
    expect(card).not.toBeNull();
    expect(root.querySelector('.card__visual')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.card__level')?.textContent?.trim()).toBe('Iniciación');
    expect(root.querySelector('h2.card__title')?.textContent?.trim()).toBe(curso.title);
    expect(root.querySelector('.card__summary')?.textContent?.trim()).toBe(curso.summary);
    expect(root.querySelector('h2.card__title')?.id).toBe('curso-titulo-pasodoble');
    expect(root.textContent).not.toMatch(/\d+\s*€|profesor|testimonio/i);
  });

  it('la acción «Ver curso» conserva el nombre accesible visible y apunta a la ficha', async () => {
    const fixture = await render();
    const link = (fixture.nativeElement as HTMLElement).querySelector('.card__view');
    expect(link?.textContent?.trim()).toBe('Ver curso');
    expect(link?.hasAttribute('aria-label')).toBe(false);
    expect(link?.getAttribute('href')).toBe('/cursos/pasodoble');
    expect(link?.getAttribute('aria-describedby')).toBe('curso-titulo-pasodoble');
    expect(link?.classList.contains('button')).toBe(true);
  });

  it('reacciona a cambios del input course sin lógica propia de datos', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('course', { ...curso, id: '2', slug: 'cuples', title: 'Cuplés', level: 'basico' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.card__title')?.textContent?.trim()).toBe('Cuplés');
    expect(root.querySelector('.card__level')?.textContent?.trim()).toBe('Básico');
    expect(root.querySelector('.card__view')?.getAttribute('href')).toBe('/cursos/cuples');
    expect(root.querySelector('.card__title')?.id).toBe('curso-titulo-cuples');
  });

  it('no decide la compra: sin flag no hay CTA y con flag delega en el botón existente', async () => {
    const sinFlag = await render(false);
    const rootSinFlag = sinFlag.nativeElement as HTMLElement;
    expect(rootSinFlag.querySelector('app-checkout-button')?.textContent?.trim()).toBe('');
    expect(rootSinFlag.querySelector('app-checkout-button a')).toBeNull();

    const conFlag = await render(true);
    const rootConFlag = conFlag.nativeElement as HTMLElement;
    const cta = rootConFlag.querySelector('app-checkout-button a');
    expect(cta).not.toBeNull();
    const parsed = new URL(cta?.getAttribute('href') ?? '', 'https://interno.test');
    expect(parsed.pathname).toBe('/cursos/pasodoble');
    expect(parsed.searchParams.get('comprar')).toBe('1');
    expect(rootConFlag.textContent).not.toContain('Modo de prueba — no se realizan cobros reales');
  });

  it('acepta accessState opcional sin alterar la acción ni duplicar checkout', async () => {
    const sinEstado = (await render(true)).nativeElement as HTMLElement;
    expect(sinEstado.querySelector('article.card')?.hasAttribute('data-access')).toBe(false);

    const conEstado = (await render(true, 'granted')).nativeElement as HTMLElement;
    expect(conEstado.querySelector('article.card')?.getAttribute('data-access')).toBe('granted');
    expect(conEstado.querySelectorAll('app-checkout-button')).toHaveLength(1);
    expect(conEstado.querySelectorAll('app-checkout-button a')).toHaveLength(1);
    expect(conEstado.querySelector('app-checkout-button button')).toBeNull();
  });

  it('omite el resumen cuando el curso no lo tiene', async () => {
    const fixture = await render(false, undefined, { ...curso, summary: null });
    expect((fixture.nativeElement as HTMLElement).querySelector('.card__summary')).toBeNull();
  });
});
