import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaRepository } from '../../aula/aula-repository';
import { LessonMaterials } from '../../aula/lesson-materials/lesson-materials';
import { PlaybackSource, VideoPlaybackService } from '../../aula/video-playback';
import { PreviewRepository } from './preview-repository';
import { Preview } from './preview';

@Component({ selector: 'app-lesson-materials', template: '' })
class MaterialsStub {
  readonly lessonId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly returnUrl = input.required<string>();
  readonly primary = input(false);
}

/** Fuente firmada ficticia: no hay red, claves ni secretos en estas pruebas. */
function fakeSource(notice = 'Aviso del proveedor', expiresAt?: number): PlaybackSource {
  const sanitizer = TestBed.inject(DomSanitizer);
  return {
    embedUrl: sanitizer.bypassSecurityTrustResourceUrl('https://player.mediadelivery.net/embed/1/00000000-0000-0000-0000-000000000000'),
    notice,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function buttonWith(root: HTMLElement | null, label: string): HTMLButtonElement {
  return [...(root?.querySelectorAll('button') ?? [])].find(b => b.textContent?.includes(label))!;
}

describe('Vista previa administrativa', () => {
  const courseId = '11111111-1111-1111-1111-111111111111';
  const sectionId = '22222222-2222-2222-2222-222222222222';
  const firstId = '33333333-3333-3333-3333-333333333333';
  const secondId = '44444444-4444-4444-4444-444444444444';
  const foreignId = '55555555-5555-5555-5555-555555555555';
  const course = { id: courseId, title: 'Curso borrador' };
  const sections = [{ id: sectionId, course_id: courseId, title: 'Bloque', summary: null, position: 0 }];
  const first = { id: firstId, course_id: courseId, section_id: sectionId, slug: 'primera',
    title: 'Primera', summary: null, content_md: '<img src=x onerror=alert(1)>', position: 0,
    duration_seconds: null, is_free_preview: false, is_published: false, content_type: 'video' as const };
  const second = { ...first, id: secondId, title: 'Segunda', content_md: 'Texto', position: 1 };
  const lessons = [first, second];
  const load = vi.fn();
  const path = (id?: string) => `/admin/vista-previa/${courseId}${id ? '/' + id : ''}`;
  let harness: RouterTestingHarness;
  let session: ReturnType<typeof signal<{ user: { id: string } } | null>>;
  let authStatus: ReturnType<typeof signal<'loading' | 'authenticated' | 'anonymous' | 'unconfigured'>>;
  let source: ReturnType<typeof vi.fn>;
  let progressSave: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    load.mockReset();
    session = signal<{ user: { id: string } } | null>({ user: { id: 'admin' } });
    authStatus = signal<'loading' | 'authenticated' | 'anonymous' | 'unconfigured'>('authenticated');
    source = vi.fn(() => null);
    progressSave = vi.fn().mockResolvedValue(undefined);
    load.mockImplementation(async (_course: string, id: string | null) =>
      ({ course, sections, lessons, lesson: id ? lessons.find(l => l.id === id) ?? null : first }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'admin/vista-previa/:courseId/:lessonId', component: Preview },
        { path: 'admin/vista-previa/:courseId', component: Preview },
      ]),
      { provide: AuthService, useValue: { session, status: authStatus, isAdmin: signal(true) } },
      { provide: PreviewRepository, useValue: { load } },
      { provide: VideoPlaybackService, useValue: { sourceForLesson: source } },
      { provide: AulaRepository, useValue: { load: vi.fn(), save: progressSave } },
    ] });
    TestBed.overrideComponent(Preview, { remove: { imports: [LessonMaterials] }, add: { imports: [MaterialsStub] } });
    harness = await RouterTestingHarness.create();
  });

  it('muestra borrador con texto escapado, aviso y progreso de solo lectura', async () => {
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable();
    const root = harness.routeNativeElement!;
    expect(root.textContent).toContain('Vista previa de administración. No implica compra ni matrícula.');
    expect(root.textContent).toContain(first.content_md);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('En la vista previa no se guarda progreso de alumno.');
    expect(root.textContent).toContain('Curso borrador');
    expect(root.querySelector('button')?.textContent ?? '').not.toContain('completada');
    expect(load).toHaveBeenCalledWith(courseId, firstId);
  });

  it('muestra PDF sin reproductor y mantiene progreso deshabilitado', async () => {
    const pdf = { ...first, content_type: 'pdf' as const };
    load.mockResolvedValueOnce({ course, sections, lessons: [pdf], lesson: pdf });
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('iframe, .video-stage')).toBeNull();
    expect(source).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>('nav[aria-label="Navegación entre lecciones"] button')?.disabled).toBe(true);
    expect(root.querySelector('app-lesson-materials')).not.toBeNull();
  });

  it('explica cuando el curso no tiene lecciones', async () => {
    load.mockResolvedValueOnce({ course, sections: [], lessons: [], lesson: null });
    await harness.navigateByUrl(path(), Preview);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Curso borrador');
    expect(harness.routeNativeElement?.textContent).toContain('Añade una lección');
  });

  it('rechaza una lección ajena que el repositorio no encuentra en el curso', async () => {
    await harness.navigateByUrl(path(foreignId), Preview);
    await harness.fixture.whenStable();
    expect(load).toHaveBeenCalledWith(courseId, foreignId);
    expect(harness.routeNativeElement?.textContent).toContain('no está disponible');
    expect(harness.routeNativeElement?.textContent).not.toContain('Primera');
  });

  it('navega por las lecciones del curso y conserva el foco en el contenido', async () => {
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    // El montaje automático del vídeo no roba el foco al reproductor.
    expect(document.activeElement === document.body || document.activeElement?.id === 'preview-heading').toBe(true);
    const h2 = harness.routeNativeElement?.querySelector<HTMLElement>('article h2')!;
    h2.focus();
    const next = harness.routeNativeElement?.querySelector('nav[aria-label="Navegación entre lecciones"] a');
    expect(next?.textContent).toContain('Siguiente: Segunda');
    expect(next?.getAttribute('href')).toBe(path(secondId));
    await harness.navigateByUrl(path(secondId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    // El montaje automático del vídeo no roba el foco al reproductor.
    expect(document.activeElement === document.body || document.activeElement?.id === 'preview-heading').toBe(true);
    const previous = harness.routeNativeElement?.querySelector('nav[aria-label="Navegación entre lecciones"] a');
    expect(previous?.textContent).toContain('Anterior: Primera');
    expect(previous?.getAttribute('href')).toBe(path(firstId));
    expect(TestBed.inject(Router).url).toBe(path(secondId));
  });

  it('descarta una carga antigua cuando cambian los parámetros', async () => {
    let resolveOld!: (data: { course: typeof course; sections: typeof sections; lessons: typeof lessons; lesson: typeof first }) => void;
    let calls = 0;
    load.mockImplementation(() => ++calls === 1
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve({ course, sections, lessons, lesson: lessons.find(l => l.id === secondId)! }));
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(document.activeElement?.tagName).not.toBe('IFRAME');
    await harness.navigateByUrl(path(secondId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    resolveOld({ course, sections, lessons, lesson: first });
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('article h2')?.textContent).toContain('Segunda');
    // La respuesta obsoleta de Primera no debe robar el foco de la lección actual.
    expect(document.activeElement === document.body || document.activeElement?.id === 'preview-heading').toBe(true);
  });

  it('resuelve la primera lección tras una carga asíncrona y no recarga al refrescar la misma sesión', async () => {
    let resolve!: (value: { course: typeof course; sections: typeof sections; lessons: typeof lessons; lesson: typeof first }) => void;
    load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const component = await harness.navigateByUrl(path(), Preview);
    harness.detectChanges();
    expect(component.state()).toBe('loading');
    session.set({ user: { id: 'admin' } });
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    resolve({ course, sections, lessons, lesson: first });
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.state()).toBe('ready');
    expect(harness.routeNativeElement?.querySelector('[aria-current="page"]')?.textContent).toContain('Primera');
    session.set({ user: { id: 'admin' } });
    harness.detectChanges();
    expect(component.state()).toBe('ready');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('monta el vídeo automáticamente al entrar, sin botón inicial', async () => {
    source.mockResolvedValueOnce(fakeSource());
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(source).toHaveBeenCalledWith(firstId);
    expect(buttonWith(root, 'Ver vídeo de la lección')).toBeFalsy();
    expect(root.textContent).not.toContain('YouTube');
    expect(root.textContent).not.toContain('Vídeo de ejemplo');
    expect(root.querySelector('iframe')).not.toBeNull();
  });

  it('pasa de loading a ready con iframe accesible y aviso, sin robar el foco', async () => {
    let resolveSource!: (value: PlaybackSource | null) => void;
    source.mockReturnValueOnce(new Promise<PlaybackSource | null>(resolve => { resolveSource = resolve; }));
    const component = await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    expect(component.videoState()).toBe('loading');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando el vídeo');
    expect(root.querySelector('iframe')).toBeNull();

    resolveSource(fakeSource('Aviso del proveedor'));
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.videoState()).toBe('ready');
    const iframe = root.querySelector<HTMLIFrameElement>('iframe')!;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('title')).toContain('Vídeo de la lección');
    expect(iframe.getAttribute('loading')).toBe('eager');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');
    expect(iframe.getAttribute('allow')).toBe('fullscreen; encrypted-media');
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.hasAttribute('autoplay')).toBe(false);
    expect(iframe.getAttribute('src') ?? '').not.toMatch(/[?&](autoplay|mute)=/i);
    expect(document.activeElement).not.toBe(iframe);
    expect(root.textContent).toContain('Aviso del proveedor');
  });

  it('un rechazo automático muestra alerta y Reintentar vuelve a pedir la fuente', async () => {
    source.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(fakeSource());
    const component = await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();

    expect(source).toHaveBeenCalledTimes(1);
    expect(component.videoState()).toBe('error');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar el vídeo');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();

    buttonWith(harness.routeNativeElement, 'Reintentar').click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledTimes(2);
    expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
  });

  it('sin fuente muestra un mensaje honesto sin iframe', async () => {
    source.mockResolvedValueOnce(null);
    const component = await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();

    expect(source).toHaveBeenCalledTimes(1);
    expect(component.videoState()).toBe('unavailable');
    expect(harness.routeNativeElement?.textContent).toContain('La reproducción aún no está configurada');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.video-stage button')).toBeNull();
  });

  it('al caducar la firma retira el iframe y permite renovar explícitamente', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
      source.mockImplementation(() => Promise.resolve(fakeSource('Aviso del proveedor', Date.now() + 60_000)));
      const component = await harness.navigateByUrl(path(firstId), Preview);
      // whenStable() esperaría al temporizador de caducidad: usar microtareas.
      await Promise.resolve();
      harness.detectChanges();
      expect(component.videoState()).toBe('ready');
      expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();

      vi.advanceTimersByTime(60_000);
      harness.detectChanges();
      expect(component.videoState()).toBe('expired');
      const notice = harness.routeNativeElement?.querySelector('[role="status"]')!;
      expect(notice.textContent).toContain('El enlace del vídeo ha caducado');
      expect(notice.getAttribute('aria-live')).toBe('polite');
      expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
      expect(harness.routeNativeElement?.textContent).toContain('Aviso del proveedor');

      const calls = source.mock.calls.length;
      harness.routeNativeElement?.querySelector<HTMLButtonElement>('.video-button')?.click();
      await Promise.resolve();
      harness.detectChanges();
      expect(source.mock.calls.length).toBe(calls + 1);
      expect(component.videoState()).toBe('ready');
      expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin expiresAt no programa caducidad (modo DEV sin firma)', async () => {
    source.mockResolvedValue(fakeSource('Enlace sin caducidad'));
    const component = await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.videoState()).toBe('ready');

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
      vi.advanceTimersByTime(60 * 60 * 1000);
      harness.detectChanges();
      expect(component.videoState()).toBe('ready');
      expect(harness.routeNativeElement?.textContent).toContain('Enlace sin caducidad');
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarta una fuente lenta de la lección anterior al navegar', async () => {
    let resolveSource!: (value: PlaybackSource | null) => void;
    let call = 0;
    source.mockImplementation(() => ++call === 1
      ? new Promise<PlaybackSource | null>(resolve => { resolveSource = resolve; })
      : Promise.resolve(fakeSource('Aviso de la segunda')));
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledWith(firstId);

    const component = await harness.navigateByUrl(path(secondId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledWith(secondId);
    expect(component.videoState()).toBe('ready');

    resolveSource(fakeSource('Aviso obsoleto'));
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.videoSource()?.notice).toBe('Aviso de la segunda');
    expect(harness.routeNativeElement?.textContent).not.toContain('Aviso obsoleto');
  });

  it('no roba el foco del vídeo al refrescar la sesión', async () => {
    source.mockResolvedValue(fakeSource());
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();

    const iframe = harness.routeNativeElement?.querySelector('iframe')!;
    expect(iframe).not.toBeNull();
    expect(document.activeElement).not.toBe(iframe);
    session.set({ user: { id: 'admin' } });
    harness.detectChanges();
    expect(source).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(iframe);
  });

  it('mantiene el progreso deshabilitado y no escribe en ningún repositorio de progreso', async () => {
    await harness.navigateByUrl(path(firstId), Preview);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const progress = root.querySelector<HTMLButtonElement>('nav[aria-label="Navegación entre lecciones"] button')!;
    expect(progress.disabled).toBe(true);
    expect(progress.getAttribute('aria-describedby')).toBe('preview-progress');
    expect(root.textContent).toContain('En la vista previa no se guarda progreso de alumno.');
    progress.click();
    expect(progressSave).not.toHaveBeenCalled();
  });

  it('con la sesión cargando no consulta y, al autenticarse, carga y monta el vídeo una sola vez', async () => {
    authStatus.set('loading');
    source.mockResolvedValue(fakeSource('Aviso del proveedor'));
    const component = await harness.navigateByUrl(path(firstId), Preview);
    harness.detectChanges();
    expect(component.state()).toBe('loading');
    expect(harness.routeNativeElement?.textContent).toContain('Cargando lección');
    expect(load).not.toHaveBeenCalled();
    expect(source).not.toHaveBeenCalled();

    authStatus.set('authenticated');
    harness.detectChanges();
    await harness.fixture.whenStable(); harness.detectChanges();
    // La firma se pide después de la carga: deja resolver su promesa.
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(courseId, firstId);
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith(firstId);
    expect(component.state()).toBe('ready');
    expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
  });

  it('la pérdida de sesión retira datos y vídeo y descarta respuestas tardías', async () => {
    let resolveLoad!: (value: unknown) => void;
    let resolveSource!: (value: PlaybackSource | null) => void;
    load.mockReturnValueOnce(new Promise(r => { resolveLoad = r; }));
    source.mockReturnValueOnce(new Promise<PlaybackSource | null>(r => { resolveSource = r; }));
    const component = await harness.navigateByUrl(path(firstId), Preview);
    harness.detectChanges();
    expect(component.state()).toBe('loading');

    authStatus.set('anonymous');
    session.set(null);
    harness.detectChanges();
    expect(component.state()).toBe('denied');
    expect(component.data()).toBeNull();
    expect(component.videoSource()).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Curso borrador');

    resolveLoad({ course, sections, lessons, lesson: first });
    resolveSource(fakeSource('Respuesta obsoleta'));
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.state()).toBe('denied');
    expect(component.videoSource()).toBeNull();
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('Respuesta obsoleta');
  });

  it('pasar de loading a autenticado no roba el foco de la navegación principal', async () => {
    authStatus.set('loading');
    source.mockResolvedValue(fakeSource());
    await harness.navigateByUrl(path(firstId), Preview);
    harness.detectChanges();
    const back = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a.preview-action')!;
    back.focus();
    expect(document.activeElement).toBe(back);

    authStatus.set('authenticated');
    harness.detectChanges();
    await harness.fixture.whenStable(); harness.detectChanges();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
    expect(document.activeElement).toBe(back);
  });
});
