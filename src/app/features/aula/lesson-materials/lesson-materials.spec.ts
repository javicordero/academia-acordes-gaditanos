import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { LessonMaterials } from './lesson-materials';

const item = { id: 'resource', title: '<b>Apuntes</b>', kind: 'pdf' as const };
const url = 'https://example.test/storage/v1/object/sign/lesson-pdfs/course/lesson/resource/file.pdf?token=temporary';

describe('Materiales del alumno', () => {
  afterEach(() => vi.useRealTimers());
  function setup(list = vi.fn().mockResolvedValue([item]), download = vi.fn().mockResolvedValue(url), authenticated = true) {
    const status = signal(authenticated ? 'authenticated' : 'anonymous');
    const session = signal<{user: {id: string}} | null>(authenticated ? {user: {id: 'one'}} : null);
    const error = signal<string | null>(null);
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: SUPABASE_CONFIG, useValue: { url: 'https://example.test', publishableKey: 'public' } },
      { provide: AuthService, useValue: { status, session, error } },
      { provide: LessonResources, useValue: { list, download } },
    ] });
    const fixture = TestBed.createComponent(LessonMaterials);
    fixture.componentRef.setInput('courseId', 'course');
    fixture.componentRef.setInput('lessonId', 'lesson');
    fixture.componentRef.setInput('returnUrl', '/aula/curso/uno');
    return { fixture, status, session, error, list, download };
  }
  it('no consulta anónimamente y ofrece acceso interno', async () => {
    const {fixture, list} = setup(undefined, undefined, false);
    await fixture.whenStable();
    expect(list).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toContain('/auth/login');
  });
  it('muestra lista escapada, prepara solo al pulsar y elimina enlace al caducar', async () => {
    const {fixture, download} = setup();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
    expect(download).not.toHaveBeenCalled();
    vi.useFakeTimers();
    fixture.nativeElement.querySelector('button').click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(download).toHaveBeenCalledWith('lesson', 'resource');
    expect(fixture.nativeElement.querySelector('a[download]')?.getAttribute('href')).toBe(url);
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
  });
  it('presenta vacío y errores genéricos de listado sin revelar recursos', async () => {
    const {fixture} = setup(vi.fn().mockResolvedValue([]));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No hay materiales');
  });
  it.each(['401', '403', 'SDK'])('error %s no revela recursos', async error => {
    const {fixture} = setup(vi.fn().mockRejectedValue(new Error(error)));
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se puede acceder');
    expect(fixture.nativeElement.textContent).not.toContain(error);
  });
  it.each(['javascript:alert(1)', 'https://evil.test/storage/v1/object/sign/lesson-pdfs/course/lesson/resource/file.pdf?token=x', 'https://example.test/storage/v1/object/sign/other/x?token=x'])('rechaza URL insegura %s', async url => {
    const {fixture} = setup(undefined, vi.fn().mockResolvedValue(url));
    await fixture.whenStable();
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No se pudo preparar');
  });
  it('recupera el botón tras un error de red', async () => {
    const {fixture} = setup(undefined, vi.fn().mockRejectedValue(new Error('red')));
    await fixture.whenStable();
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
  });
  it('refresco no recarga; logout descarta respuesta tardía', async () => {
    let resolve!: (value: string) => void;
    const {fixture, list, session, status} = setup(undefined, vi.fn(() => new Promise<string>(r => resolve = r)));
    await fixture.whenStable();
    session.set({user: {id: 'one'}});
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(1);
    fixture.nativeElement.querySelector('button').click();
    session.set(null); status.set('anonymous');
    resolve(url);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(item.title);
  });
  it('descarta listado tardío al cambiar de lección', async () => {
    let resolve!: (value: typeof item[]) => void;
    const list = vi.fn().mockReturnValueOnce(new Promise(r => resolve = r)).mockResolvedValueOnce([]);
    const {fixture} = setup(list);
    fixture.detectChanges();
    fixture.componentRef.setInput('lessonId', 'other');
    fixture.detectChanges();
    resolve([item]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain(item.title);
  });
  it('anuncia Preparando y después Enlace listo en una región persistente sin filtrar la URL firmada', async () => {
    let resolveDownload!: (value: string) => void;
    const download = vi.fn(() => new Promise<string>(resolve => { resolveDownload = resolve; }));
    const {fixture} = setup(undefined, download);
    await fixture.whenStable();
    vi.useFakeTimers();

    const region = () => fixture.nativeElement.querySelector('[role="status"][aria-live="polite"]') as HTMLElement;
    const persistent = region();
    expect(persistent).not.toBeNull();
    expect(persistent.textContent).not.toContain('Preparando');
    expect(persistent.textContent).not.toContain('Enlace listo');

    fixture.nativeElement.querySelector('button').click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(download).toHaveBeenCalledWith('lesson', 'resource');
    expect(region()).toBe(persistent);
    expect(persistent.textContent).toContain('Preparando');
    expect(persistent.textContent).not.toContain(url);

    resolveDownload(url);
    await Promise.resolve();
    fixture.detectChanges();
    expect(region()).toBe(persistent);
    expect(persistent.textContent).toContain('Enlace listo para descargar: ' + item.title);
    expect(persistent.textContent).not.toContain(url);
    expect(persistent.textContent).not.toContain('token');
    const link = fixture.nativeElement.querySelector('a[download]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(url);
    expect(document.activeElement).not.toBe(link);
  });
  it('etiqueta cada botón de forma única sin romper el texto visible', async () => {
    const second = { id: 'resource-2', title: 'Partitura', kind: 'pdf' as const };
    const {fixture} = setup(vi.fn().mockResolvedValue([item, second]));
    await fixture.whenStable();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    const labels = buttons.map(button => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Preparar descarga de ' + item.title, 'Preparar descarga de ' + second.title]);
    expect(new Set(labels).size).toBe(2);
    expect(buttons.every(button => button.textContent?.trim() === 'Preparar descarga')).toBe(true);
  });
  it('al caducar el enlace retira el aviso de la región persistente', async () => {
    const {fixture} = setup();
    await fixture.whenStable();
    vi.useFakeTimers();
    const region = () => fixture.nativeElement.querySelector('[role="status"][aria-live="polite"]') as HTMLElement;
    const persistent = region();
    fixture.nativeElement.querySelector('button').click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[download]')).not.toBeNull();
    expect(persistent.textContent).toContain('Enlace listo');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(region()).toBe(persistent);
    expect(persistent.textContent).not.toContain('Enlace listo');
    expect(persistent.textContent).not.toContain(url);
    expect(fixture.nativeElement.querySelector('a[download]')).toBeNull();
  });
});
