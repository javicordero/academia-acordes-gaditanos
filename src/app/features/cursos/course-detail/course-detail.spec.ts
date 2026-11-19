import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { AuthService } from '../../../core/auth/auth.service';
import { CheckoutService } from '../../../core/checkout/checkout.service';
import { PublicCoursesRepository } from '../public-courses-repository';
import { CourseDetail } from './course-detail';

const detail = {
  course: { id: 'c1', slug: 'ejemplo', title: 'Curso ejemplo', level: 'basico', description: '\u003cimg src=x\u003e', summary: null },
  sections: [{ id: 's', title: 'Bloque', summary: null }],
  lessons: [
    { id: 'l1', section_id: 's', slug: 'muestra', title: 'Muestra', is_free_preview: true },
    { id: 'l2', section_id: 's', slug: 'comprada', title: 'Comprada', is_free_preview: false },
  ],
};

function setup(options: {
  status?: string;
  session?: { user: { id: string } } | null;
  access?: (courseId: string, userId: string) => Promise<'granted' | 'revoked' | 'none'>;
  isAdmin?: boolean;
  checkoutEnabled?: boolean;
} = {}) {
  const status = signal(options.status ?? 'anonymous');
  const session = signal<{ user: { id: string } } | null>(options.session ?? null);
  const access = vi.fn(options.access ?? (async () => 'none'));
  const repository = { detail: vi.fn().mockResolvedValue(detail), access };
  const auth = { status, session, isAdmin: signal(options.isAdmin ?? false) };
  const checkoutStart = vi.fn();
  TestBed.configureTestingModule({ providers: [
    provideRouter([{ path: 'cursos/:slug', component: CourseDetail }]),
    { provide: AuthService, useValue: auth },
    { provide: PublicCoursesRepository, useValue: repository },
    {
      provide: CheckoutService,
      useValue: { start: checkoutStart, discardRecovery: vi.fn(), cancelPending: vi.fn() },
    },
    { provide: SUPABASE_CONFIG, useValue: {
      url: '', publishableKey: '', checkoutTestEnabled: options.checkoutEnabled ?? false,
    } },
  ] });
  return { status, session, access, repository, checkoutStart };
}

async function open(url = '/cursos/ejemplo'): Promise<{ harness: RouterTestingHarness; text: () => string }> {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, CourseDetail);
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { harness, text: () => harness.routeNativeElement?.textContent ?? '' };
}

