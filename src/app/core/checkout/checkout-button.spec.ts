import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SUPABASE_CONFIG } from '../../../environments/supabase-config';
import { AuthService } from '../auth/auth.service';
import { CHECKOUT_NAVIGATOR } from './checkout';
import { CheckoutButton } from './checkout-button';
import { CheckoutService } from './checkout.service';

const COURSE = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_a1b2#fidkdWxOYHwn';

function setup(options: {
  enabled?: boolean;
  status?: string;
  user?: string | null;
  accessState?: string;
  mode?: 'buy' | 'link';
  start?: ReturnType<typeof vi.fn>;
} = {}) {
  const status = signal(options.status ?? 'authenticated');
  const session = signal(options.user === null ? null : { user: { id: options.user ?? USER } });
  const start = options.start ?? vi.fn().mockResolvedValue({ kind: 'ok', url: CHECKOUT_URL });
  const discardRecovery = vi.fn();
  const cancelPending = vi.fn();
  const go = vi.fn();

  TestBed.configureTestingModule({
    imports: [CheckoutButton],
    providers: [
      provideRouter([]),
      {
        provide: SUPABASE_CONFIG,
        useValue: { url: '', publishableKey: '', checkoutTestEnabled: options.enabled ?? true },
      },
      { provide: AuthService, useValue: { status, session } },
      { provide: CheckoutService, useValue: { start, discardRecovery, cancelPending } },
      { provide: CHECKOUT_NAVIGATOR, useValue: { go } },
    ],
  });

  const fixture = TestBed.createComponent(CheckoutButton);
  fixture.componentRef.setInput('courseId', COURSE);
  fixture.componentRef.setInput('courseSlug', 'ejemplo');
  fixture.componentRef.setInput('accessState', options.accessState ?? 'none');
  fixture.componentRef.setInput('mode', options.mode ?? 'buy');
  fixture.detectChanges();

  const root = () => fixture.nativeElement as HTMLElement;
  return { fixture, root, status, session, start, discardRecovery, cancelPending, go, text: () => root().textContent ?? '' };
}

