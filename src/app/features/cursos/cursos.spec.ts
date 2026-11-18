import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { Cursos } from './cursos';
import { PublicCourse, PublicCoursesRepository } from './public-courses-repository';

describe('Catálogo', () => {
  it('presenta texto escapado y enlace a la ficha', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: '<script>texto</script>', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<script>texto</script>');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/cursos/ejemplo');
  });
  it('muestra error y reintento', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockRejectedValue(new Error('failed')) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar');
  });

  it('no pisa la respuesta reciente con una carga antigua al reintentar', async () => {
    const antiguo: PublicCourse = { id: '1', slug: 'antiguo', title: 'Antiguo', summary: null, description: null, level: 'basico' };
    const nuevo: PublicCourse = { id: '2', slug: 'nuevo', title: 'Nuevo', summary: null, description: null, level: 'basico' };
    let resolveAntiguo: (value: PublicCourse[]) => void;
    let resolveNuevo: (value: PublicCourse[]) => void;
    const primera = new Promise<PublicCourse[]>((resolve) => { resolveAntiguo = resolve; });
    const segunda = new Promise<PublicCourse[]>((resolve) => { resolveNuevo = resolve; });
    const list = vi.fn().mockReturnValueOnce(primera).mockReturnValueOnce(segunda);
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    const component = fixture.componentInstance;
    // El constructor ya lanzó la primera carga; simular un reintento (segunda carga).
    const recarga = component.load();

    // La respuesta reciente (segunda) llega antes y se aplica.
    resolveNuevo!([nuevo]);
    await recarga;
    expect(component.courses()).toEqual([nuevo]);

    // La respuesta antigua (primera) llega después y no debe sobrescribirla.
    resolveAntiguo!([antiguo]);
    await primera;
    await fixture.whenStable();
    expect(component.courses()).toEqual([nuevo]);
  });

  it('con el flag apagado no ofrece compra desde el catálogo', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: 'Ejemplo', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).not.toContain('Modo de prueba');
    expect(root.querySelector('app-checkout-button')?.textContent?.trim()).toBe('');
    expect(root.querySelector('app-checkout-button a')).toBeNull();
  });

  it('con el flag activo muestra el aviso y enlaza cada curso a su ficha con intención', async () => {
    TestBed.configureTestingModule({ imports: [Cursos], providers: [
      provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: true } },
      { provide: PublicCoursesRepository, useValue: { list: vi.fn().mockResolvedValue([
        { id: '1', slug: 'ejemplo', title: 'Ejemplo', summary: null, level: 'basico' },
      ]) } },
    ] });
    const fixture = TestBed.createComponent(Cursos);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Modo de prueba — no se realizan cobros reales');
    const href = root.querySelector('app-checkout-button a')?.getAttribute('href') ?? '';
    const parsed = new URL(href, 'https://interno.test');
    expect(parsed.pathname).toBe('/cursos/ejemplo');
    expect(parsed.searchParams.get('comprar')).toBe('1');
  });
});
