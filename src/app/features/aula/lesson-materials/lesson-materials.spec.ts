import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { LessonMaterials } from './lesson-materials';

const item = { id: 'resource', title: '<b>Apuntes</b>', kind: 'pdf' as const };
const other = { id: 'second', title: 'Partitura', kind: 'pdf' as const };
const url = 'https://example.test/storage/v1/object/sign/lesson-pdfs/course/lesson/resource/file.pdf?token=temporary';
const badUrls = [
  'javascript:alert(1)',
  'https://evil.test/storage/v1/object/sign/lesson-pdfs/course/lesson/resource/file.pdf?token=x',
  'https://example.test/storage/v1/object/sign/other/x?token=x',
];

describe('Materiales del alumno', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function setup(list = vi.fn().mockResolvedValue([item]), download = vi.fn().mockResolvedValue(url), authenticated = true) {
    const status = signal(authenticated ? 'authenticated' : 'anonymous');
    const session = signal<{ user: { id: string } } | null>(authenticated ? { user: { id: 'one' } } : null);
    const error = signal<string | null>(null);
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
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

  /** Navegación y ventana observadas sin navegar ni abrir nada de verdad. */
  function spies(fixture: ReturnType<typeof setup>['fixture']) {
    return {
      nav: vi.spyOn(fixture.componentInstance as any, 'navigate').mockImplementation(() => {}),
      popup: vi.spyOn(window, 'open').mockReturnValue(null),
    };
  }
  function buttonWith(root: HTMLElement, label: string): HTMLButtonElement {
    return [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!;
  }
  async function settle(fixture: ReturnType<typeof setup>['fixture']) {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  /** Reglas del componente ya compiladas: comprueba lo declarado, no píxeles calculados. */
  function styleRules(): { css: string; download: string[] } {
    const css = [...document.querySelectorAll('style')].map(node => node.textContent ?? '').join('\n');
    return { css, download: css.match(/\.download-button[^{]*\{[^}]*\}/g) ?? [] };
  }

  it('muestra un esqueleto de lista con un único aviso accesible mientras consulta', async () => {
    let resolve!: (value: typeof item[]) => void;
    const { fixture } = setup(vi.fn().mockReturnValue(new Promise(r => { resolve = r; })));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Consultando materiales');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    resolve([item]);
  });

  it('no consulta anónimamente y ofrece acceso interno', async () => {
    const { fixture, list } = setup(undefined, undefined, false);
    await fixture.whenStable();
    expect(list).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toContain('/auth/login');
  });

  it('prepara la firma al entrar y ofrece una sola acción sin popup ni paso «Preparar»', async () => {
    const { fixture, download } = setup();
    const { nav, popup } = spies(fixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
    await settle(fixture);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('lesson', 'resource');
    const open = buttonWith(fixture.nativeElement, 'Descargar PDF');
    expect(open).toBeTruthy();
    expect(open.getAttribute('aria-label')).toBe('Descargar PDF: <b>Apuntes</b>');
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain(url);
    const heading = fixture.nativeElement.querySelector('h3') as HTMLElement;
    expect(heading.textContent?.trim()).toBe('Materiales de la lección');
    expect(fixture.nativeElement.textContent).not.toContain('Materiales PDF');
    expect(fixture.nativeElement.textContent).not.toContain('Documento de la lección');
    expect(fixture.nativeElement.textContent).not.toContain('El archivo se descarga en tu dispositivo');
    expect(fixture.nativeElement.textContent).not.toContain('Los enlaces se preparan');
    expect(fixture.nativeElement.textContent).not.toContain('minuto');
    expect(fixture.nativeElement.textContent).not.toContain('caduc');
    expect(fixture.nativeElement.textContent).not.toContain('se pide uno nuevo');
    expect(fixture.nativeElement.textContent).not.toContain('Preparar descarga');
    expect(fixture.nativeElement.textContent).not.toContain('en esta pestaña');
    expect(fixture.nativeElement.textContent).not.toContain('Atrás');
    expect(nav).not.toHaveBeenCalled();
    expect(popup).not.toHaveBeenCalled();

    open.click();
    await Promise.resolve();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith(url);
    expect(download).toHaveBeenCalledTimes(1);
    expect(popup).not.toHaveBeenCalled();
  });

  it('la descarga lleva la clase de acción, texto exacto y nombre accesible', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const open = buttonWith(fixture.nativeElement, 'Descargar PDF');
    expect(open.classList.contains('download-button')).toBe(true);
    expect(open.getAttribute('type')).toBe('button');
    expect(open.textContent?.trim()).toBe('Descargar PDF');
    expect(open.getAttribute('aria-label')).toBe('Descargar PDF: <b>Apuntes</b>');
    expect(open.disabled).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('a').length).toBe(0);
  });

  it('la acción mantiene su estilo al preparar y al reintentar', async () => {
    let resolveDownload!: (value: string) => void;
    const download = vi.fn(() => new Promise<string>(r => { resolveDownload = r; }));
    const { fixture } = setup(undefined, download);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    const preparing = buttonWith(fixture.nativeElement, 'Descargar PDF');
    expect(preparing.classList.contains('download-button')).toBe(true);
    expect(preparing.disabled).toBe(true);
    expect(preparing.getAttribute('aria-label')).toBe('Descargar PDF: <b>Apuntes</b>');
    resolveDownload(url);
    await settle(fixture);
    expect(buttonWith(fixture.nativeElement, 'Descargar PDF').disabled).toBe(false);
  });

  it('reintentar comparte la misma acción visual', async () => {
    const { fixture } = setup(undefined, vi.fn().mockResolvedValue(badUrls[0]));
    await settle(fixture);
    const retry = buttonWith(fixture.nativeElement, 'Reintentar');
    expect(retry.classList.contains('download-button')).toBe(true);
    expect(retry.getAttribute('aria-label')).toBe('Reintentar descarga de <b>Apuntes</b>');
  });

  it('declara 44px, tokens del proyecto, foco visible y movimiento reducido', async () => {
    const { fixture } = setup();
    await settle(fixture);
    const { css, download } = styleRules();
    expect(download.length).toBeGreaterThan(0);
    expect(download[0]).toMatch(/min-height:\s*44px/);
    expect(download[0]).toMatch(/var\(--accent\)/);
    expect(download[0]).toMatch(/var\(--surface\)/);
    expect(download.join('\n')).toMatch(/var\(--border\)/);
    expect(download[0]).toMatch(/var\(--radius\)/);
    expect(download.some(rule => rule.includes(':focus-visible') && rule.includes('var(--focus)'))).toBe(true);
    expect(download.some(rule => rule.includes(':hover:not(:disabled)'))).toBe(true);
    expect(download.some(rule => rule.includes(':active:not(:disabled)'))).toBe(true);
    expect(download.some(rule => rule.includes(':disabled'))).toBe(true);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(download.some(rule => rule.includes('transition: none'))).toBe(true);
  });

  it('presenta vacío sin pedir recursos', async () => {
    const { fixture, download } = setup(vi.fn().mockResolvedValue([]));
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No hay materiales');
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['401', '403', 'SDK'])('error %s no revela recursos', async (code) => {
    const { fixture } = setup(vi.fn().mockRejectedValue(new Error(code)));
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No se puede acceder');
    expect(fixture.nativeElement.textContent).not.toContain(code);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it.each(badUrls)('rechaza URL insegura %s y ofrece reintentar', async (bad) => {
    const { fixture } = setup(undefined, vi.fn().mockResolvedValue(bad));
    const { nav } = spies(fixture);
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No se pudo descargar el PDF');
    expect(fixture.nativeElement.textContent).not.toContain(bad);
    const retry = buttonWith(fixture.nativeElement, 'Reintentar');
    expect(retry).toBeTruthy();
    expect(retry.getAttribute('aria-label')).toContain(item.title);
    expect(nav).not.toHaveBeenCalled();
  });

  it('un fallo de red muestra error y «Reintentar» abre con una sola pulsación', async () => {
    const download = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(url);
    const { fixture } = setup(undefined, download);
    const { nav, popup } = spies(fixture);
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No se pudo descargar el PDF');
    expect(nav).not.toHaveBeenCalled();

    buttonWith(fixture.nativeElement, 'Reintentar').click();
    await Promise.resolve();
    fixture.detectChanges();
    expect(download).toHaveBeenCalledTimes(2);
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith(url);
    expect(popup).not.toHaveBeenCalled();
  });

  it('refresco no recarga; logout descarta respuesta tardía', async () => {
    let resolve!: (value: string) => void;
    const download = vi.fn(() => new Promise<string>(r => { resolve = r; }));
    const { fixture, list, session, status } = setup(undefined, download);
    const { nav } = spies(fixture);
    await fixture.whenStable();
    session.set({ user: { id: 'one' } });
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(1);

    fixture.detectChanges();
    session.set(null);
    status.set('anonymous');
    fixture.detectChanges();
    resolve(url);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(item.title);
    expect(nav).not.toHaveBeenCalled();
  });

  it('descarta listado tardío al cambiar de lección', async () => {
    let resolve!: (value: typeof item[]) => void;
    const list = vi.fn().mockReturnValueOnce(new Promise(r => { resolve = r; })).mockResolvedValue([]);
    const { fixture } = setup(list);
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentRef.setInput('lessonId', 'other');
    fixture.detectChanges();
    await fixture.whenStable();
    resolve([item]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(item.title);
    expect(fixture.nativeElement.textContent).not.toContain('Apuntes');
  });

  it('descarta la descarga tardía de la lección anterior', async () => {
    let resolveFirst!: (value: string) => void;
    const download = vi.fn()
      .mockReturnValueOnce(new Promise<string>(r => { resolveFirst = r; }))
      .mockResolvedValueOnce(url);
    const { fixture } = setup(undefined, download);
    const { nav } = spies(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentRef.setInput('lessonId', 'other');
    fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    resolveFirst('https://example.test/storage/v1/object/sign/lesson-pdfs/course/lesson/resource/file.pdf?token=viejo');
    await fixture.whenStable(); fixture.detectChanges();
    expect(nav).not.toHaveBeenCalled();
  });

  it('al caducar mantiene una sola acción «Descargar PDF» que pide firma nueva y navega', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, download } = setup();
      const { nav, popup } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      expect(buttonWith(fixture.nativeElement, 'Descargar PDF')).toBeTruthy();
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('El enlace ha caducado');
      expect(fixture.nativeElement.textContent).not.toContain('Renovar');
      expect(nav).not.toHaveBeenCalled();

      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(download).toHaveBeenCalledTimes(2);
      expect(download).toHaveBeenLastCalledWith('lesson', 'resource');
      expect(nav).toHaveBeenCalledTimes(1);
      expect(nav).toHaveBeenCalledWith(url);
      expect(popup).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('un fallo al abrir mantiene el reintento en la misma acción y sin popup', async () => {
    vi.useFakeTimers();
    try {
      const download = vi.fn().mockResolvedValueOnce(url).mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(url);
      const { fixture } = setup(undefined, download);
      const { nav, popup } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudo descargar el PDF');
      expect(nav).not.toHaveBeenCalled();

      buttonWith(fixture.nativeElement, 'Reintentar').click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(download).toHaveBeenCalledTimes(3);
      expect(nav).toHaveBeenCalledTimes(1);
      expect(nav).toHaveBeenCalledWith(url);
      expect(popup).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarta la firma pedida al caducar si cambia la identidad', async () => {
    let resolveFresh!: (value: string) => void;
    vi.useFakeTimers();
    try {
      const download = vi.fn().mockResolvedValueOnce(url)
        .mockReturnValueOnce(new Promise<string>(r => { resolveFresh = r; }));
      const { fixture, session, status } = setup(undefined, download);
      const { nav } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();

      session.set(null);
      status.set('anonymous');
      fixture.detectChanges();
      resolveFresh(url);
      await Promise.resolve();
      fixture.detectChanges();
      expect(nav).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarta la firma pedida al caducar si se destruye el componente', async () => {
    let resolveFresh!: (value: string) => void;
    vi.useFakeTimers();
    try {
      const download = vi.fn().mockResolvedValueOnce(url)
        .mockReturnValueOnce(new Promise<string>(r => { resolveFresh = r; }));
      const { fixture } = setup(undefined, download);
      const { nav } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      fixture.destroy();
      resolveFresh(url);
      await Promise.resolve();
      expect(nav).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('muestra una acción por recurso tras prepararlos todos', async () => {
    const { fixture, download } = setup(vi.fn().mockResolvedValue([item, other]), vi.fn((_lesson: string, id: string) =>
      Promise.resolve(`https://example.test/storage/v1/object/sign/lesson-pdfs/course/lesson/${id}/file.pdf?token=t`)));
    await settle(fixture);
    expect(download).toHaveBeenCalledWith('lesson', item.id);
    expect(download).toHaveBeenCalledWith('lesson', other.id);
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.filter(b => b.textContent?.trim() === 'Descargar PDF')).toHaveLength(2);
  });

  it('montaje, listado, expiración y cambio de lección nunca navegan ni descargan el PDF', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, download } = setup();
      const { nav, popup } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      expect(download).toHaveBeenCalledTimes(1);
      expect(nav).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      fixture.componentRef.setInput('lessonId', 'other');
      fixture.detectChanges();
      await Promise.resolve(); fixture.detectChanges();
      expect(nav).not.toHaveBeenCalled();
      expect(popup).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('doble clic con la firma lista navega una sola vez', async () => {
    const { fixture, download } = setup();
    const { nav, popup } = spies(fixture);
    await settle(fixture);
    const open = buttonWith(fixture.nativeElement, 'Descargar PDF');
    open.click(); open.click();
    await Promise.resolve();
    expect(nav).toHaveBeenCalledTimes(1);
    expect(nav).toHaveBeenCalledWith(url);
    expect(download).toHaveBeenCalledTimes(1);
    expect(popup).not.toHaveBeenCalled();
  });

  it('doble clic mientras llega la firma pide y navega una sola vez', async () => {
    let resolve!: (value: string) => void;
    const download = vi.fn().mockResolvedValueOnce(url)
      .mockReturnValueOnce(new Promise<string>(r => { resolve = r; }));
    vi.useFakeTimers();
    try {
      const { fixture } = setup(undefined, download);
      const { nav } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      const open = buttonWith(fixture.nativeElement, 'Descargar PDF');
      open.click(); open.click();
      expect(download).toHaveBeenCalledTimes(2); // una inicial + una del clic
      resolve(url);
      await Promise.resolve();
      fixture.detectChanges();
      expect(nav).toHaveBeenCalledTimes(1);
      expect(nav).toHaveBeenCalledWith(url);
      // El cooldown no es un bloqueo permanente: tras 1 s un clic novo abre.
      vi.advanceTimersByTime(1_000);
      fixture.detectChanges();
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      expect(nav).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el cooldown expira sin abrir ni pedir firmas y permite un clic posterior', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, download } = setup();
      const { nav, popup } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      expect(nav).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(3_000);
      fixture.detectChanges();
      expect(nav).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledTimes(1);
      expect(popup).not.toHaveBeenCalled();

      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      expect(nav).toHaveBeenCalledTimes(2);
      expect(download).toHaveBeenCalledTimes(1); // reutiliza la firma vigente
    } finally {
      vi.useRealTimers();
    }
  });

  it('cambiar la identidad o destruir limpia el cooldown sin abrir nada', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, download, session, status } = setup();
      const { nav } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      expect(nav).toHaveBeenCalledTimes(1);

      status.set('anonymous');
      session.set(null);
      fixture.detectChanges();
      vi.advanceTimersByTime(5_000);
      expect(nav).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledTimes(1);

      status.set('authenticated');
      session.set({ user: { id: 'two' } });
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      expect(nav).toHaveBeenCalledTimes(2);
      const callsAtDestroy = nav.mock.calls.length;
      fixture.destroy();
      vi.advanceTimersByTime(5_000);
      expect(nav).toHaveBeenCalledTimes(callsAtDestroy);
    } finally {
      vi.useRealTimers();
    }
  });

  it('temporizadores y actualizaciones posteriores no reabren el PDF', async () => {
    vi.useFakeTimers();
    try {
      const { fixture } = setup();
      const { nav } = spies(fixture);
      fixture.detectChanges();
      for (let i = 0; i < 5; i++) { await Promise.resolve(); fixture.detectChanges(); }
      buttonWith(fixture.nativeElement, 'Descargar PDF').click();
      await Promise.resolve();
      fixture.detectChanges();
      expect(nav).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5 * 60_000);
      fixture.detectChanges();
      expect(nav).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('anuncia la preparación en una región viva sin filtrar la URL firmada', async () => {
    let resolveDownload!: (value: string) => void;
    const download = vi.fn(() => new Promise<string>(r => { resolveDownload = r; }));
    const { fixture } = setup(undefined, download);
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector('[role="status"][aria-live="polite"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.textContent).toContain('Preparando');
    expect(region.textContent).not.toContain(url);
    resolveDownload(url);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(region.textContent).not.toContain(url);
  });
});
