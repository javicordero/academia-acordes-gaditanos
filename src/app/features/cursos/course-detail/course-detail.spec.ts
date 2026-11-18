import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
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
} = {}) {
  const status = signal(options.status ?? 'anonymous');
  const session = signal<{ user: { id: string } } | null>(options.session ?? null);
  const access = vi.fn(options.access ?? (async () => 'none'));
  const repository = { detail: vi.fn().mockResolvedValue(detail), access };
  const auth = { status, session, isAdmin: signal(options.isAdmin ?? false) };
  TestBed.configureTestingModule({ providers: [
    provideRouter([{ path: 'cursos/:slug', component: CourseDetail }]),
    { provide: AuthService, useValue: auth },
    { provide: PublicCoursesRepository, useValue: repository },
  ] });
  return { status, session, access, repository };
}

async function open(): Promise<{ harness: RouterTestingHarness; text: () => string }> {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/cursos/ejemplo', CourseDetail);
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
});