async function clickBuy(fixture: ComponentFixture<CheckoutButton>): Promise<void> {
  const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.buy');
  expect(button).not.toBeNull();
  button!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Botón de compra TEST', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('con el flag apagado no muestra nada ni llama al servicio', () => {
    const { text, start } = setup({ enabled: false });
    expect(text()).not.toContain('Modo de prueba');
    expect(text()).not.toContain('Comprar');
    expect(start).not.toHaveBeenCalled();
  });

  it('anónimo: aviso de prueba y login real con returnUrl relativo, sin pagar', () => {
    const { root, text, start, go } = setup({
      status: 'anonymous', user: null, accessState: 'anonymous',
    });
    expect(text()).toContain('Modo de prueba — no se realizan cobros reales');
    expect(text()).toContain('Iniciar sesión para comprar');
    expect(root().querySelector('button.buy')).toBeNull();
    const href = root().querySelector('a.buy')?.getAttribute('href') ?? '';
    expect(new URL(href, 'https://interno.test').searchParams.get('returnUrl')).toBe('/cursos/ejemplo');
    expect(start).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it('sin acceso y autenticado: aviso y botón; navega solo tras el clic y la respuesta válida', async () => {
    const { fixture, text, start, go } = setup();
    expect(go).not.toHaveBeenCalled();
    expect(fixture.componentInstance.starting()).toBe(false);
    expect(text()).toContain('Modo de prueba — no se realizan cobros reales');
    await clickBuy(fixture);
    expect(start).toHaveBeenCalledWith(COURSE, USER);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it('el doble clic no duplica la petición ni la redirección', async () => {
    const { root, fixture, start, go } = setup();
    const button = root().querySelector<HTMLButtonElement>('button.buy')!;
    button.click();
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(start).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('el reintento explícito vuelve a pedir el mismo intento y solo navega si éxito', async () => {
    const start = vi.fn()
      .mockResolvedValueOnce({ kind: 'failure', failure: { code: 'network', retryable: true } })
      .mockResolvedValueOnce({ kind: 'ok', url: CHECKOUT_URL });
    const { fixture, root, text, go } = setup({ start });

    await clickBuy(fixture);
    expect(go).not.toHaveBeenCalled();
    expect(text()).toContain('Reintentar');

    const retry = Array.from(root().querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar');
    expect(retry).toBeDefined();
    retry!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith(COURSE, USER);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(CHECKOUT_URL);
  });

  it('409 no ofrece reintento y nunca finge un pago', async () => {
    const start = vi.fn().mockResolvedValue({
      kind: 'failure', failure: { code: 'unavailable', retryable: false },
    });
    const { fixture, text, go } = setup({ start });
    await clickBuy(fixture);
    expect(text()).toContain('La compra no está disponible en este momento.');
    expect(text()).not.toContain('Reintentar');
    expect(go).not.toHaveBeenCalled();
  });

  it('una respuesta inválida no redirige y muestra un error controlado', async () => {
    const start = vi.fn().mockResolvedValue({
      kind: 'failure', failure: { code: 'unknown', retryable: true },
    });
    const { fixture, text, go } = setup({ start });
    await clickBuy(fixture);
    expect(text()).toContain('No se pudo iniciar la compra');
    expect(go).not.toHaveBeenCalled();
  });

  it('cerrar sesión mientras se espera la respuesta descarta la redirección', async () => {
    let resolve!: (value: unknown) => void;
    const start = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const { fixture, status, session, go, cancelPending } = setup({ start });

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.buy')!;
    button.click();
    fixture.detectChanges();

    status.set('anonymous');
    session.set(null);
    fixture.componentRef.setInput('accessState', 'anonymous');
    fixture.detectChanges();
    await fixture.whenStable();

    resolve({ kind: 'ok', url: CHECKOUT_URL });
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancelPending).toHaveBeenCalledWith(COURSE, USER);
    expect(go).not.toHaveBeenCalled();
  });

  it('destruir el componente cancela la petición en vuelo sin navegar', async () => {
    let resolve!: (value: unknown) => void;
    const start = vi.fn().mockReturnValue(new Promise((done) => { resolve = done; }));
    const { fixture, go, cancelPending } = setup({ start });
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.buy')!;
    button.click();
    fixture.detectChanges();
    fixture.destroy();
    resolve({ kind: 'ok', url: CHECKOUT_URL });
    await fixture.whenStable();
    expect(start).toHaveBeenCalledOnce();
    expect(cancelPending).toHaveBeenCalledWith(COURSE, USER);
    expect(go).not.toHaveBeenCalled();
  });

  it('con acceso concedido o revocado no ofrece recompra', () => {
    for (const accessState of ['granted', 'revoked', 'checking', 'error']) {
      TestBed.resetTestingModule();
      const { text, start } = setup({ accessState });
      expect(text()).not.toContain('Comprar');
      expect(start).not.toHaveBeenCalled();
    }
  });

  it('estado no verificable: mensaje claro y reintento con el mismo intento', async () => {
    const start = vi.fn()
      .mockResolvedValueOnce({ kind: 'failure', failure: { code: 'status-unknown', retryable: true } })
      .mockResolvedValueOnce({ kind: 'ok', url: CHECKOUT_URL });
    const { fixture, root, text, go } = setup({ start });

    await clickBuy(fixture);
    expect(text()).toContain('No se pudo confirmar el estado de la sesión en Stripe');
    const retry = Array.from(root().querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Reintentar');
    expect(retry).toBeDefined();
    retry!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith(COURSE, USER);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('cambiar de cuenta descarta la marca del dueño anterior antes de navegar', () => {
    const { discardRecovery, cancelPending, status, session, fixture } = setup();
    discardRecovery.mockClear(); // los inputs iniciales estabilizan la identidad
    cancelPending.mockClear();
    expect(discardRecovery).not.toHaveBeenCalled();
    status.set('anonymous');
    session.set(null);
    fixture.componentRef.setInput('accessState', 'anonymous');
    fixture.detectChanges();
    expect(cancelPending).toHaveBeenCalledWith(COURSE, USER);
    expect(discardRecovery).toHaveBeenCalledWith(COURSE, USER);
  });

  it('modo catálogo: un enlace a la ficha con intención, sin compra directa', () => {
    const { root, text, start, go } = setup({ mode: 'link' });
    expect(text()).toContain('Comprar — modo prueba');
    expect(text()).not.toContain('Modo de prueba — no se realizan cobros reales');
    const href = root().querySelector('a.buy')?.getAttribute('href') ?? '';
    const parsed = new URL(href, 'https://interno.test');
    expect(parsed.pathname).toBe('/cursos/ejemplo');
    expect(parsed.searchParams.get('comprar')).toBe('1');
    expect(start).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });
});
