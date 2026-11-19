import { readFileSync } from 'node:fs';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Library, LibraryCourse, LibraryProblem, MisCursosRepository } from './mis-cursos-repository';
import { CHECKOUT_SCHEDULER, CheckoutVerification } from './mis-cursos-checkout';
import { MisCursosCheckoutRepository } from './mis-cursos-checkout-repository';
import { MisCursos } from './mis-cursos';

const card = (id: string, extra: Partial<LibraryCourse> = {}): LibraryCourse => ({
  id,
  slug: id,
  title: `Curso ${id}`,
  summary: null,
  level: 'basico',
  total: 2,
  completed: 1,
  percent: 50,
  resume: 'leccion',
  ...extra,
});
const library = (courses: LibraryCourse[], problems: LibraryProblem[] = [], unavailable = 0): Library =>
  ({ courses, problems, unavailable });

function setup(options: {
  load?: any;
  status?: any;
  session?: any;
} = {}) {
  const status = options.status ?? signal('authenticated');
  const session = options.session ?? signal({ user: { id: 'u' } });
  const load = options.load ?? vi.fn().mockResolvedValue(library([card('c')]));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: AuthService, useValue: { status, session } },
    { provide: MisCursosRepository, useValue: { load } },
  ] });
  const fixture = TestBed.createComponent(MisCursos);
  return { fixture, status, session, load, text: () => fixture.nativeElement.textContent as string };
}

