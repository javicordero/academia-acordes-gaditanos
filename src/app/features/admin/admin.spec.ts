import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Admin } from './admin';
import { Course, CoursesRepository } from './courses-repository';

describe('Administración de cursos', () => {
  it('muestra carga, vacío, formulario y vuelta', async () => {
    let resolve!: (value: never[]) => void;
    const list = vi.fn(() => new Promise<never[]>((done) => { resolve = done; }));
    TestBed.configureTestingModule({ imports: [Admin], providers: [
      { provide: CoursesRepository, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(Admin);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cargando cursos');
    resolve([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay cursos disponibles');
    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('h2')?.textContent).toContain('Crear curso');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('El título debe tener');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Volver'))!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay cursos disponibles');
    expect(document.activeElement?.textContent).toBe('Cursos');
  });

  it('ignora respuestas de carga anteriores a la más reciente', async () => {
    const pending: ((value: Course[]) => void)[] = [];
    const list = vi.fn(() => new Promise<Course[]>((resolve) => pending.push(resolve)));
    TestBed.configureTestingModule({ imports: [Admin], providers: [
      { provide: CoursesRepository, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(Admin);
    const latest = fixture.componentInstance.load();
    pending[1]([{ id: '1', slug: 'nuevo', title: 'Nuevo', summary: null, description: null, level: 'basico', status: 'draft', sort_order: 0, published_at: null }]);
    await latest;
    pending[0]([]);
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nuevo');
    expect(fixture.nativeElement.textContent).not.toContain('No hay cursos disponibles');
  });

  it('muestra error y permite reintentar', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValue([]);
    TestBed.configureTestingModule({ imports: [Admin], providers: [
      { provide: CoursesRepository, useValue: { list } },
    ] });
    const fixture = TestBed.createComponent(Admin);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No se han podido cargar');
    expect(el.textContent).not.toContain('private');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reintentar'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('No hay cursos disponibles');
  });
});