describe('Ficha de curso', () => {
  it('muestra el contenido como texto sin interpretar HTML', async () => {
    setup();
    const { harness, text } = await open();
    expect(harness.routeNativeElement?.querySelector('img')).toBeNull();
    expect(text()).toContain('\u003cimg src=x\u003e');
    expect(text()).toContain('Índice de las lecciones publicadas');
  });

  it('enlaza cada lección accesible con el aula usando curso y lección', async () => {
    setup();
    const { harness } = await open();
    const hrefs = Array.from(
      harness.routeNativeElement?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
    ).map((a) => a.getAttribute('href'));
    const aulaLinks = [...new Set(hrefs.filter((href) => href?.startsWith('/aula/')))];
    expect(aulaLinks).toHaveLength(2);
    for (let index = 0; index < aulaLinks.length; index++) {
      const link = aulaLinks[index];
      expect(link).toBe(['/aula/ejemplo/muestra', '/aula/ejemplo/comprada'][index]);
    }
  });

  it('muestra un esqueleto accesible mientras carga la ficha', async () => {
    const { repository } = setup();
    let resolveDetail!: (value: typeof detail) => void;
    repository.detail.mockReturnValue(new Promise(r => { resolveDetail = r; }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cursos/ejemplo', CourseDetail);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('card');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando curso');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    resolveDetail(detail);
  });

  it('anónimo: sin «Ya tienes acceso» y sin peticiones a entitlements', async () => {
    const { access } = setup({ status: 'anonymous' });
    const { text } = await open();
    expect(text()).not.toContain('Ya tienes acceso');
    expect(access).not.toHaveBeenCalled();
    expect(text()).toContain('Inicia sesión para consultar');
  });

  it('con la sesión cargando no muestra un estado anónimo falso ni consulta derechos', async () => {
    const { status, access } = setup({ status: 'loading' });
    const { harness, text } = await open();
    expect(text()).toContain('Comprobando tu sesión');
    expect(text()).not.toContain('Inicia sesión');
    expect(access).not.toHaveBeenCalled();

    status.set('anonymous');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('Inicia sesión para consultar');
    expect(access).not.toHaveBeenCalled();
  });

  it('la sesión cargando con una sesión previa espera a la identidad confirmada', async () => {
    const { status, session, access } = setup({
      status: 'loading',
      session: { user: { id: 'u1' } },
      access: async () => 'granted',
    });
    const { harness, text } = await open();
    expect(text()).toContain('Comprobando tu sesión');
    expect(access).not.toHaveBeenCalled();

    status.set('authenticated');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(access).toHaveBeenCalledWith('c1', 'u1');
    expect(text()).toContain('Ya tienes acceso a este curso');
  });

  it('autenticado sin derecho: mensaje positivo de «sin acceso», muestra explícita y sin compra', async () => {
    setup({ status: 'authenticated', session: { user: { id: 'u1' } }, access: async () => 'none' });
    const { harness, text } = await open();
    expect(text()).toContain('Todavía no tienes acceso a este curso');
    expect(text()).not.toContain('Ya tienes acceso');
    expect(text()).not.toContain('Comprar');
    expect(text()).toContain('La compra todavía no está disponible');
    expect(harness.routeNativeElement?.querySelector('a[href="/aula/ejemplo/muestra"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/aula/ejemplo/comprada"]')).not.toBeNull();
  });

  it('con derecho activo: «Ya tienes acceso», CTA a mis cursos y a la primera lección', async () => {
    const { access } = setup({ status: 'authenticated', session: { user: { id: 'u1' } }, access: async () => 'granted' });
    const { harness, text } = await open();
    expect(access).toHaveBeenCalledWith('c1', 'u1');
    expect(text()).toContain('Ya tienes acceso a este curso');
    expect(harness.routeNativeElement?.querySelector('a[href="/mis-cursos"]')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/aula/ejemplo/muestra"]')).not.toBeNull();
    expect(text()).not.toContain('Continuar');
    expect(text()).not.toContain('Comprar');
    expect(text()).toContain('La compra todavía no está disponible');
  });

  it('revocado: lo informa sin ofrecer compra ni afirmar «Ya tienes acceso»', async () => {
    setup({ status: 'authenticated', session: { user: { id: 'u1' } }, access: async () => 'revoked' });
    const { harness, text } = await open();
    expect(text()).toContain('Tu acceso a este curso no está activo');
    expect(text()).not.toContain('Ya tienes acceso');
    expect(text()).not.toContain('Comprar');
    expect(harness.routeNativeElement?.querySelector('img')).toBeNull();
  });

  it('error al consultar acceso: mensaje honesto y reintento, nunca «sin acceso» ni compra', async () => {
    let calls = 0;
    const { access } = setup({
      status: 'authenticated',
      session: { user: { id: 'u1' } },
      access: async () => {
        calls++;
        if (calls === 1) throw new Error('failed');
        return 'granted';
      },
    });
    const { harness, text } = await open();
    expect(text()).toContain('No se pudo comprobar el acceso a este curso');
    expect(text()).not.toContain('Ya tienes acceso');
    expect(text()).not.toContain('Comprar');

    (harness.routeNativeElement?.querySelector('button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(access).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Ya tienes acceso a este curso');
  });

  it('una respuesta de otra cuenta llegada tarde no concede acceso a la actual', async () => {
    const status = signal('authenticated');
    const session = signal<{ user: { id: string } } | null>({ user: { id: 'a' } });
    let slow!: (value: 'granted') => void;
    const access = vi.fn((_courseId: string, userId: string) =>
      new Promise<'granted' | 'none'>((resolve) => {
        if (userId === 'a') slow = resolve;
        else resolve('none');
      }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'cursos/:slug', component: CourseDetail }]),
      { provide: AuthService, useValue: { status, session, isAdmin: signal(false) } },
      { provide: PublicCoursesRepository, useValue: { detail: vi.fn().mockResolvedValue(detail), access } },
      { provide: SUPABASE_CONFIG, useValue: { url: '', publishableKey: '', checkoutTestEnabled: false } },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/cursos/ejemplo', CourseDetail);
    await harness.fixture.whenStable();
    harness.detectChanges();

    session.set({ user: { id: 'b' } });
    harness.detectChanges();
    await harness.fixture.whenStable();
    slow('granted');
    await Promise.resolve();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).not.toContain('Ya tienes acceso');
    expect(access).toHaveBeenCalledTimes(2);
    expect(access).toHaveBeenLastCalledWith('c1', 'b');
  });

  it('ser admin no afirma compra ni sustituye la consulta del derecho real', async () => {
    const { access } = setup({ status: 'authenticated', session: { user: { id: 'admin' } }, isAdmin: true, access: async () => 'none' });
    const { harness, text } = await open();
    expect(access).toHaveBeenCalledWith('c1', 'admin');
    expect(text()).toContain('Todavía no tienes acceso a este curso');
    expect(text()).not.toContain('Ya tienes acceso');
    expect(text()).not.toContain('Comprar');
  });

  it('un curso revocado no se presenta como propio', async () => {
    setup({ status: 'authenticated', session: { user: { id: 'u1' } }, access: async () => 'revoked' });
    const { text } = await open();
    expect(text()).toContain('Bloques y lecciones del catálogo');
    expect(text()).not.toContain('Ya tienes acceso');
    expect(text()).not.toContain('Todavía no tienes acceso');
  });

  it('cerrar sesión limpia el acceso privado anterior', async () => {
    const { status, session } = setup({
      status: 'authenticated',
      session: { user: { id: 'a' } },
      access: async () => 'granted',
    });
    const { harness, text } = await open();
    expect(text()).toContain('Ya tienes acceso');

    status.set('anonymous');
    session.set(null);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).not.toContain('Ya tienes acceso');
    expect(harness.routeNativeElement?.querySelector('a[href="/mis-cursos"]')).toBeNull();
  });

  it('flag activo y sin acceso: aviso de prueba y botón en la ficha', async () => {
    setup({
      status: 'authenticated', session: { user: { id: 'u1' } },
      access: async () => 'none', checkoutEnabled: true,
    });
    const { text } = await open();
    expect(text()).toContain('Modo de prueba — no se realizan cobros reales');
    expect(text()).toContain('Comprar — modo prueba');
    expect(text()).not.toContain('La compra todavía no está disponible');
  });

  it('flag activo y anónimo: login con returnUrl al curso, sin compra directa', async () => {
    setup({ status: 'anonymous', checkoutEnabled: true });
    const { harness, text } = await open();
    expect(text()).toContain('Modo de prueba — no se realizan cobros reales');
    expect(text()).toContain('Iniciar sesión para comprar');
    expect(text()).not.toContain('Comprar — modo prueba');
    const href = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('app-checkout-button a.buy')?.getAttribute('href') ?? '';
    expect(new URL(href, 'https://interno.test').searchParams.get('returnUrl')).toBe('/cursos/ejemplo');
  });

  it('flag activo con derecho vigente: acceso directo y ningún botón de recompra', async () => {
    setup({
      status: 'authenticated', session: { user: { id: 'u1' } },
      access: async () => 'granted', checkoutEnabled: true,
    });
    const { harness, text } = await open();
    expect(text()).toContain('Ya tienes acceso a este curso');
    expect(text()).not.toContain('Comprar');
    expect(harness.routeNativeElement?.querySelector('a[href="/mis-cursos"]')).not.toBeNull();
  });

  it('retorno de Stripe: banner honesto sin conceder acceso ni iniciar compra', async () => {
    const { access, checkoutStart } = setup({ checkoutEnabled: true });
    const { harness, text } = await open('/cursos/ejemplo?checkout=cancelled');
    expect(text()).toContain('Has vuelto de Stripe. Puedes reanudar la compra de prueba o consultar Mis cursos.');
    expect(text()).not.toContain('no se cobró');
    expect(text()).not.toContain('Ya tienes acceso a este curso');
    expect(access).not.toHaveBeenCalled();
    expect(checkoutStart).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.querySelector('.checkout-return a')?.getAttribute('href')).toBe('/mis-cursos');
  });

  it('una query forjada con checkout=success o order_id no concede nada', async () => {
    const { access, checkoutStart } = setup({ checkoutEnabled: true });
    const { text } = await open('/cursos/ejemplo?checkout=success&order_id=40000000-0000-0000-0000-000000000001');
    expect(text()).not.toContain('Has vuelto de Stripe');
    expect(text()).not.toContain('Ya tienes acceso a este curso');
    expect(access).not.toHaveBeenCalled();
    expect(checkoutStart).not.toHaveBeenCalled();
  });

  it('estructura apilada: un solo h1 y secciones en el orden previsto', async () => {
    setup();
    const { harness } = await open();
    const root = harness.routeNativeElement!.querySelector('.course-detail')!;
    expect(root.querySelectorAll('h1')).toHaveLength(1);

    const order = Array.from(root.children)
      .filter((child) => child.tagName === 'SECTION')
      .map((child) => Array.from(child.classList).find((name) => name.startsWith('section--')));
    expect(order).toEqual([
      'section--learning',
      'section--facts',
      'section--preview',
      'section--syllabus',
      'section--teacher',
      'section--faq',
      'section--final-cta',
    ]);
  });

  it('CTA duplicado: arriba y al final, con el mismo botón de compra TEST', async () => {
    setup({
      status: 'authenticated', session: { user: { id: 'u1' } },
      access: async () => 'none', checkoutEnabled: true,
    });
    const { harness } = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.cta')).toHaveLength(2);
    expect(root.querySelectorAll('app-checkout-button')).toHaveLength(2);
    expect(root.querySelector('.course-hero .cta')).not.toBeNull();
    expect(root.querySelector('.section--final-cta .cta')).not.toBeNull();
  });

  it('CTA duplicado también con la compra desactivada, sin botones falsos', async () => {
    setup();
    const { harness, text } = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelectorAll('.cta')).toHaveLength(2);
    expect(root.querySelectorAll('.cta__fallback')).toHaveLength(2);
    expect(root.querySelectorAll('app-checkout-button')).toHaveLength(0);
    expect(text()).toContain('La compra todavía no está disponible');
  });

  it('«Qué aprenderás» usa solo texto real del curso, sin beneficios inventados', async () => {
    setup();
    const { harness } = await open();
    const learning = harness.routeNativeElement!.querySelector('.section--learning')!;
    expect(learning.querySelector('h2')?.textContent).toBe('Qué aprenderás');
    expect(learning.querySelector('.description')?.textContent).toContain('\u003cimg src=x\u003e');
    expect(learning.querySelector('img')).toBeNull();
  });

  it('profesor y FAQ son espacios preparados y honestos, sin nombre, foto, bio ni preguntas inventadas', async () => {
    setup();
    const { harness } = await open();
    const root = harness.routeNativeElement!;
    const teacher = root.querySelector('.section--teacher')!;
    const faq = root.querySelector('.section--faq')!;
    expect(teacher.querySelector('h2')?.textContent).toBe('Tu profesor');
    expect(teacher.querySelector('.placeholder')?.textContent).toContain('Espacio preparado para la presentación del profesor');
    expect(teacher.querySelector('.placeholder')?.textContent).toContain('todavía no hay una ficha publicada');
    expect(teacher.querySelector('img')).toBeNull();
    expect(teacher.querySelectorAll('h3')).toHaveLength(0);
    expect(faq.querySelector('h2')?.textContent).toBe('Preguntas frecuentes');
    expect(faq.querySelector('.placeholder')?.textContent).toContain('Las preguntas frecuentes se añadirán con información definitiva');
    expect(faq.querySelector('.placeholder')?.textContent).toContain('Todavía no hay preguntas frecuentes publicadas');
  });

  it('no muestra precios, testimonios ni datos comerciales inventados', async () => {
    setup({
      status: 'authenticated', session: { user: { id: 'u1' } },
      access: async () => 'none', checkoutEnabled: true,
    });
    const { text } = await open();
    expect(text()).not.toMatch(/\d+\s*(?:€|\$|EUR|USD)\b/i);
    expect(text().toLowerCase()).not.toContain('precio');
    expect(text()).not.toContain('Testimonios');
  });

  it('muestra gratuita con columna texto/vídeo honesta y sin incrustaciones', async () => {
    setup();
    const { harness, text } = await open();
    const root = harness.routeNativeElement!;
    const card = root.querySelector('.preview-card')!;
    expect(card.querySelector('h3')?.textContent).toBe('Muestra');
    expect(card.querySelector('.preview-card__media')?.textContent).toContain('Vista previa disponible en el aula');
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('video')).toBeNull();
    expect(text()).toContain('(muestra)');
  });

  it('accesibilidad: jerarquía h2/h3, estados anunciados y sin main anidado', async () => {
    setup({
      status: 'authenticated', session: { user: { id: 'u1' } },
      access: async () => { throw new Error('failed'); },
    });
    const { harness } = await open();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('main')).toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('.access-status--error')?.getAttribute('role')).toBe('alert');
    const h3s = Array.from(root.querySelectorAll('h3'));
    expect(h3s.length).toBeGreaterThan(0);
    for (const h3 of h3s) {
      expect(h3.closest('section')?.querySelector('h2')).not.toBeNull();
    }
  });

  it('responsive por clases: rejillas de una/two columnas preparadas para 320px', async () => {
    setup();
    const { harness } = await open();
    const root = harness.routeNativeElement!;
    for (const selector of [
      '.course-hero', '.fact-cards', '.preview-grid', '.preview-card',
      '.lesson-index', '.section--final-cta',
    ]) {
      expect(root.querySelector(selector), selector).not.toBeNull();
    }
    expect(root.querySelectorAll('.lesson-index li').length).toBeGreaterThan(0);
  });

  it('gobierna secciones, tarjetas y botones con tokens geométricos de tema', () => {
    const styles = readFileSync('src/app/features/cursos/course-detail/course-detail.scss', 'utf8');
    for (const token of ['--content-max-width', '--section-gap', '--grid-gap', '--card-pad', '--card-gap', '--border-width', '--radius-md']) {
      expect(styles).toContain(`var(${token}`);
    }
    // Accesibilidad táctil: no depende del tema.
    expect(styles).toContain('min-height: 44px');
  });
});