async function render(fixture: ReturnType<typeof setup>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('MisCursos', () => {
  it('muestra el antetítulo de biblioteca junto al título Mis cursos', async () => {
    const { fixture } = setup();
    await render(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.library__header .eyebrow')?.textContent?.trim()).toBe('Tu biblioteca');
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Mis cursos');
  });

  it('muestra tarjetas con progreso accesible y enlaces de curso y aula', async () => {
    const { fixture, text } = setup({ load: vi.fn().mockResolvedValue(library([card('c', { summary: 'Resumen' })])) });
    await render(fixture);

    expect(text()).toContain('1/2 lecciones completadas (50 %)');
    expect((fixture.nativeElement as HTMLElement).querySelector('progress')?.getAttribute('aria-label')).toBe('Progreso de Curso c');
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/aula/c/leccion"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/cursos/c"]')).not.toBeNull();
  });

  it('muestra carga, vacío y login, y descarta una respuesta tardía de otra cuenta', async () => {
    const status = signal('authenticated');
    const session = signal<{ user: { id: string } }>({ user: { id: 'a' } });
    let resolveA!: (value: Library) => void;
    const load = vi.fn((id: string) => id === 'a'
      ? new Promise<Library>((resolve) => { resolveA = resolve; })
      : Promise.resolve(library([])));
    const { fixture, text } = setup({ status, session, load });

    fixture.detectChanges();
    expect(text()).toContain('Cargando tus cursos');

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    resolveA(library([card('old', { title: 'Privado anterior' })]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('No tienes cursos disponibles');
    expect(text()).not.toContain('Privado anterior');

    status.set('anonymous');
    session.set(null as unknown as { user: { id: string } });
    fixture.detectChanges();
    expect(text()).toContain('Inicia sesión');
    expect(text()).not.toContain('Privado anterior');
  });

  it('muestra un esqueleto accesible y aria-busy mientras carga la biblioteca', async () => {
    let resolve!: (value: Library) => void;
    const load = vi.fn().mockReturnValue(new Promise<Library>(r => { resolve = r; }));
    const { fixture, text } = setup({ load });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('card');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(text()).toContain('Cargando tus cursos');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('article.library')?.getAttribute('aria-busy')).toBe('true');
    resolve(library([]));
  });

  it('un TOKEN_REFRESHED con el mismo usuario no repite consultas ni pierde la biblioteca', async () => {
    const session = signal({ user: { id: 'a' }, access_token: 'inicial' });
    const load = vi.fn().mockResolvedValue(library([card('c')]));
    const { fixture, text } = setup({ session, load });
    await render(fixture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Curso c');

    session.set({ user: { id: 'a' }, access_token: 'refrescado' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Curso c');
    expect(text()).not.toContain('Cargando tus cursos');
  });

  it('un error global muestra aviso honesto y su reintento recupera la biblioteca', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('load'))
      .mockResolvedValueOnce(library([card('c')]));
    const { fixture, text } = setup({ load });
    await render(fixture);

    expect(text()).toContain('No se han podido cargar tus cursos');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();

    const button = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"] ~ button, button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Curso c');
    expect(text()).not.toContain('No se han podido cargar tus cursos');
  });

  it('un fallo parcial conserva la tarjeta válida y reintenta solo los fallidos sin duplicar', async () => {
    const good = card('a');
    const problems: LibraryProblem[] = [
      { courseId: 'hidden', kind: 'unavailable' },
      { courseId: 'b', kind: 'failed' },
    ];
    let retryPayload: unknown = null;
    const load = vi.fn()
      .mockResolvedValueOnce(library([good], problems, 1))
      .mockImplementationOnce((_userId: string, retry?: unknown) => {
        retryPayload = retry;
        return Promise.resolve(library([good, card('b')], [problems[0]], 1));
      });
    const { fixture, text } = setup({ load });
    await render(fixture);

    expect(text()).toContain('Curso a');
    expect(text()).toContain('No se pudieron cargar 1 curso');
    expect(text()).toContain('no están disponibles');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Reintentar cursos con fallo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(retryPayload).toMatchObject({
      courses: [good],
      problems,
    });
    expect(text()).toContain('Curso b');
    expect(text()).not.toContain('No se pudieron cargar');
    expect(text()).toContain('no están disponibles');

    const titles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2'))
      .map((node: Element) => node.textContent);
    expect(titles.filter((title) => title === 'Curso a')).toHaveLength(1);
    expect(titles.filter((title) => title === 'Curso b')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button')).toHaveLength(0);
  });

  it('un reintento parcial que vuelve a fallar mantiene la tarjeta válida sin bucle', async () => {
    const problems: LibraryProblem[] = [{ courseId: 'b', kind: 'failed' }];
    const load = vi.fn()
      .mockResolvedValueOnce(library([card('a')], problems))
      .mockResolvedValueOnce(library([card('a')], problems));
    const { fixture, text } = setup({ load });
    await render(fixture);

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Reintentar cursos con fallo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Curso a');
    expect(text()).toContain('No se pudieron cargar 1 curso');
    expect(load.mock.calls[1][1]).toMatchObject({ courses: [card('a')], problems });
  });

  it('cambiar de cuenta descarta tarjetas privadas y problems de la identidad anterior', async () => {
    const session = signal<{ user: { id: string } }>({ user: { id: 'a' } });
    const load = vi.fn((id: string) => Promise.resolve(id === 'a'
      ? library([card('old', { title: 'Privado anterior' })], [{ courseId: 'old', kind: 'failed' }])
      : library([card('new', { title: 'Nuevo curso' })])));
    const { fixture, text } = setup({ session, load });
    await render(fixture);
    expect(text()).toContain('Privado anterior');

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Nuevo curso');
    expect(text()).not.toContain('Privado anterior');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button')).toHaveLength(0);
  });
});

const order = '40000000-0000-0000-0000-000000000001';
const otherOrder = '40000000-0000-0000-0000-000000000002';
interface Scheduled {
  task: () => void;
  ms: number;
  cancelled: boolean;
}

/** Escenario con query de retorno, verificación y temporizadores controlados. */
function setupCheckout(options: {
  query?: Record<string, string>;
  verification?: CheckoutVerification;
  verify?: any;
  load?: any;
  status?: any;
  session?: any;
} = {}) {
  const status = options.status ?? signal('authenticated');
  const session = options.session ?? signal({ user: { id: 'u' } });
  const load = options.load ?? vi.fn().mockResolvedValue(library([card('c')]));
  const impl: (id: string, user: string) => Promise<CheckoutVerification> =
    typeof options.verification === 'function'
      ? options.verification
      : async () => options.verification ?? { kind: 'confirmed', courseId: 'c' };
  const verify = options.verify ?? vi.fn(impl);
  const params = new BehaviorSubject(convertToParamMap(options.query ?? {}));
  const route = { queryParamMap: params.asObservable() };
  const scheduled: Scheduled[] = [];
  let handle = 0;
  const scheduler = {
    schedule: vi.fn((task: () => void, ms: number) => {
      const id = ++handle;
      scheduled.push({ task, ms, cancelled: false });
      return id;
    }),
    cancel: vi.fn((id: unknown) => {
      const entry = scheduled.find((item, index) => index + 1 === id);
      if (entry) entry.cancelled = true;
    }),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: route },
    { provide: AuthService, useValue: { status, session } },
    { provide: MisCursosRepository, useValue: { load } },
    { provide: MisCursosCheckoutRepository, useValue: { verify } },
    { provide: CHECKOUT_SCHEDULER, useValue: scheduler },
  ] });
  const fixture = TestBed.createComponent(MisCursos);
  const text = () => fixture.nativeElement.textContent as string;
  const fire = () => {
    const pending = scheduled.filter((item) => !item.cancelled);
    scheduled.length = 0;
    for (const item of pending) item.task();
    return pending.length;
  };
  const tick = async () => {
    fire();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, status, session, load, verify, scheduler, scheduled, params, text, tick, fire };
}

describe('MisCursos — retorno de Stripe', () => {
  it('sin query de retorno, sin order_id, con UUID inválido o sin sesión no consulta pedidos', async () => {
    const none = setupCheckout();
    await render(none.fixture);
    expect(none.verify).not.toHaveBeenCalled();
    expect(none.load).toHaveBeenCalledTimes(1);

    const invalidQueries: Record<string, string>[] = [
      { checkout: 'success' },
      { checkout: 'success', order_id: 'no-uuid' },
    ];
    for (const query of invalidQueries) {
      const scenario = setupCheckout({ query });
      await render(scenario.fixture);
      expect(scenario.verify).not.toHaveBeenCalled();
      expect(scenario.text()).toContain('No hay acceso disponible');
    }

    const anonymous = setupCheckout({
      query: { checkout: 'success', order_id: order },
      status: signal('anonymous'),
    });
    await render(anonymous.fixture);
    expect(anonymous.verify).not.toHaveBeenCalled();
    expect(anonymous.text()).toContain('Inicia sesión');
  });

  it('confirmado por la BD refresca la biblioteca sin duplicar y conserva problemas', async () => {
    const problems: LibraryProblem[] = [{ courseId: 'hidden', kind: 'unavailable' }];
    const load = vi.fn()
      .mockResolvedValueOnce(library([card('c')], problems, 1))
      .mockResolvedValueOnce(library([card('c'), card('d')], problems, 1));
    const { fixture, verify, text } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'confirmed', courseId: 'c' },
      load,
    });
    await render(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('Acceso confirmado');
    expect(verify).toHaveBeenCalledWith(order, 'u');
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][1]).toMatchObject({
      courses: [card('c')],
      problems,
      includeCourseIds: ['c'],
    });
    const titles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2'))
      .map((node) => node.textContent);
    expect(titles.filter((title) => title === 'Curso c')).toHaveLength(1);
    expect(text()).toContain('no están disponibles');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/cursos/c"]')).not.toBeNull();
  });

  it('pendiente hace cuatro intentos acotados con backoff y deja comprobación manual', async () => {
    const { fixture, verify, scheduler, text, tick } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'pending' },
    });
    await render(fixture);
    expect(text()).toContain('confirmación del pago está pendiente');
    expect(verify).toHaveBeenCalledTimes(1);

    await tick();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(scheduler.schedule.mock.calls[0][1]).toBe(1500);
    await tick();
    expect(verify).toHaveBeenCalledTimes(3);
    expect(scheduler.schedule.mock.calls[1][1]).toBe(3000);
    await tick();
    expect(verify).toHaveBeenCalledTimes(4);
    expect(scheduler.schedule.mock.calls[2][1]).toBe(6000);
    expect(scheduler.schedule).toHaveBeenCalledTimes(3);

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Comprobar de nuevo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(verify).toHaveBeenCalledTimes(5);
  });

  it('un refresh de token con la misma cuenta no repite la comprobación', async () => {
    const session = signal({ user: { id: 'u' }, access_token: 'inicial' });
    const { fixture, verify, text } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'pending' },
      session,
    });
    await render(fixture);
    expect(verify).toHaveBeenCalledTimes(1);

    session.set({ user: { id: 'u' }, access_token: 'refrescado' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(text()).toContain('pendiente');
  });

  it('un error de red muestra aviso con reintento y solo la BD puede confirmar', async () => {
    const verify = vi.fn()
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({ kind: 'confirmed', courseId: 'c' });
    const { fixture, text } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verify,
    });
    await render(fixture);
    expect(text()).toContain('No se ha podido comprobar');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).not.toContain('Acceso confirmado');

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.includes('Comprobar de nuevo'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Acceso confirmado');
    expect(text()).not.toContain('No se ha podido comprobar');
  });

  it('paid sin derecho o pedido ajeno no muestran acceso aunque la URL diga success', async () => {
    for (const verification of [{ kind: 'notavailable' } as CheckoutVerification]) {
      const { fixture, text } = setupCheckout({
        query: { checkout: 'success', order_id: order },
        verification,
      });
      await render(fixture);
      expect(text()).toContain('No hay acceso disponible');
      expect(text()).not.toContain('Acceso confirmado');
    }
  });

  it('cambio de identidad o de query descarta pedido, temporizadores y respuesta tardía', async () => {
    let resolveOld!: (value: CheckoutVerification) => void;
    const old = new Promise<CheckoutVerification>((resolve) => { resolveOld = resolve; });
    const verify = vi.fn()
      .mockImplementationOnce(() => old)
      .mockResolvedValueOnce({ kind: 'confirmed', courseId: 'new' })
      .mockResolvedValue({ kind: 'pending' });
    const session = signal<{ user: { id: string } }>({ user: { id: 'a' } });
    const load = vi.fn((id: string) => Promise.resolve(id === 'a'
      ? library([card('old', { title: 'Privado anterior' })])
      : library([card('new', { title: 'Nuevo curso' })])));
    const { fixture, text, scheduler } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verify,
      session,
      load,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    session.set({ user: { id: 'b' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[1]).toEqual([order, 'b']);

    resolveOld({ kind: 'confirmed', courseId: 'old' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).not.toContain('Privado anterior');
    expect(text()).toContain('Acceso confirmado');

    const pending = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'pending' },
    });
    await render(pending.fixture);
    expect(pending.verify.mock.calls[0][0]).toBe(order);
    pending.params.next(convertToParamMap({ checkout: 'success', order_id: otherOrder }));
    pending.fixture.detectChanges();
    await pending.fixture.whenStable();
    pending.fixture.detectChanges();
    expect(pending.verify).toHaveBeenCalledTimes(2);
    expect(pending.verify.mock.calls[1][0]).toBe(otherOrder);
    expect(pending.scheduler.cancel).toHaveBeenCalled();
  });

  it('destruir el componente cancela el temporizador y descarta reintentos', async () => {
    const { fixture, verify, scheduler, fire } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'pending' },
    });
    await render(fixture);
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);

    fixture.destroy();
    expect(scheduler.cancel).toHaveBeenCalledTimes(1);
    const before = verify.mock.calls.length;
    fire();
    await Promise.resolve();
    expect(verify).toHaveBeenCalledTimes(before);
  });
});

