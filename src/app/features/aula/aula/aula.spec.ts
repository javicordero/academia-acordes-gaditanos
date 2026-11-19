import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By, DomSanitizer } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { AulaData, AulaLesson, AulaRepository } from '../aula-repository';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { LessonComments } from '../../comentarios/lesson-comments';
import { LessonCommentsRepository } from '../../comentarios/lesson-comments-repository';
import { AULA_ROUTES } from '../aula.routes';
import { Aula } from './aula';
import { PlaybackSource, VIDEO_DEMO_CONFIG, VIDEO_DEMO_ENABLED, VideoPlaybackService } from '../video-playback';
import { LessonFavoritesRepository } from '../../favoritos/repository';

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

/** Los estilos del componente se inyectan como <style>; comprobar la regla declarada
 *  evita depender de que jsdom aplique media queries o calcule píxeles. */
function componentCss(): string {
  return [...document.querySelectorAll('style')].map(s => s.textContent ?? '').join('\n');
}

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}(?![-\\w])[^{}]*\\{([^}]*)\\}`))?.[1]?.replace(/\s+/g, ' ') ?? '';
}

/** La encapsulación emulada inserta [_ngcontent-xxx] en los selectores; quitarlo
 *  permite comprobar las reglas tal como están escritas en la SCSS (sin píxeles ni getComputedStyle). */
function authoredCss(): string {
  return componentCss().replace(/\[_ngcontent-[^\]]*\]/g, '');
}

/** Bloque `@media (max-width: 47.999rem)` del componente (móvil, <768px). */
function mobileCss(): string {
  const css = authoredCss();
  const at = css.search(/@media[^{]*max-width:\s*47\.999rem/);
  if (at < 0) return '';
  const next = css.slice(at + 1).search(/@media/);
  return next < 0 ? css.slice(at) : css.slice(at, at + 1 + next);
}

describe('Aula', () => {
  it('reserva índice y vídeo con esqueletos y un único aviso accesible', async () => {
    let resolve!: (value: AulaData) => void;
    setup(vi.fn().mockReturnValue(new Promise<AulaData>(r => { resolve = r; })));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('.nav-skeleton app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('index');
    expect(root.querySelector('.content-skeleton app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('video');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Preparando el aula');
    expect(root.querySelectorAll('.skeleton__shapes[aria-hidden="true"]')).toHaveLength(2);
    expect(root.querySelector('article.aula-content')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[autofocus]')).toBeNull();
    resolve(data);
  });

  it('alinea el índice en x=0, reparte 330px y el resto sin hueco y da scroll a ambas columnas', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const css = componentCss();

    expect(root.querySelector('.aula-layout')).not.toBeNull();
    expect(root.querySelector('aside.aula-sidebar')).not.toBeNull();
    expect(root.querySelector('article.aula-content')).not.toBeNull();
    // El shell deja 1.25rem a cada lado y el grid lo compensa: la rejilla arranca en x=0.
    expect(cssRule(css, '.aula-layout')).toMatch(/margin-inline:\s*calc\(-1 \* var\(--aula-gutter\)\)/);
    // El aside no añade padding horizontal: ni el índice ni el hamburger móvil tienen hueco a la izquierda.
    expect(cssRule(css, '.aula-sidebar')).not.toMatch(/padding(-inline|-left|-right)?\s*:/);
    expect(css).toMatch(/grid-template-columns:\s*330px\s+minmax\(0,\s*1fr\)/);
    expect(cssRule(css, '.aula-layout')).toMatch(/gap:\s*0\s*;/);
    expect(css).toMatch(/height:\s*calc\(100dvh\s*-\s*var\(--aula-shell-offset\)\)/);
    expect(cssRule(css, '.aula-sidebar')).toMatch(/min-height:\s*0\s*;/);
    expect(cssRule(css, '.aula-content')).toMatch(/min-height:\s*0\s*;/);
    expect(css).toMatch(/\.aula-content[^{]*\{[^}]*overflow-y:\s*auto/);
  });

  it('el offset del shell lleva unidad para que el max-height no se descarte y la rueda desplace', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const css = authoredCss();

    // Sin unidad, calc(100dvh - 0) es inválido: el navegador descarta max-height y
    // .aula-content deja de desbordar, por lo que la rueda no desplaza (PageDown sí).
    const declared = css.match(/--aula-shell-offset:\s*([^;]+);/)?.[1]?.trim();
    expect(declared).toBeDefined();
    expect(declared).toMatch(/^-?[\d.]+(px|rem|em|vh|dvh|%)$/);
    expect(css).not.toMatch(/--aula-shell-offset:\s*0\s*;/);

    // Ambas columnas comparten el mismo calc con unidades compatibles y fallback 100vh.
    expect(css).toMatch(/\.aula-sidebar[^{]*\{[^}]*height:\s*calc\(100vh\s*-\s*var\(--aula-shell-offset\)\)/);
    expect(css).toMatch(/\.aula-sidebar[^{]*\{[^}]*height:\s*calc\(100dvh\s*-\s*var\(--aula-shell-offset\)\)/);
    expect(css).toMatch(/\.aula-content[^{]*\{[^}]*max-height:\s*calc\(100vh\s*-\s*var\(--aula-shell-offset\)\)/);
    expect(css).toMatch(/\.aula-content[^{]*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*var\(--aula-shell-offset\)\)/);
    expect(css).toMatch(/\.aula-content[^{]*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.aula-content[^{]*\{[^}]*overscroll-behavior:\s*contain/);
  });

  it('el vídeo ocupa todo el ancho de la columna: el full-bleed compensa el padding real', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const css = componentCss();

    // Sin padding lateral que reduzca el vídeo dentro de su columna (765px a 1095 de viewport).
    expect(cssRule(css, '.aula-content')).toMatch(/padding-inline:\s*var\(--aula-indent\)/);
    expect(cssRule(css, '.video-stage')).toMatch(/margin-inline:\s*calc\(-1 \* var\(--aula-indent\)\)/);
    expect(cssRule(css, '.video')).toMatch(/width:\s*100%/);
    expect(cssRule(authoredCss(), '.video-stage:has(iframe)')).toMatch(/padding:\s*0/);
  });

  it('usa banda de acciones alta, controles grandes y vídeo a todo el ancho sin aviso en el flujo', async () => {
    setup(vi.fn().mockResolvedValue(data), undefined, true, () => Promise.resolve(fakeSource('Aviso de maquetación')));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const css = componentCss();

    expect(cssRule(css, '.lesson-actions')).toMatch(/min-height:\s*6\.5rem/);
    expect(cssRule(css, '.lesson-actions')).toMatch(/padding-block:\s*1\.875rem/);
    expect(cssRule(css, '.arrow-circle')).toMatch(/width:\s*30px/);
    expect(cssRule(css, '.video')).toMatch(/width:\s*100%/);
    expect(cssRule(css, '.video')).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(cssRule(css, '.video-notice')).toMatch(/position:\s*absolute/);
    // Espaciado, bordes, radios y relleno de tarjetas viven en tokens de tema.
    for (const token of ['--space-', '--card-pad', '--border-width', '--radius-sm', '--radius-md']) {
      expect(css).toContain(`var(${token}`);
    }
    const notice = root.querySelector<HTMLElement>('.video-notice')!;
    expect(root.querySelector('.video-stage')?.contains(notice)).toBe(true);
    expect(notice.textContent).toContain('Aviso de maquetación');
  });

  it('alinea todo el clúster de acciones a la derecha sin empujes desde la izquierda', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const css = authoredCss();

    const actionsRule = cssRule(css, '.lesson-actions');
    expect(actionsRule).toMatch(/justify-content:\s*flex-end/);
    expect(actionsRule).toMatch(/width:\s*100%/);
    expect(actionsRule).not.toMatch(/justify-content:\s*(space-between|flex-start)/);
    // Ningún margin-left:auto en .lesson-nav que empuje el grupo desde la izquierda.
    expect(cssRule(css, '.lesson-nav')).not.toMatch(/margin-left/);
    expect(css).not.toMatch(/\.lesson-nav[^{]*\{[^}]*margin-left:\s*auto/);
    // No se reintroduce el reloj/duración en la fila (ni en la regla móvil).
    expect(css).not.toMatch(/\.lesson-duration/);
  });

  it('separa el título del vídeo y mantiene título y separador con la misma sangría', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const css = componentCss();

    expect(cssRule(css, '.aula-layout')).toMatch(/--aula-indent:/);
    expect(cssRule(css, '.lesson-title')).toMatch(/margin:\s*20px\s+0/);
    expect(cssRule(css, '.aula-separator')).toMatch(/margin:\s*40px\s+0\s+16px/);
    expect(authoredCss()).toMatch(/\.video-stage\s*\+\s*\.lesson-title\s*\{[^}]*margin-top:\s*48px/);
  });

  function setup(
    load: ReturnType<typeof vi.fn>,
    save = vi.fn().mockResolvedValue(undefined),
    user = true,
    sourceForLesson: () => PlaybackSource | null | Promise<PlaybackSource | null> = () => null,
    favorites: { list: ReturnType<typeof vi.fn>; toggle: ReturnType<typeof vi.fn> } | null = null,
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
      { provide: LessonCommentsRepository, useValue: { list: vi.fn().mockResolvedValue([]), create: vi.fn() } },
      { provide: LessonFavoritesRepository, useValue: favorites },
    ] });
    return { save, session, status, error, source };
  }

  /** Fuente con `ended` verificable: el aula solo conoce el contrato, no el script. */
  function playbackWithEnded(capture: { handler?: () => void; unsub?: () => void }): () => PlaybackSource {
    return () => ({
      ...fakeSource(),
      provider: 'bunny',
      onEnded: (_frameId, handler) => {
        capture.handler = handler;
        capture.unsub = vi.fn();
        return () => { capture.unsub?.(); capture.handler = undefined; };
      },
    });
  }

  it('sitúa el progreso entre los extremos de navegación sin enlaces rotos', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const nav = harness.routeNativeElement!.querySelector('nav[aria-label="Navegación entre lecciones"]')!;
    expect(nav.textContent).not.toContain('Primera lección');
    expect(nav.textContent).not.toContain('Siguiente:');
    expect(nav.classList.contains('lesson-nav--end')).toBe(true);
    expect(nav.firstElementChild?.tagName).toBe('BUTTON');
    expect(nav.lastElementChild?.tagName).toBe('A');
    expect(nav.querySelector<HTMLButtonElement>('.progress-button')?.disabled).toBe(false);
    expect(nav.querySelectorAll('a').length).toBe(1);
    expect(nav.querySelector('a')?.getAttribute('aria-label')).toBe('Siguiente: Lección');
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

  it('enfoca el contenedor al cargar y tras navegar con Siguiente, nunca el título', async () => {
    setup(vi.fn((course: string, lessonSlug: string) =>
      Promise.resolve({ ...twoLessons, lesson: lessonSlug === 'dos' ? secondLesson : firstLesson }),
    ));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable();
    harness.detectChanges();

    const focused = () => document.activeElement as HTMLElement;
    // Foco en el contenedor con nombre accesible (artículo), nunca en el h1:
    // así se evita el aro de foco sobre el título al cargar el aula.
    expect(focused().tagName).toBe('ARTICLE');
    expect(focused().getAttribute('aria-label')).toBe('Contenido de la lección');
    expect(focused().getAttribute('tabindex')).toBe('-1');
    expect(focused().id).not.toBe('aula-heading');
    expect(focused()).toBe(harness.routeNativeElement?.querySelector('article.aula-content'));
    expect(harness.routeNativeElement?.querySelector('h1')?.getAttribute('tabindex')).toBe('-1');

    const next = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[aria-label^="Siguiente:"]')!;
    expect(next?.getAttribute('href')).toBe('/aula/curso/dos');

    next!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(focused().tagName).toBe('ARTICLE');
    expect(focused().getAttribute('aria-label')).toBe('Contenido de la lección');
    expect(focused().getAttribute('tabindex')).toBe('-1');
    expect(focused().id).not.toBe('aula-heading');
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
    const focused = () => document.activeElement as HTMLElement;
    expect(focused().tagName).toBe('ARTICLE');
    expect(focused().getAttribute('aria-label')).toBe('Contenido de la lección');
    expect(focused().getAttribute('tabindex')).toBe('-1');
    expect(focused().id).not.toBe('aula-heading');

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

  it('coloca las acciones antes del vídeo: solo progreso y flecha, sin duración ni reloj aunque haya datos', async () => {
    const timed = { ...twoLessons, lesson: { ...firstLesson, duration_seconds: 125 } };
    const { source } = setup(vi.fn().mockResolvedValue(timed), undefined, true, () => Promise.resolve(fakeSource()));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    const actions = root.querySelector<HTMLElement>('.lesson-actions')!;
    const stage = root.querySelector<HTMLElement>('.video-stage')!;
    const progress = root.querySelector<HTMLButtonElement>('.progress-button')!;
    const next = root.querySelector<HTMLAnchorElement>('a[aria-label^="Siguiente:"]')!;
    expect(actions.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('.lesson-nav__divider')).toBeNull();
    expect(source).toHaveBeenCalledWith('l1');

    // La fila solo contiene el nav con progreso y flecha: ni duración, ni reloj, ni texto a la izquierda.
    expect(actions.querySelector('.lesson-duration')).toBeNull();
    expect(actions.querySelector('svg.icon--clock')).toBeNull();
    expect(actions.textContent).not.toContain('Duración');
    expect(actions.children).toHaveLength(1);
    expect(actions.firstElementChild?.classList.contains('lesson-nav')).toBe(true);

    // Iconografía genérica: sin SVG en el botón; solo la flecha circular con nombre accesible.
    expect(progress.matches('.progress-button')).toBe(true);
    expect(progress.querySelector('svg')).toBeNull();
    const arrow = next.querySelector<HTMLElement>('.arrow-circle')!;
    expect(arrow).not.toBeNull();
    expect(arrow.querySelector('svg')).not.toBeNull();
    expect(next.getAttribute('aria-label')).toBe('Siguiente: Lección');
    expect(next.textContent?.trim()).toBe('');
    expect(next.querySelectorAll('span')).toHaveLength(1);
  });

  it('integra los comentarios reales de la lección tras los materiales, sin texto de fase posterior', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    setup(vi.fn().mockResolvedValue(data), save);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    const separator = root.querySelector<HTMLElement>('.aula-separator')!;
    const materials = root.querySelector<HTMLElement>('app-lesson-materials')!;
    const dudas = root.querySelector<HTMLElement>('.aula-dudas')!;
    const comments = harness.fixture.debugElement.query(By.directive(LessonComments));
    expect(separator.compareDocumentPosition(materials) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(materials.compareDocumentPosition(dudas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(comments).not.toBeNull();
    expect(comments.componentInstance.lessonId()).toBe('l');
    expect(dudas.querySelector('app-lesson-comments')).not.toBeNull();
    expect(dudas.textContent).not.toContain('El foro completo es una fase posterior');
    expect(root.textContent).not.toContain('conversación de esta lección');
    // Un único h2 visible para la sección: el que aporta el componente de comentarios.
    expect(dudas.querySelectorAll('h2')).toHaveLength(1);
    expect(dudas.querySelector('h2')?.textContent).toBe('Comentarios de la lección');
    expect(dudas.getAttribute('aria-label')).toBe('Dudas y comentarios de esta lección');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
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

  it('la fila derecha muestra el progreso y solo la flecha de siguiente, sin texto de navegación', async () => {
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
    const next = nav.querySelector<HTMLAnchorElement>('a[href="/aula/curso/dos"]')!;

    expect(nav.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.textContent?.trim()).toBe('Marcar como completada');
    expect(nav.querySelector('.lesson-current')).toBeNull();
    expect(nav.textContent).not.toContain('Primera lección');
    expect(nav.textContent).not.toContain('Siguiente:');
    expect(next.getAttribute('aria-label')).toBe('Siguiente: Siguiente real');
    expect(next.textContent?.trim()).toBe('');
    expect(nav.querySelector('a[href="/aula/curso/uno"]')).toBeNull();
    expect(button.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(nav.querySelector('.lesson-current')).toBeNull();
    expect(nav.textContent).not.toContain('Anterior:');
    expect(nav.textContent).not.toContain('Siguiente:');
    expect(nav.textContent).not.toContain('Primera lección');
    expect(nav.querySelector('a[aria-label="Siguiente: Tercera real"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/aula/curso/uno"]')).toBeNull();
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

    expect(nav.querySelector('.lesson-current')).toBeNull();
    expect(nav.textContent).not.toContain('Siguiente:');
    expect(nav.textContent).not.toContain('Última lección');
    expect(nav.querySelector('a[aria-label^="Siguiente:"]')).toBeNull();
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
    const visibleProgressText = () => [...navNode.querySelectorAll<HTMLElement>('.lesson-progress > *:not(.sr-only)')]
      .map(el => el.textContent ?? '').join('');

    expect(navNode.querySelector('.lesson-progress__label')).toBeNull();
    expect(visibleProgressText()).not.toContain('Completada');
    expect(visibleProgressText()).not.toContain('Pendiente');
    expect(root.textContent).not.toContain('Progreso manual');
    expect(root.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como pendiente');
    expect(states()).toEqual(['Completada', 'Pendiente']);
    expect(component.completedIds()?.has('l1')).toBe(true);
    expect(root.textContent).not.toContain('Primera lección');
    expect(root.querySelector('a[aria-label="Siguiente: Siguiente real"]')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('.progress-button')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l1', false);
    expect(component.data()?.completed).toBe(false);
    expect(component.completedIds()?.has('l1')).toBe(false);
    expect(states()).toEqual(['Pendiente', 'Pendiente']);
    expect(root.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como completada');
    expect(root.querySelector('a[aria-label="Siguiente: Siguiente real"]')).not.toBeNull();
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
  });

  it('al marcar como completada cambia el indicador del índice y conserva la navegación', async () => {
    const { save } = setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const state = () => root.querySelector<HTMLElement>('app-classroom-nav li a .lesson-progress .sr-only')?.textContent;
    expect(root.querySelector('.lesson-progress__label')).toBeNull();
    expect([...root.querySelectorAll<HTMLElement>('.lesson-progress > *:not(.sr-only)')]
      .map(el => el.textContent ?? '').join('')).not.toMatch(/Completada|Pendiente/);
    expect(state()).toBe('Pendiente');

    root.querySelector<HTMLButtonElement>('.progress-button')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(state()).toBe('Completada');
    expect(root.textContent).not.toContain('Progreso manual');
    expect(root.querySelector('nav[aria-label="Navegación entre lecciones"]')?.textContent).not.toContain('Primera lección');
    // Una sola lección: no hay enlace «Siguiente» que pueda reintroducir texto visible.
    expect(root.querySelector('a[aria-label^="Siguiente:"]')).toBeNull();
  });

  it('el control del índice comprime el raíl visible y lo reabre sin perder foco', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const layout = root.querySelector<HTMLElement>('.aula-layout')!;
    const button = root.querySelector<HTMLButtonElement>('.index-compress')!;
    const aside = root.querySelector<HTMLElement>('aside.aula-sidebar')!;
    const css = authoredCss();

    expect(root.querySelectorAll('.index-compress')).toHaveLength(1);
    // El único control está dentro del aside, en la cabecera del nav; no flota sobre el vídeo.
    expect(button.closest('aside.aula-sidebar')).toBe(aside);
    expect(root.querySelector('app-classroom-nav .nav-head > .index-compress')).toBe(button);
    expect(root.querySelector('.aula-content .index-compress')).toBeNull();
    expect(root.querySelector('.video-stage .index-compress')).toBeNull();
    expect(button.textContent?.trim()).toBe('');
    expect(button.querySelector<SVGElement>('svg.index-compress__icon path')?.getAttribute('d'))
      .toBe('M3 5.5h14M3 10h14M3 14.5h14');
    expect(button.getAttribute('aria-label')).toBe('Comprimir índice');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.hasAttribute('aria-expanded')).toBe(false);
    // El estado comprimido es un raíl visible de 200px, nunca display:none.
    expect(css).toMatch(/\.aula-layout--compact[^{]*\{[^}]*grid-template-columns:\s*200px\s+minmax\(0,\s*1fr\)/);
    expect(css).not.toMatch(/\.aula-layout--compact[^{]*\.aula-sidebar[^{]*\{[^}]*display:\s*none/);

    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(component.indexCompact()).toBe(true);
    expect(layout.classList.contains('aula-layout--compact')).toBe(true);
    // El aside sigue en el DOM y el índice recibe el modo raíl estrecho.
    expect(aside.isConnected).toBe(true);
    expect(root.querySelector('app-classroom-nav nav')?.classList.contains('classroom-nav--compact')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Expandir índice');
    expect(button.getAttribute('title')).toBe('Expandir índice');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(button);
    // No es pantalla completa: vídeo, título y comentarios siguen en el contenido.
    expect(root.querySelector('.video-stage')).not.toBeNull();
    expect(root.querySelector('h1.lesson-title')).not.toBeNull();
    expect(root.querySelector('.aula-dudas app-lesson-comments')).not.toBeNull();

    button.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.indexCompact()).toBe(false);
    expect(layout.classList.contains('aula-layout--compact')).toBe(false);
    expect(root.querySelector('app-classroom-nav nav')?.classList.contains('classroom-nav--compact')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Comprimir índice');
    expect(document.activeElement).toBe(button);
  });

  it('comprimido mantiene dos columnas de 200px solo en escritorio, sin tocar el vídeo a sangre completa', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const css = authoredCss();
    const desktopAt = css.search(/@media[^{]*min-width:\s*48rem/);
    const mobileAt = css.search(/@media[^{]*max-width:\s*47\.999rem/);
    expect(desktopAt).toBeGreaterThan(-1);
    expect(mobileAt).toBeGreaterThan(desktopAt);
    const desktop = css.slice(desktopAt, mobileAt);
    const nextStyle = css.indexOf('@charset', mobileAt + 1);
    const mobile = css.slice(mobileAt, nextStyle === -1 ? css.length : nextStyle);

    expect(desktop).toMatch(/\.aula-layout[^{]*\{[^}]*grid-template-columns:\s*330px\s+minmax\(0,\s*1fr\)/);
    expect(desktop).toMatch(/\.aula-layout--compact[^{]*\{[^}]*grid-template-columns:\s*200px\s+minmax\(0,\s*1fr\)/);
    expect(desktop).not.toMatch(/\.aula-layout--compact[^{]*\.aula-sidebar[^{]*\{[^}]*display:\s*none/);
    // El control vive en classroom-nav: oculto por defecto y visible solo en escritorio.
    expect(css).toMatch(/@media[^{]*min-width:\s*48rem[^{]*\{[^@]*?\.index-compress[^{]*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.index-compress[^{]*\{[^}]*width:\s*44px/);
    expect(css).toMatch(/\.index-compress[^{]*\{[^}]*display:\s*none/);
    expect(mobile).not.toContain('aula-layout--compact');
    expect(mobile).not.toContain('index-compress');
    expect(cssRule(css, '.video')).toMatch(/width:\s*100%/);
    expect(cssRule(css, '.video-stage')).toMatch(/margin-inline:\s*calc\(-1 \* var\(--aula-indent\)\)/);
  });

  it('el raíl comprimido conserva índice accesible: títulos con title y ellipsis, progreso icono, aria-current y plegado', async () => {
    const longTitle = 'Lección con un título muy largo que se recorta en el raíl';
    const preview = { ...firstLesson, id: 'l1', slug: 'uno', title: longTitle };
    const other = { ...secondLesson, id: 'l2', slug: 'dos', title: 'Segunda' };
    const course: AulaData = {
      ...twoLessons,
      lesson: preview,
      lessons: [preview, other],
      sections: [{ id: 's', title: 'Bloque con un título largo' }],
      completed: true,
      completedLessonIds: ['l1'],
    };
    setup(vi.fn().mockResolvedValue(course));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const css = authoredCss();

    root.querySelector<HTMLButtonElement>('.index-compress')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();

    const aside = root.querySelector<HTMLElement>('aside.aula-sidebar')!;
    const navNode = root.querySelector<HTMLElement>('app-classroom-nav nav')!;
    expect(aside.isConnected).toBe(true);
    expect(navNode.classList.contains('classroom-nav--compact')).toBe(true);

    const blockTitle = navNode.querySelector<HTMLElement>('.block-toggle__title')!;
    const lessonTitle = navNode.querySelector<HTMLElement>('.lesson-title')!;
    expect(blockTitle.getAttribute('title')).toBe('Bloque con un título largo');
    expect(lessonTitle.getAttribute('title')).toBe(longTitle);
    // CSS ellipsis no trunca el DOM: el nombre accesible sigue siendo el título completo.
    expect(lessonTitle.textContent).toBe(longTitle);
    expect(css).toMatch(/\.classroom-nav--compact\s+\.lesson-title[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.classroom-nav--compact\s+\.block-toggle__title[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/nav\.classroom-nav--compact[^{]*\{[^}]*padding:\s*0\s+0?\.5rem\s+0?\.5rem/);
    expect(css).toMatch(/\.classroom-nav--compact\s+\.nav-teacher[^{]*\{[^}]*display:\s*none/);

    const current = navNode.querySelector<HTMLAnchorElement>('a[aria-current="page"]')!;
    expect(current.textContent).toContain(longTitle);
    const progress = current.querySelector<HTMLElement>('.lesson-progress')!;
    expect(progress.classList.contains('lesson-progress--done')).toBe(true);
    expect(progress.querySelector('.lesson-progress__icon')).not.toBeNull();
    expect(progress.querySelector<HTMLElement>('.sr-only')?.textContent).toBe('Completada');
    expect([...progress.children].filter(el => !el.classList.contains('sr-only'))
      .map(el => el.textContent ?? '').join('')).toBe('');

    const toggle = navNode.querySelector<HTMLButtonElement>('.block-toggle')!;
    toggle.click(); harness.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(navNode.querySelector<HTMLElement>('#bloque-s')!.hidden).toBe(true);

    // Reabrir devuelve el ancho expandido de 330px y retira el modo raíl.
    root.querySelector<HTMLButtonElement>('.index-compress')!.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(authoredCss()).toMatch(/grid-template-columns:\s*330px\s+minmax\(0,\s*1fr\)/);
    expect(navNode.classList.contains('classroom-nav--compact')).toBe(false);
  });

  it('un solo clic alterna una vez y al reabrir vuelven progreso icon-only, aria-current y plegado', async () => {
    setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const navNode = root.querySelector<HTMLElement>('app-classroom-nav')!;
    const button = root.querySelector<HTMLButtonElement>('.index-compress')!;
    const toggle = navNode.querySelector<HTMLButtonElement>('.block-toggle')!;
    const list = navNode.querySelector<HTMLElement>('#bloque-s')!;
    const states = () => [...navNode.querySelectorAll<HTMLElement>('.lesson-progress .sr-only')]
      .map(el => el.textContent);

    expect(root.querySelectorAll('.index-compress')).toHaveLength(1);
    expect(states()).toEqual(['Pendiente', 'Pendiente']);
    expect(navNode.querySelector('a[aria-current="page"]')?.textContent).toContain('Lección');
    toggle.click(); harness.detectChanges();
    expect(list.hidden).toBe(true);

    button.focus();
    button.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(true);
    expect(document.activeElement).toBe(button);

    button.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(false);
    expect(root.querySelector('app-classroom-nav')).toBe(navNode);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(navNode.querySelector('a[aria-current="page"]')).not.toBeNull();
    expect(states()).toEqual(['Pendiente', 'Pendiente']);
    expect([...navNode.querySelectorAll<HTMLElement>('.lesson-progress > *:not(.sr-only)')]
      .map(el => el.textContent ?? '').join('')).toBe('');

    // Doble clic: dos alternancias, nunca un evento duplicado por pulsación.
    button.click();
    button.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(false);
  });

  it('el estado compacto se conserva al cambiar de lección o refrescar token y se reinicia al cambiar de curso o cerrar sesión', async () => {
    const { status, session } = setup(vi.fn().mockResolvedValue(twoLessons));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const compress = () => harness.routeNativeElement!.querySelector<HTMLButtonElement>('.index-compress')!;
    compress().click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(true);

    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(true); // cambio de lección dentro del mismo curso

    session.set({ user: { id: 'u' } }); // TOKEN_REFRESHED
    harness.detectChanges();
    expect(component.indexCompact()).toBe(true);

    await harness.navigateByUrl('/aula/otro/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(false); // cambio de curso

    compress().click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(component.indexCompact()).toBe(true);
    status.set('anonymous');
    session.set(null);
    harness.detectChanges();
    expect(component.indexCompact()).toBe(false); // logout: identidad distinta
  });

  // --- Estrella única, junto al progreso (el índice ya no la repite) ---

  it('pinta una sola estrella en lesson-actions, junto al progreso y antes de la flecha', async () => {
    const favorites = { list: vi.fn().mockResolvedValue([]), toggle: vi.fn().mockResolvedValue(true) };
    setup(vi.fn().mockResolvedValue(twoLessons), undefined, true, () => null, favorites);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const actions = root.querySelector<HTMLElement>('.lesson-actions')!;
    const nav = actions.querySelector<HTMLElement>('.lesson-nav')!;
    const progress = nav.querySelector<HTMLButtonElement>('.progress-button')!;
    const star = actions.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    const next = nav.querySelector<HTMLAnchorElement>('a[aria-label^="Siguiente:"]')!;

    expect(star).not.toBeNull();
    expect(star.parentElement).toBe(nav);
    // Orden visible: estrella → progreso → flecha, agrupados a la derecha.
    expect(nav.firstElementChild).toBe(star);
    expect(star.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelectorAll('.favorite-toggle')).toHaveLength(1);
    expect(root.querySelector('app-classroom-nav .favorite-toggle')).toBeNull();
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(star.getAttribute('aria-label')).toBe('Añadir lección a favoritos');
    expect(star.getAttribute('title')).toBe('Añadir lección a favoritos');
    expect(star.textContent?.trim()).toBe('');
    expect(star.querySelector('svg path')?.getAttribute('d')).toContain('M10 2.6');
    expect(star.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(cssRule(authoredCss(), '.favorite-toggle')).toMatch(/height:\s*44px/);
    expect(cssRule(authoredCss(), ':focus-visible')).toMatch(/outline:\s*3px solid var\(--focus\)/);
    expect(favorites.list).toHaveBeenCalled();
  });

  it('en móvil alinea a la derecha estrella, progreso y flecha en una sola fila', async () => {
    const favorites = { list: vi.fn().mockResolvedValue([]), toggle: vi.fn().mockResolvedValue(true) };
    setup(vi.fn().mockResolvedValue(twoLessons), undefined, true, () => null, favorites);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const actions = root.querySelector<HTMLElement>('.lesson-actions')!;
    const nav = actions.querySelector<HTMLElement>('.lesson-nav')!;
    const star = nav.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    const progress = nav.querySelector<HTMLButtonElement>('.progress-button')!;
    const next = nav.querySelector<HTMLAnchorElement>('a[aria-label^="Siguiente:"]')!;

    // Los tres controles siguen en la misma banda y en el orden acordado.
    expect([...nav.children]).toEqual([star, progress, next]);
    expect(nav.classList.contains('lesson-nav--end')).toBe(true);
    expect(star.getAttribute('aria-label')).toBe('Añadir lección a favoritos');
    expect(star.getAttribute('aria-pressed')).toBe('false');
    expect(next.querySelector('.arrow-circle')).not.toBeNull();
    expect(next.getAttribute('aria-label')).toBe('Siguiente: Lección');
    expect(actions.querySelector('.lesson-duration')).toBeNull();
    expect(actions.querySelector('.icon--clock')).toBeNull();

    const css = authoredCss();
    const mobile = mobileCss();
    expect(mobile).not.toBe('');
    // La banda ocupa todo el ancho y empuja el clúster a la derecha (regla base, <768px).
    expect(cssRule(css, '.lesson-actions')).toMatch(/width:\s*100%/);
    expect(cssRule(css, '.lesson-actions')).toMatch(/justify-content:\s*flex-end/);
    // En móvil la banda pierde el padding grande y la altura de 6.5rem del escritorio:
    // solo un separador mínimo bajo los controles; el cluster sigue en una sola fila.
    const actionsMobile = mobile.match(/\.lesson-actions[^{]*\{([^}]*)\}/)?.[1]?.replace(/\s+/g, ' ') ?? '';
    expect(actionsMobile).not.toMatch(/padding-block:\s*(?:1\.875rem|var\(--space-5\))/);
    expect(actionsMobile).toMatch(/padding-block:\s*0(?:\s+var\(--space-[12]\))?\s*;/);
    expect(actionsMobile).toMatch(/min-height:\s*0\s*;/);
    // El shell global pone nav { width: 100% } a <=40rem: aquí se neutraliza.
    expect(mobile).toMatch(/\.lesson-nav[^{]*\{[^}]*width:\s*auto/);
    expect(mobile).toMatch(/\.lesson-nav[^{]*\{[^}]*justify-content:\s*flex-end/);
    expect(mobile).toMatch(/\.lesson-nav[^{]*\{[^}]*flex-wrap:\s*nowrap/);

    // Causa real del «mucho padding»: la sangría del artículo baja de ~30px a ~12px en móvil.
    expect(cssRule(css, '.aula-content')).toMatch(/padding-inline:\s*var\(--aula-indent\)/);
    expect(mobile).toMatch(/\.aula-layout[^{]*\{[^}]*--aula-indent:\s*0?\.75rem\s*;/);
    // El vídeo recalcula su sangrado con la variable y conserva un margen sin tocar el borde.
    expect(cssRule(css, '.video-stage')).toMatch(/margin-inline:\s*calc\(-1 \* var\(--aula-indent\)\)/);
    expect(mobile).toMatch(/\.video-stage[^{]*\{[^}]*margin-inline:\s*-0?\.375rem\s*;/);
    // Botón: relleno de ~10px a ~6px, fuente menor y 44px táctiles intactos.
    const progressMobile = mobile.match(/\.progress-button[^{]*\{([^}]*)\}/)?.[1]?.replace(/\s+/g, ' ') ?? '';
    expect(progressMobile).toMatch(/padding:\s*0\s+var\(--space-2\)/);
    expect(progressMobile).toMatch(/font-size:\s*0?\.9rem/);
    expect(progressMobile).toMatch(/min-width:\s*0/);
    expect(css).toMatch(/:is\(\.progress-button[^{]*\{[^}]*min-height:\s*44px/);
    // Ni apilado, ni centrado, ni estrella oculta en móvil.
    expect(mobile).not.toMatch(/\.lesson-(actions|nav)[^{]*\{[^}]*flex-direction:\s*column/);
    expect(mobile).not.toMatch(/\.lesson-(actions|nav)[^{]*\{[^}]*justify-content:\s*(flex-start|center|space-between)/);
    expect(mobile).not.toMatch(/\.favorite-toggle[^{]*\{[^}]*display:\s*none/);
    // Escritorio intacto: mismos 44px de target y foco visible.
    expect(cssRule(css, '.lesson-actions')).toMatch(/justify-content:\s*flex-end/);
    expect(cssRule(css, '.lesson-actions')).toMatch(/width:\s*100%/);
    expect(css).toMatch(/\.favorite-toggle\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/);
    expect(cssRule(css, ':focus-visible')).toMatch(/outline:\s*3px solid var\(--focus\)/);
  });

  it('alterna el favorito sin guardar progreso ni navegar, actualizando aria sin recargar', async () => {
    const toggle = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const favorites = { list: vi.fn().mockResolvedValue([]), toggle };
    const { save } = setup(vi.fn().mockResolvedValue(data), undefined, true, () => null, favorites);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const navNode = root.querySelector<HTMLElement>('.lesson-nav')!;
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const star = () => root.querySelector<HTMLButtonElement>('.favorite-toggle')!;

    star().click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(toggle).toHaveBeenCalledWith('l');
    expect(star().getAttribute('aria-pressed')).toBe('true');
    expect(star().getAttribute('aria-label')).toBe('Quitar lección de favoritos');
    expect(star().classList.contains('favorite-toggle--on')).toBe(true);

    star().click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(star().getAttribute('aria-pressed')).toBe('false');
    expect(star().getAttribute('aria-label')).toBe('Añadir lección a favoritos');
    expect(star().classList.contains('favorite-toggle--on')).toBe(false);

    expect(save).not.toHaveBeenCalled();
    expect(component.data()?.completed).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(root.querySelector('.lesson-nav')).toBe(navNode);
  });

  it('parte del estado real del servidor y lo recarga al cambiar de lección o de identidad', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce([{ lessonId: 'l1' }])
      .mockResolvedValueOnce([{ lessonId: 'l2' }])
      .mockResolvedValue([]);
    const { session } = setup(vi.fn().mockResolvedValue(twoLessons), undefined, true, () => null,
      { list, toggle: vi.fn().mockResolvedValue(true) });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const starLabel = () => harness.routeNativeElement!.querySelector<HTMLButtonElement>('.favorite-toggle')?.getAttribute('aria-label');
    expect(starLabel()).toBe('Quitar lección de favoritos');

    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(starLabel()).toBe('Quitar lección de favoritos');

    session.set({ user: { id: 'otro' } });
    await harness.fixture.whenStable();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(starLabel()).toBe('Añadir lección a favoritos');
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('avisa accesiblemente sin cambiar el estado si falla el favorito, sin filtrar motivos', async () => {
    const toggle = vi.fn().mockRejectedValue(new Error('token=secreto alumno@ejemplo.test'));
    setup(vi.fn().mockResolvedValue(data), undefined, true, () => null,
      { list: vi.fn().mockResolvedValue([{ lessonId: 'l' }]), toggle });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    const star = root.querySelector<HTMLButtonElement>('.favorite-toggle')!;

    star.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(star.getAttribute('aria-label')).toBe('Quitar lección de favoritos');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se ha podido actualizar favoritos');
    expect(root.textContent).not.toContain('secreto');
    expect(root.textContent).not.toContain('@');
  });

  it('bloquea el doble clic de la estrella', async () => {
    const toggle = vi.fn().mockResolvedValue(true);
    setup(vi.fn().mockResolvedValue(data), undefined, true, () => null,
      { list: vi.fn().mockResolvedValue([]), toggle });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const star = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.favorite-toggle')!;
    star.click();
    star.click();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('sin repositorio de favoritos no pinta ninguna estrella', async () => {
    setup(vi.fn().mockResolvedValue(data));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.favorite-toggle')).toBeNull();
  });

  // --- Finalización automática solo con `ended` verificado ---

  it('marca completada al terminar el vídeo, una sola vez, sin robar foco', async () => {
    const capture: { handler?: () => void; unsub?: () => void } = {};
    const { save } = setup(vi.fn().mockResolvedValue(data), undefined, true, playbackWithEnded(capture));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('#lesson-video-frame')).not.toBeNull();
    expect(capture.handler).toBeTypeOf('function');

    const focused = document.activeElement;
    capture.handler!();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(component.data()?.completed).toBe(true);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Lección completada');
    expect(root.querySelector('.progress-button')?.textContent?.trim()).toBe('Marcar como pendiente');
    expect(document.activeElement).toBe(focused);

    capture.handler!();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('no guarda con ended si no hay derecho de seguimiento (como en la vista previa)', async () => {
    const capture: { handler?: () => void } = {};
    const { save } = setup(vi.fn().mockResolvedValue({ ...data, canTrack: false }), undefined, true, playbackWithEnded(capture));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    capture.handler!();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.textContent).not.toContain('Lección completada');
  });

  it('descarta un ended tardío al cambiar de lección o tras destruir el componente', async () => {
    const capture: { handler?: () => void } = {};
    const { save } = setup(vi.fn().mockResolvedValue(twoLessons), undefined, true, playbackWithEnded(capture));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const old = capture.handler!;

    await harness.navigateByUrl('/aula/curso/dos', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    old();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).not.toHaveBeenCalled();

    harness.fixture.destroy();
    old();
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
  });

  it('avisa si falla el guardado automático sin marcar la lección', async () => {
    const capture: { handler?: () => void } = {};
    const save = vi.fn().mockRejectedValue(new Error('sin detalle'));
    setup(vi.fn().mockResolvedValue(data), save, true, playbackWithEnded(capture));
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/aula/curso/uno', Aula);
    await harness.fixture.whenStable(); harness.detectChanges();
    const root = harness.routeNativeElement!;

    capture.handler!();
    await harness.fixture.whenStable(); harness.detectChanges();
    await harness.fixture.whenStable(); harness.detectChanges();
    expect(save).toHaveBeenCalledWith('u', 'l', true);
    expect(component.data()?.completed).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No se pudo marcar la lección como completada');
  });
});
