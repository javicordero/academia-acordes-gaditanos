import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaLesson, AulaRepository } from '../aula-repository';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { AULA_ROUTES } from '../aula.routes';
import { Aula } from './aula';
import { PlaybackSource, VIDEO_DEMO_CONFIG, VIDEO_DEMO_ENABLED, VideoPlaybackService } from '../video-playback';

const lesson = { id: 'l', section_id: 's', slug: 'uno', title: 'Lección', content_type: 'video' as const };
const data: AulaData = { course: { id: 'c', title: 'Curso' }, lesson, sections: [{id: 's', title: 'Bloque'}], lessons: [lesson], canTrack: true, completed: false, completedLessonIds: [] };
const firstLesson = { ...lesson, id: 'l1', slug: 'uno' };
const secondLesson = { ...lesson, id: 'l2', slug: 'dos' };
const twoLessons: AulaData = {
  course: { id: 'c', title: 'Curso' },
  lesson: firstLesson,
  sections: [{ id: 's', title: 'Bloque' }],
  lessons: [firstLesson, secondLesson],
  canTrack: true,
  completed: false,
  completedLessonIds: [],
};

/** Fuente firmada ficticia: no hay red, claves ni secretos en estas pruebas. */
function fakeSource(notice = 'Aviso del servidor', expiresAt?: number): PlaybackSource {
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

describe('Aula', () => {
  function setup(
    load: ReturnType<typeof vi.fn>,
    save = vi.fn().mockResolvedValue(undefined),
    user = true,
    sourceForLesson: () => PlaybackSource | null | Promise<PlaybackSource | null> = () => null,
  ) {
    const status = signal(user ? 'authenticated' : 'anonymous');
    const session = signal(user ? { user: { id: 'u' } } : null);
    const error = signal<string | null>(null);
    const source = vi.fn(sourceForLesson);
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'aula', children: AULA_ROUTES }]),
      { provide: AuthService, useValue: { status, session, error } },
      { provide: AulaRepository, useValue: { load, save } },
      { provide: VideoPlaybackService, useValue: { sourceForLesson: source } },
    ] });
    return { save, session, status, error, source };
  }

  it('sitúa el progreso entre los extremos de navegación sin enlaces rotos', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const nav = harness.routeNativeElement!.querySelector('nav[aria-label="Navegación entre lecciones"]')!;
    expect(nav.textContent).toContain('Primera lección');
    expect(nav.querySelector('button')?.disabled).toBe(false);
    expect(nav.querySelectorAll('a').length).toBe(1);
    expect(nav.querySelector('a')?.textContent).toContain('Siguiente');
  });

  it('no renderiza la descripción de la lección y guarda progreso manual', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('script')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('<script>texto</script>');
    expect(harness.routeNativeElement?.textContent).not.toContain('Contenido de la lección');
    expect(harness.routeNativeElement?.textContent).not.toContain('contenido escrito');
    expect(harness.routeNativeElement?.querySelector('h1')?.getAttribute('tabindex')).toBe('-1');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Lección');
    await component.toggleProgress();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(component.data()?.completed).toBe(true);
  });

  it('PDF y texto nunca cargan vídeo, incluso con configuración de demo', async () => {
    const pdf = { ...firstLesson, content_type: 'pdf' as const };
    const text = { ...secondLesson, content_type: 'text' as const };
    const { source } = setup(vi.fn((_course: string, slug: string) =>
      Promise.resolve({ ...twoLessons, lesson: slug === 'dos' ? text : pdf, lessons: [pdf, text] })));
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: true },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l1: 'demo', l2: 'demo' } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('iframe, .video-stage')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Materiales de la lección');
    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('iframe, .video-stage')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('script')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('<script>texto</script>');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Lección');
    expect(source).not.toHaveBeenCalled();
  });

  it('usa textos agnósticos del proveedor y monta el vídeo solo al entrar', async () => {
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true,
      () => Promise.resolve(fakeSource()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('Vídeo de la lección');
    expect(text).not.toContain('YouTube');
    expect(text).not.toContain('Vídeo de ejemplo');
    // Se pide la fuente y aparece el iframe sin clic previo del alumno.
    expect(source).toHaveBeenCalledWith('l');
    expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
    const buttons = Array.from(harness.routeNativeElement?.querySelectorAll('button') ?? []);
    expect(buttons.some(b => b.textContent?.includes('Ver vídeo'))).toBe(false);
  });

  it('pasa de loading a ready con iframe accesible, aviso y sin robar el foco', async () => {
    let resolveSource!: (value: PlaybackSource | null) => void;
    const pending = new Promise<PlaybackSource | null>(r => resolveSource = r);
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true, () => pending);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    // Montaje automático al entrar: estado de carga visible y sin botón que pulsar.
    expect(source).toHaveBeenCalledWith('l');
    expect(component.videoState()).toBe('loading');
    expect(harness.routeNativeElement?.querySelector('[role="status"]')?.textContent).toContain('Cargando el vídeo');
    expect(buttonWith(harness.routeNativeElement, 'Ver vídeo')).toBeFalsy();

    resolveSource(fakeSource('Aviso del servidor'));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.videoState()).toBe('ready');
    const iframe = harness.routeNativeElement?.querySelector<HTMLIFrameElement>('iframe')!;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('title')).toContain('Vídeo de la lección');
    expect(iframe.getAttribute('loading')).toBe('eager');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation');
    expect(iframe.getAttribute('allow')).toBe('fullscreen; encrypted-media');
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(iframe.hasAttribute('autoplay')).toBe(false);
    expect(iframe.getAttribute('src') ?? '').not.toMatch(/[?&](autoplay|mute)=/i);
    // No se roba el foco al montar el reproductor.
    expect(document.activeElement).not.toBe(iframe);
    expect(harness.routeNativeElement?.textContent).toContain('Aviso del servidor');
  });

  it('sin fuente muestra un mensaje honesto, nunca carga un iframe y no ofrece reintento inútil', async () => {
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true, () => Promise.resolve(null));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    // Se pide sola al entrar, sin clic.
    expect(source).toHaveBeenCalledTimes(1);
    expect(component.videoState()).toBe('unavailable');
    expect(harness.routeNativeElement?.textContent).toContain('La reproducción aún no está configurada. La lección puede tener vídeo, PDF o texto.');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.video-stage button')).toBeNull();
  });

  it('un rechazo automático muestra alerta y Reintentar vuelve a pedir la fuente', async () => {
    const responses = vi.fn<() => PlaybackSource | null | Promise<PlaybackSource | null>>()
      .mockRejectedValueOnce(new Error('red'))
      .mockImplementationOnce(() => Promise.resolve(fakeSource()));
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true, () => responses());
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    // Primer intento automático al entrar, sin pulsar nada.
    expect(component.videoState()).toBe('error');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudo cargar el vídeo');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();

    buttonWith(harness.routeNativeElement, 'Reintentar').click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledTimes(2);
    expect(component.videoState()).toBe('ready');
    expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();
  });

  it('al caducar la firma retira el iframe y permite renovar explícitamente', async () => {
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true,
      () => Promise.resolve(fakeSource('Aviso del servidor', Date.now() + 60_000)));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
      // El montaje ya fue automático: sin timer vivo se pide la primera fuente.
      component.loadVideo();
      await Promise.resolve();
      harness.detectChanges();
      expect(component.videoState()).toBe('ready');
      expect(harness.routeNativeElement?.querySelector('iframe')).not.toBeNull();

      vi.advanceTimersByTime(60_000);
      harness.detectChanges();
      expect(component.videoState()).toBe('expired');
      expect(harness.routeNativeElement?.querySelector('[role="status"]')?.textContent).toContain('El enlace del vídeo ha caducado');
      expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
      expect(harness.routeNativeElement?.textContent).toContain('Aviso del servidor');

      const calls = source.mock.calls.length;
      // Tras caducar, un único «Renovar enlace» pide una nueva firma vigente.
      source.mockImplementation(() => Promise.resolve(fakeSource('Aviso del servidor', Date.now() + 60_000)));
      buttonWith(harness.routeNativeElement, 'Renovar enlace').click();
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
    const { source } = setup(vi.fn().mockResolvedValue(data), undefined, true,
      () => Promise.resolve(fakeSource('Enlace sin caducidad')));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    vi.useFakeTimers();
    try {
      expect(component.videoState()).toBe('ready');
      expect(source).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5 * 60 * 1000);
      harness.detectChanges();
      expect(component.videoState()).toBe('ready');
      expect(harness.routeNativeElement?.textContent).toContain('Enlace sin caducidad');
      expect(source).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarta la fuente lenta de la lección anterior al navegar', async () => {
    let resolveSource!: (value: PlaybackSource | null) => void;
    const previous = new Promise<PlaybackSource | null>(r => resolveSource = r);
    let call = 0;
    const { source } = setup(vi.fn((_course: string, slug: string) =>
      Promise.resolve({ ...twoLessons, lesson: slug === 'dos' ? secondLesson : firstLesson })),
      undefined, true, () => ++call === 1 ? previous : Promise.resolve(fakeSource('Aviso de la nueva')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledWith('l1');

    const component = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(source).toHaveBeenCalledWith('l2');
    expect(component.videoState()).toBe('ready');

    // Una respuesta tardía de la lección anterior no reemplaza la actual.
    resolveSource(fakeSource('Aviso obsoleto'));
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.videoSource()?.notice).toBe('Aviso de la nueva');
    expect(harness.routeNativeElement?.textContent).not.toContain('Aviso obsoleto');
  });

  it('descarta la fuente en curso al destruir el componente', async () => {
    let resolveSource!: (value: PlaybackSource | null) => void;
    const previous = new Promise<PlaybackSource | null>(r => resolveSource = r);
    setup(vi.fn().mockResolvedValue(data), undefined, true, () => previous);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Cargando el vídeo');

    harness.fixture.componentRef.destroy();
    resolveSource(fakeSource('Aviso tras desmontaje'));
    await Promise.resolve();
    // Nada existe ya que pueda aceptar la respuesta: no hay iframe residual.
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('no roba el foco del vídeo al refrescar la sesión ni al guardar progreso', async () => {
    const load = vi.fn().mockResolvedValue(data);
    const { session, source } = setup(load, undefined, true, () => Promise.resolve(fakeSource()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    const iframe = harness.routeNativeElement?.querySelector('iframe')!;
    expect(iframe).not.toBeNull();
    // El montaje automático no se lleva el foco a la lección principal.
    expect(document.activeElement).not.toBe(iframe);

    // TOKEN_REFRESHED del mismo usuario: ni recarga ni pide otra fuente ni mueve el foco.
    session.set({ user: { id: 'u' } });
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(iframe);

    // Guardar progreso tampoco mueve el foco al reproductor.
    const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>('.progress-button')!;
    button.focus();
    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(document.activeElement).toBe(button);
  });

  it('sin fuente en desarrollo muestra el mensaje honesto, no el de demo', async () => {
    setup(vi.fn().mockResolvedValue(data));
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: true },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l: 'demo' } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('La reproducción aún no está configurada');
    expect(text).not.toContain('vídeo de prueba configurado para esta lección en desarrollo');
    expect(text).not.toContain('YouTube');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
  });

  it('sin fuente en producción tampoco carga un iframe', async () => {
    setup(vi.fn().mockResolvedValue(data));
    TestBed.configureTestingModule({ providers: [
      { provide: VIDEO_DEMO_ENABLED, useValue: false },
      { provide: VIDEO_DEMO_CONFIG, useValue: { l: 'demo' } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('La reproducción aún no está configurada');
    expect(harness.routeNativeElement?.querySelector('iframe')).toBeNull();
  });

  it('no permite progreso anónimo y muestra error al fallar el guardado', async () => {
    const { save } = setup(vi.fn().mockResolvedValue({...data, canTrack: false}), vi.fn(), false);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    await component.toggleProgress();
    expect(save).not.toHaveBeenCalled();
  });

  it('descarta una respuesta de ruta anterior', async () => {
    let resolve!: (value: AulaData) => void;
    const first = new Promise<AulaData>(r => resolve = r);
    setup(vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({...data, lesson: {...lesson, id: 'otro', slug: 'dos'}}));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    const component = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable();
    resolve(data);
    await Promise.resolve();
    expect(component.data()?.lesson.id).toBe('otro');
  });

  it('conserva el estado al fallar el guardado', async () => {
    setup(vi.fn().mockResolvedValue(data), vi.fn().mockRejectedValue(new Error()));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    await component.toggleProgress();
    expect(component.saveError()).toBe(true);
    expect(component.data()?.completed).toBe(false);
  });

  it('enfoca el encabezado al cargar y tras navegar con Siguiente', async () => {
    setup(vi.fn((course: string, lessonSlug: string) =>
      Promise.resolve({ ...twoLessons, lesson: lessonSlug === 'dos' ? secondLesson : firstLesson }),
    ));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement?.textContent).toBe('Lección');

    const next = Array.from(harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
      .find((a) => a.textContent?.startsWith('Siguiente:'));
    expect(next?.getAttribute('href')).toBe('/aula/curso/dos');

    next!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement?.textContent).toBe('Lección');
    expect(harness.routeNativeElement?.textContent).not.toContain('Siguiente:');
  });

  it('no roba el foco al marcar el progreso manual', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>('.progress-button')!;
    button.focus();
    expect(document.activeElement).toBe(button);

    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(document.activeElement).toBe(button);
  });

  it('un TOKEN_REFRESHED del mismo usuario conserva datos, progreso y foco', async () => {
    let resolveSave!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => { resolveSave = r; }));
    const load = vi.fn().mockResolvedValue(data);
    const { session } = setup(load, save);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const button = harness.routeNativeElement?.querySelector<HTMLButtonElement>('.progress-button')!;
    button.focus();
    expect(document.activeElement?.tagName).toBe('BUTTON');

    // Guardado en curso + Session nueva con el mismo user.id (token refrescado).
    button.click();
    expect(component.saving()).toBe(true);
    session.set({ user: { id: 'u' } });
    harness.detectChanges();

    expect(load).toHaveBeenCalledTimes(1); // no recarga ni reevalúa RLS
    expect(component.data()?.completed).toBe(false); // el guardado sigue en curso
    expect(document.activeElement?.tagName).toBe('BUTTON'); // foco intacto

    resolveSave();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.data()?.completed).toBe(true); // no se descarta por el refresco
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('logout y cambio de usuario retiran el contenido previo y reevalúan el acceso', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...data, lesson: { ...lesson, id: 'otro', slug: 'dos' } });
    const { session, status } = setup(load);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.data()?.lesson.id).toBe('l');

    // Logout: se retira de inmediato el contenido del usuario anterior y se
    // consulta sin id para que RLS decida qué sigue siendo visible.
    status.set('anonymous');
    session.set(null);
    harness.detectChanges();
    expect(component.data()).toBeNull();
    expect(load).toHaveBeenLastCalledWith('curso', 'uno', null);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.state()).toBe('denied');

    // Otro usuario en la misma ruta: nueva evaluación con su identidad.
    status.set('authenticated');
    session.set({ user: { id: 'u2' } });
    harness.detectChanges();
    expect(load).toHaveBeenLastCalledWith('curso', 'uno', 'u2');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(3);
    expect(component.data()?.lesson.id).toBe('otro');
  });

  it('el reintento manual fuerza una recarga aunque no cambie la clave', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce(data);
    setup(load);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.state()).toBe('error');
    expect(load).toHaveBeenCalledTimes(1);

    component.retry();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(component.state()).toBe('ready');
  });

  it('no roba el foco una respuesta obsoleta de la lección anterior', async () => {
    let resolveFirst!: (value: AulaData) => void;
    const first = new Promise<AulaData>((r) => (resolveFirst = r));
    setup(vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...data, lesson: { ...lesson, id: 'otro', slug: 'dos' } }),
    );
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    const component = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(document.activeElement?.textContent).toBe('Lección');

    harness.routeNativeElement?.querySelector<HTMLButtonElement>('button')!.focus();
    expect(document.activeElement?.tagName).toBe('BUTTON');

    resolveFirst(data);
    await Promise.resolve();
    harness.detectChanges();

    expect(component.data()?.lesson.id).toBe('otro');
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it('dispone índice y contenido en dos columnas con un único h1 y los landmarks propios', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    // El main landmark lo aporta el shell; aquí sólo se añaden nav y complementary.
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelector('h1')?.textContent).toBe('Lección');
    expect(root.querySelector('main')).toBeNull();
    expect(root.querySelector('.aula-layout')).not.toBeNull();
    expect(root.querySelector('aside.aula-sidebar')).not.toBeNull();
    expect(root.querySelector('article.aula-content')).not.toBeNull();
    expect(root.querySelector('nav[aria-label="Lecciones del curso"]')).not.toBeNull();
    expect(root.querySelector('nav[aria-label="Navegación entre lecciones"]')).not.toBeNull();
  });

  it('coloca las acciones antes del vídeo: duración a la izquierda, completar y flechas separadas a la derecha', async () => {
    const timed = { ...twoLessons, lesson: { ...firstLesson, duration_seconds: 125 } };
    const { source } = setup(vi.fn().mockResolvedValue(timed), undefined, true, () => Promise.resolve(fakeSource()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    const actions = root.querySelector<HTMLElement>('.lesson-actions')!;
    const stage = root.querySelector<HTMLElement>('.video-stage')!;
    const duration = root.querySelector<HTMLElement>('.lesson-duration')!;
    const progress = root.querySelector<HTMLButtonElement>('.progress-button')!;
    const next = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'))
      .find(a => a.textContent?.startsWith('Siguiente:'))!;
    expect(actions.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(duration.textContent).toContain('2:05');
    expect(duration.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('.lesson-nav__divider')).not.toBeNull();
    expect(source).toHaveBeenCalledWith('l1');

    // Iconografía genérica: reloj antes de la duración; flecha circular de siguiente
    // a la derecha del texto y separada del botón outline de progreso (sin check ajeno).
    const clock = duration.querySelector<SVGElement>('svg.icon--clock')!;
    expect(clock).not.toBeNull();
    expect(clock.getAttribute('aria-hidden')).toBe('true');
    expect(clock.compareDocumentPosition(duration.querySelector('span')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.matches('.progress-button')).toBe(true);
    expect(progress.querySelector('svg')).toBeNull();
    const arrow = next.querySelector<HTMLElement>('.arrow-circle')!;
    expect(arrow).not.toBeNull();
    expect(arrow.querySelector('svg')).not.toBeNull();
    expect(next.textContent?.startsWith('Siguiente:')).toBe(true);
    const nextLabel = [...next.childNodes].find(n => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').includes('Siguiente:'))!;
    expect(nextLabel).toBeDefined();
    expect(nextLabel.compareDocumentPosition(arrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('deja los materiales bajo el separador y el foro como placeholder honesto', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    const separator = root.querySelector<HTMLElement>('.aula-separator')!;
    const materials = root.querySelector<HTMLElement>('app-lesson-materials')!;
    const dudas = root.querySelector<HTMLElement>('.aula-dudas')!;
    expect(separator.compareDocumentPosition(materials) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(materials.compareDocumentPosition(dudas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dudas.textContent).toContain('fase posterior');
    expect(dudas.querySelector('form, textarea, button')).toBeNull();
  });

  it('coloca un icono de documento genérico junto a la cabecera y a cada PDF', async () => {
    setup(vi.fn().mockResolvedValue(data));
    TestBed.configureTestingModule({ providers: [
      { provide: LessonResources, useValue: { list: vi.fn().mockResolvedValue([{ id: 'r', title: 'Apuntes' }]), download: vi.fn() } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const materials = harness.routeNativeElement!.querySelector<HTMLElement>('app-lesson-materials')!;

    const headingIcon = materials.querySelector<SVGElement>('h3 .material-icon')!;
    const itemIcon = materials.querySelector<SVGElement>('.material-item .material-icon')!;
    expect(headingIcon).not.toBeNull();
    expect(itemIcon).not.toBeNull();
    expect(headingIcon.getAttribute('aria-hidden')).toBe('true');
    expect(itemIcon.closest('.material-item')?.textContent).toContain('Apuntes');
    expect(materials.textContent).toContain('Materiales de la lección');
  });

  it('no muestra resumen ni contenido interno aunque vengan en los datos', async () => {
    // El repositorio ya no pide estas columnas; se inyectan para comprobar que el aula las ignora.
    const internos = { summary: 'RESUMEN INTERNO', content_md: 'CONTENIDO INTERNO' };
    const described: AulaData = {
      ...data,
      lesson: { ...lesson, ...internos } as AulaLesson,
    };
    setup(vi.fn().mockResolvedValue(described));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    expect(root.querySelector('h1')?.textContent).toBe('Lección');
    expect(root.textContent).not.toContain('RESUMEN INTERNO');
    expect(root.textContent).not.toContain('CONTENIDO INTERNO');
    expect(root.querySelector('.lesson-text')).toBeNull();
    expect(root.querySelector('app-lesson-materials')).not.toBeNull();
  });

  it('sin descripción no deja bloque vacío ni separador huérfano', async () => {
    const plain: AulaData = {
      ...data,
      lesson,
    };
    setup(vi.fn().mockResolvedValue(plain));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    expect(root.textContent).not.toContain('Contenido de la lección');
    expect(root.textContent).not.toContain('contenido escrito');
    const title = root.querySelector<HTMLElement>('.lesson-title')!;
    const separator = root.querySelector<HTMLElement>('.aula-separator')!;
    const materials = root.querySelector<HTMLElement>('app-lesson-materials')!;
    expect(title.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separator.compareDocumentPosition(materials) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cambia de lección sin texto de carga visible, sin recrear el nav y moviendo aria-current', async () => {
    const first = { ...lesson, id: 'l1', slug: 'uno', title: 'Primera' };
    const secondLessonData = { ...lesson, id: 'l2', slug: 'dos', title: 'Segunda' };
    const make = (active: typeof first): AulaData => ({
      ...twoLessons, lesson: active, lessons: [first, secondLessonData],
      sections: [{ id: 's', title: 'Bloque' }],
    });
    let resolveSecond!: (value: AulaData) => void;
    const load = vi.fn()
      .mockResolvedValueOnce(make(first))
      .mockReturnValueOnce(new Promise<AulaData>(r => resolveSecond = r));
    setup(load);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const navNode = root.querySelector<HTMLElement>('app-classroom-nav')!;
    const target = [...navNode.querySelectorAll<HTMLAnchorElement>('a')]
      .find(a => a.textContent?.includes('Segunda'))!;
    expect(navNode.querySelector('a[aria-current="page"]')?.textContent).toContain('Primera');

    target.focus();
    expect(document.activeElement).toBe(target);
    const sameComponent = await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();

    expect(sameComponent).toBe(component);
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
    expect(root.textContent).not.toContain('Cargando lección');
    expect(root.querySelector('h1')?.textContent).toBe('Primera');
    expect(root.querySelector('.video-stage')).not.toBeNull();
    expect(root.querySelector('.sr-only[role="status"]')?.textContent).toContain('Preparando la lección siguiente');
    expect(document.activeElement).toBe(target);

    resolveSecond(make(secondLessonData));
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.switching()).toBe(false);
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
    expect(navNode.querySelector('a[aria-current="page"]')?.textContent).toContain('Segunda');
    expect(root.querySelector('h1')?.textContent).toBe('Segunda');
  });

  it('conserva bloques plegados y desplazamiento del índice al cambiar de lección', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const navNode = root.querySelector<HTMLElement>('app-classroom-nav')!;
    const toggle = navNode.querySelector<HTMLButtonElement>('.block-toggle')!;
    toggle.click(); harness.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const index = navNode.querySelector<HTMLElement>('nav')!;
    index.scrollTop = 42;

    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
    expect(navNode.querySelector<HTMLButtonElement>('.block-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(navNode.querySelector<HTMLElement>('nav')?.scrollTop).toBe(42);
  });

  it('un cambio de curso limpia el árbol mientras llegan los datos', async () => {
    let resolveOther!: (value: AulaData) => void;
    const load = vi.fn()
      .mockResolvedValueOnce(twoLessons)
      .mockReturnValueOnce(new Promise<AulaData>(r => resolveOther = r));
    setup(load);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-classroom-nav')).not.toBeNull();

    await harness.navigateByUrl('/aula/otro/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(load).toHaveBeenLastCalledWith('otro', 'uno', 'u');
    expect(harness.routeNativeElement?.querySelector('app-classroom-nav')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.content-skeleton')).not.toBeNull();

    resolveOther(twoLessons);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-classroom-nav')).not.toBeNull();
  });

  it('la fila derecha muestra estado, etiqueta de primera lección y siguiente real sobre el vídeo', async () => {
    const first = { ...lesson, id: 'l1', slug: 'uno', title: 'Primera' };
    const secondLesson = { ...lesson, id: 'l2', slug: 'dos', title: 'Siguiente real' };
    const course: AulaData = {
      ...twoLessons, lesson: first, lessons: [first, secondLesson],
      sections: [{ id: 's', title: 'Bloque' }],
    };
    setup(vi.fn().mockResolvedValue(course));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const nav = root.querySelector<HTMLElement>('.lesson-nav')!;
    const stage = root.querySelector<HTMLElement>('.video-stage')!;
    const button = nav.querySelector<HTMLButtonElement>('.progress-button')!;
    const current = nav.querySelector<HTMLElement>('.lesson-current')!;
    const next = nav.querySelector<HTMLAnchorElement>('a[href="/aula/curso/dos"]')!;

    expect(nav.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.textContent?.trim()).toBe('Marcar como completada');
    expect(current.textContent).toBe('Primera lección');
    expect(next.textContent).toContain('Siguiente: Siguiente real');
    expect(nav.querySelector('a[href="/aula/curso/uno"]')).toBeNull();
    expect(button.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('en una lección intermedia muestra orden y título reales junto a anterior y siguiente', async () => {
    const first = { ...lesson, id: 'l1', slug: 'uno', title: 'Primera' };
    const middle = { ...lesson, id: 'l2', slug: 'dos', title: 'Segunda real' };
    const last = { ...lesson, id: 'l3', slug: 'tres', title: 'Tercera real' };
    const course: AulaData = {
      ...twoLessons, lesson: middle, lessons: [first, middle, last],
      sections: [{ id: 's', title: 'Bloque' }],
    };
    setup(vi.fn().mockResolvedValue(course));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const nav = harness.routeNativeElement!.querySelector<HTMLElement>('.lesson-nav')!;

    expect(nav.querySelector('.lesson-current')?.textContent).toBe('Lección 2 de 3: Segunda real');
    expect(nav.textContent).toContain('Anterior: Primera');
    expect(nav.textContent).toContain('Siguiente: Tercera real');
    expect(nav.textContent).not.toContain('Primera lección');
  });

  it('sin lección siguiente no deja texto de relleno ni hueco de vista previa', async () => {
    const first = { ...lesson, id: 'l1', slug: 'uno', title: 'Primera' };
    const last = { ...lesson, id: 'l2', slug: 'dos', title: 'Última real' };
    const course: AulaData = {
      ...twoLessons, lesson: last, lessons: [first, last],
      sections: [{ id: 's', title: 'Bloque' }],
    };
    setup(vi.fn().mockResolvedValue(course));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const nav = harness.routeNativeElement!.querySelector<HTMLElement>('.lesson-nav')!;

    expect(nav.querySelector('.lesson-current')?.textContent).toBe('Lección 2 de 2: Última real');
    expect(nav.textContent).not.toContain('Siguiente:');
    expect(nav.textContent).not.toContain('Última lección');
    expect(nav.querySelector('a[href="/aula/curso/dos"]')).toBeNull();
  });

  it('una lección completada ofrece Marcar como pendiente y guarda el estado real', async () => {
    const { save } = setup(vi.fn().mockResolvedValue({ ...data, completed: true }));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const nav = harness.routeNativeElement!.querySelector<HTMLElement>('.lesson-nav')!;
    const button = nav.querySelector<HTMLButtonElement>('.progress-button')!;

    expect(button.textContent?.trim()).toBe('Marcar como pendiente');
    button.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l', false);
    expect(component.data()?.completed).toBe(false);
    expect(nav.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como completada');
  });

  it('el índice recibe el progreso real sin repetir la frase «Progreso manual»', async () => {
    const first = { ...lesson, id: 'l1', slug: 'uno', title: 'Primera' };
    const following = { ...lesson, id: 'l2', slug: 'dos', title: 'Siguiente real' };
    const course: AulaData = {
      ...twoLessons, lesson: first, lessons: [first, following],
      completed: true, completedLessonIds: ['l1'],
    };
    const { save } = setup(vi.fn().mockResolvedValue(course));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const navNode = root.querySelector<HTMLElement>('app-classroom-nav')!;
    const states = () => [...navNode.querySelectorAll<HTMLElement>('li a')]
      .map(a => a.querySelector('.lesson-progress .sr-only')?.textContent);

    expect(root.textContent).not.toContain('Progreso manual');
    expect(root.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como pendiente');
    expect(states()).toEqual(['Completada', 'Pendiente']);
    expect(component.completedIds()?.has('l1')).toBe(true);
    expect(root.textContent).toContain('Primera lección');
    expect(root.textContent).toContain('Siguiente: Siguiente real');

    root.querySelector<HTMLButtonElement>('.progress-button')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l1', false);
    expect(component.data()?.completed).toBe(false);
    expect(component.completedIds()?.has('l1')).toBe(false);
    expect(states()).toEqual(['Pendiente', 'Pendiente']);
    expect(root.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como completada');
    expect(root.textContent).toContain('Siguiente: Siguiente real');
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
  });

  it('al marcar como completada cambia el indicador del índice y conserva la navegación', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const state = () => root.querySelector<HTMLElement>('app-classroom-nav li a .lesson-progress .sr-only')?.textContent;
    expect(state()).toBe('Pendiente');

    root.querySelector<HTMLButtonElement>('.progress-button')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(state()).toBe('Completada');
    expect(root.textContent).not.toContain('Progreso manual');
    expect(root.querySelector('nav[aria-label="Navegación entre lecciones"]')?.textContent).toContain('Primera lección');
  });
});