describe('MisCursos — biblioteca en rejilla', () => {
  it('ordena aviso de retorno, título, resumen global y rejilla con un solo h1', async () => {
    const { fixture, verify, text } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'confirmed', courseId: 'c' },
    });
    await render(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const sections = Array.from(root.querySelectorAll('.library__banner, h1, .library__summary, ul.cards'))
      .map((node) => node.classList.contains('library__banner') ? 'banner'
        : node.tagName === 'H1' ? 'h1'
        : node.classList.contains('library__summary') ? 'summary' : 'cards');
    expect(sections).toEqual(['banner', 'h1', 'summary', 'cards']);
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelectorAll('ul.cards > li.course-card')).toHaveLength(1);
    expect(verify).toHaveBeenCalledWith(order, 'u');
    expect(text()).toContain('Acceso confirmado');
    expect(root.querySelector('.library__summary-track')?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('cada tarjeta lleva visual decorativo sin precio, progreso real y CTA coherentes', async () => {
    const courses = [
      card('a', { title: 'Curso A', summary: 'Resumen A', total: 4, completed: 1, percent: 25, resume: 'leccion-a' }),
      card('b', { title: 'Curso B', summary: null, total: 0, completed: 0, percent: 0, resume: null }),
    ];
    const { fixture } = setup({ load: vi.fn().mockResolvedValue(library(courses)) });
    await render(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const cards = Array.from(root.querySelectorAll('ul.cards > li.course-card'));
    expect(cards).toHaveLength(2);

    for (const element of cards) {
      const visual = element.querySelector('.course-card__visual');
      expect(visual).not.toBeNull();
      expect(visual?.getAttribute('aria-hidden')).toBe('true');
      expect(visual?.querySelectorAll('.course-card__shape').length ?? 0).toBeGreaterThan(0);
      expect(element.querySelector('h2.course-card__title')).not.toBeNull();
      expect(element.textContent ?? '').not.toMatch(/[€$]|\b(?:precio|precios|price|EUR|USD)\b/i);
    }

    expect(cards[0].textContent).toContain('Resumen A');
    expect(cards[0].querySelector('progress')?.getAttribute('aria-label')).toBe('Progreso de Curso A');
    expect(cards[0].querySelector('.action--primary')?.getAttribute('href')).toBe('/aula/a/leccion-a');
    expect(cards[0].querySelector('.action--secondary')?.getAttribute('href')).toBe('/cursos/a');
    expect(cards[1].textContent).toContain('0/0 · Sin lecciones publicadas');
    expect(cards[1].querySelector('.action--primary')).toBeNull();
    expect(cards[1].querySelector('.action--secondary')?.getAttribute('href')).toBe('/cursos/b');
  });

  it('el resumen global agrega solo cifras de la biblioteca cargada', async () => {
    const courses = [
      card('a', { total: 2, completed: 1, percent: 50 }),
      card('b', { total: 4, completed: 3, percent: 75 }),
    ];
    const { fixture, text } = setup({ load: vi.fn().mockResolvedValue(library(courses)) });
    await render(fixture);
    expect(text()).toContain('4/6 lecciones completadas (67 %)');
    expect(text()).toContain('en 2 cursos');
  });

  it('checkout=cancelled avisa sin consultar pedidos ni conceder acceso', async () => {
    const { fixture, verify, load, text } = setupCheckout({ query: { checkout: 'cancelled' } });
    await render(fixture);
    expect(verify).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('.library__banner')).not.toBeNull();
    expect(text()).toContain('Has cancelado el pago');
    expect(text()).not.toContain('Acceso confirmado');
  });

  it('al cerrar sesión desaparecen el aviso de pago y los datos de la cuenta anterior', async () => {
    const status = signal('authenticated');
    const session = signal<{ user: { id: string } }>({ user: { id: 'u' } });
    const { fixture, text } = setupCheckout({
      query: { checkout: 'success', order_id: order },
      verification: { kind: 'confirmed', courseId: 'c' },
      status,
      session,
    });
    await render(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Acceso confirmado');

    status.set('anonymous');
    session.set(null as unknown as { user: { id: string } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.library__banner')).toBeNull();
    expect(text()).not.toContain('Acceso confirmado');
    expect(text()).not.toContain('Curso c');
    expect(text()).toContain('Inicia sesión');
  });

  it('declara las clases de foco y rejilla que aplican el SCSS responsive', async () => {
    const { fixture } = setup({ load: vi.fn().mockResolvedValue(library([card('c')])) });
    await render(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('article.library')).not.toBeNull();
    expect(root.querySelector('ul.cards')).not.toBeNull();
    expect(root.querySelector('.course-card__visual')).not.toBeNull();
    const actions = Array.from(root.querySelectorAll('a.action'));
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action.classList.contains('action')).toBe(true);
      expect(action.getAttribute('href')).toMatch(/^\/(aula|cursos)\//);
    }
    expect(root.querySelector('.library__summary-track')?.getAttribute('role')).toBe('progressbar');
    expect(root.querySelector('.library__banner')).toBeNull();
  });

  it('gobierna la biblioteca con tokens geométricos de tema sin perder 16:9 ni el ancho de tarjeta', () => {
    const styles = readFileSync('src/app/features/mis-cursos/mis-cursos.scss', 'utf8');
    for (const token of ['--content-max-width', '--section-gap', '--grid-gap', '--card-pad', '--card-gap', '--border-width', '--radius-md']) {
      expect(styles).toContain(`var(${token}`);
    }
    expect(styles).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(styles).toContain('max-width: 330px');
    expect(styles).not.toContain('--lib-gap:');
  });

  it('el resumen no es una card: espacio y línea fina, sin caja ni radio', () => {
    const styles = readFileSync('src/app/features/mis-cursos/mis-cursos.scss', 'utf8');
    const summary = styles.match(/\.library__summary\s*\{[^}]*\}/)?.[0] ?? '';
    expect(summary).toContain('border-top: var(--border-width) solid var(--border)');
    expect(summary).not.toContain('background: var(--surface)');
    expect(summary).not.toContain('border-radius');
    const notice = styles.match(/\.notice\s*\{[^}]*\}/)?.[0] ?? '';
    expect(notice).toContain('background: var(--surface)');
  });
});
