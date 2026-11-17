import { TestBed } from '@angular/core/testing';
import { Session, SupabaseClient } from '@supabase/supabase-js';

import {
  SUPABASE_CONFIG,
  SupabaseConfig,
} from '../../../environments/supabase-config';
import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import { AUTH_CONFIG_MISSING_MESSAGE, AuthService } from './auth.service';

const configured: SupabaseConfig = {
  url: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_test_only',
};

const session = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alumno@example.test',
  },
} as unknown as Session;

interface FakeClientOptions {
  session?: Session | null;
  role?: string | null;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function createFakeClient(options: FakeClientOptions = {}) {
  const captured: {
    callback: ((event: string, nextSession: Session | null) => void) | null;
  } = { callback: null };
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({
    data: options.role ? { role: options.role } : null,
    error: null,
  });

  const auth = {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { session: options.session ?? null }, error: null }),
    onAuthStateChange: vi.fn(
      (callback: (event: string, nextSession: Session | null) => void) => {
        captured.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    ),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: options.session ?? null },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: { id: session.user.id }, session: null },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({
      data: { session: options.session ?? null },
      error: null,
    }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session: options.session ?? null },
      error: null,
    }),
  };

  const client = { auth, from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return {
    client,
    auth,
    builder,
    emit(event: string, nextSession: Session | null): void {
      captured.callback?.(event, nextSession);
    },
  };
}

function createService(
  client: SupabaseClient | null,
  config: SupabaseConfig = configured,
): AuthService {
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE_CLIENT, useValue: client },
      { provide: SUPABASE_CONFIG, useValue: config },
    ],
  });

  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('informa de la configuración pendiente y no simula acceso', async () => {
    const service = createService(null, {
      url: '',
      publishableKey: '',
    });

    await service.whenInitialized();

    expect(service.configurationPending()).toBe(true);
    expect(service.status()).toBe('unconfigured');
    expect(service.session()).toBeNull();
    expect(await service.login('alumno@example.test', 'clave')).toEqual({
      ok: false,
      message: AUTH_CONFIG_MISSING_MESSAGE,
    });
  });

  it('permanece cargando hasta que se restaura la sesión', async () => {
    const { client, auth } = createFakeClient();
    const deferred: { resolve: ((value: unknown) => void) | null } = {
      resolve: null,
    };
    auth.getSession.mockReturnValue(
      new Promise((resolve) => {
        deferred.resolve = resolve;
      }),
    );

    const service = createService(client);
    const initialized = service.whenInitialized();
    let resolved = false;
    void initialized.then(() => {
      resolved = true;
    });

    expect(service.loading()).toBe(true);
    expect(resolved).toBe(false);

    deferred.resolve?.({ data: { session: null }, error: null });
    await initialized;

    expect(service.loading()).toBe(false);
    expect(service.status()).toBe('anonymous');
  });

  it('restaura la sesión y consulta el rol propio en user_roles', async () => {
    const { client, builder } = createFakeClient({ session, role: 'admin' });
    const service = createService(client);

    await service.whenInitialized();
    await service.whenRoleResolved();

    expect(service.status()).toBe('authenticated');
    expect(service.isAdmin()).toBe(true);
    expect(builder.select).toHaveBeenCalledWith('role');
    expect(builder.eq).toHaveBeenCalledWith('user_id', session.user.id);
    expect(builder.eq).toHaveBeenCalledWith('role', 'admin');
  });

  it('no concede rol admin cuando no hay fila propia', async () => {
    const { client } = createFakeClient({ session, role: null });
    const service = createService(client);

    await service.whenInitialized();
    await service.whenRoleResolved();

    expect(service.session()).not.toBeNull();
    expect(service.isAdmin()).toBe(false);
  });

  it('informa de la confirmación por correo sin inventar una sesión', async () => {
    const { client, auth } = createFakeClient();
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.register('alumno@example.test', 'clave');

    expect(result.ok).toBe(true);
    expect(result.needsEmailConfirmation).toBe(true);
    expect(service.session()).toBeNull();
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alumno@example.test',
        options: {
          emailRedirectTo: expect.stringContaining('/auth/callback'),
        },
      }),
    );
  });

  it('traduce credenciales incorrectas sin filtrar identidades', async () => {
    const { client, auth } = createFakeClient();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'invalid_credentials' },
    });
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.login('alumno@example.test', 'clave-incorrecta');

    expect(result).toEqual({
      ok: false,
      message: 'Correo o contraseña incorrectos.',
    });
    expect(service.error()).toBe('Correo o contraseña incorrectos.');
  });

  it('mantiene la respuesta genérica si el correo no existe', async () => {
    const { client, auth } = createFakeClient();
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: { code: 'user_not_found', message: 'User not found' },
    });
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.requestPasswordReset('alumno@example.test');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Si existe una cuenta');
    expect(result.message).not.toContain('User not found');
  });

  it('informa del límite de envío de correo', async () => {
    const { client, auth } = createFakeClient();
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit' },
    });
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.requestPasswordReset('alumno@example.test');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Demasiados intentos');
  });

  it('canjea el código PKCE del enlace de correo', async () => {
    const { client, auth } = createFakeClient({ session });
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.completeEmailLink('codigo-de-prueba');

    expect(result.ok).toBe(true);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('codigo-de-prueba');
    expect(service.session()).not.toBeNull();
  });

  it('verifica un enlace de correo que entrega token_hash', async () => {
    const { client, auth } = createFakeClient({ session });
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.completeEmailOtpLink('hash-de-prueba', 'signup');

    expect(result.ok).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-de-prueba',
      type: 'signup',
    });
    expect(service.session()).not.toBeNull();
  });

  it('no consulta PostgREST dentro del callback de Auth', async () => {
    const { client, builder, emit } = createFakeClient({ role: 'admin' });
    const service = createService(client);
    await service.whenInitialized();

    expect(builder.select).not.toHaveBeenCalled();

    emit('SIGNED_IN', session);

    // Solo estado ligero dentro del callback; la API se llama después.
    expect(service.session()).not.toBeNull();
    expect(builder.select).not.toHaveBeenCalled();

    await service.whenRoleResolved();

    expect(builder.select).toHaveBeenCalledWith('role');
    expect(service.isAdmin()).toBe(true);
  });

  it('no repite la consulta de rol en TOKEN_REFRESHED del mismo usuario', async () => {
    const { client, builder, emit } = createFakeClient({
      session,
      role: 'admin',
    });
    const service = createService(client);
    await service.whenInitialized();
    await service.whenRoleResolved();

    const calls = builder.select.mock.calls.length;
    const refreshed = {
      ...session,
      access_token: 'token-refrescado',
    } as Session;

    emit('TOKEN_REFRESHED', refreshed);
    await tick();

    expect(builder.select).toHaveBeenCalledTimes(calls);
    expect(service.session()?.access_token).toBe('token-refrescado');
    expect(service.isAdmin()).toBe(true);
  });

  it('descarta una respuesta obsoleta cuando cambia de usuario', async () => {
    const oldRole: { resolve: ((value: unknown) => void) | null } = {
      resolve: null,
    };
    const { client, builder, emit } = createFakeClient({
      session,
      role: 'admin',
    });
    builder.maybeSingle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldRole.resolve = resolve;
        }),
    );

    const service = createService(client);
    await service.whenInitialized();
    await tick();

    const otherSession = {
      ...session,
      user: {
        ...session.user,
        id: '22222222-2222-4222-8222-222222222222',
      },
    } as Session;

    emit('USER_CHANGED', otherSession);
    expect(service.isAdmin()).toBe(false);

    await service.whenRoleResolved();

    expect(builder.eq).toHaveBeenCalledWith('user_id', otherSession.user.id);
    expect(service.isAdmin()).toBe(true);

    oldRole.resolve?.({ data: { role: 'admin' }, error: null });
    await tick();

    expect(service.isAdmin()).toBe(true);
  });

  it('cancela la consulta pendiente al cerrar sesión', async () => {
    const { client, builder, emit } = createFakeClient({
      session,
      role: 'admin',
    });
    builder.maybeSingle.mockImplementationOnce(() => new Promise(() => {}));

    const service = createService(client);
    await service.whenInitialized();
    await tick();
    const calls = builder.select.mock.calls.length;

    emit('SIGNED_OUT', null);
    await service.whenRoleResolved();
    await tick();

    expect(builder.select).toHaveBeenCalledTimes(calls);
    expect(service.session()).toBeNull();
    expect(service.isAdmin()).toBe(false);
  });

  it('registra el error al restaurar la sesión', async () => {
    const { client, auth } = createFakeClient();
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'session_not_found' },
    });

    const service = createService(client);
    await service.whenInitialized();

    expect(service.error()).toContain('sesión ha caducado');
    expect(service.status()).toBe('anonymous');
  });

  it('informa de un OT de correo fallido', async () => {
    const { client, auth } = createFakeClient();
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: 'otp_expired' },
    });

    const service = createService(client);
    await service.whenInitialized();

    const result = await service.completeEmailOtpLink('hash-caducado', 'recovery');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('caducado');
    expect(service.session()).toBeNull();
  });

  it('rechaza un enlace que no devuelve sesión', async () => {
    const { client } = createFakeClient();
    const service = createService(client);
    await service.whenInitialized();

    const result = await service.completeEmailLink('codigo-sin-sesion');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('No se pudo iniciar la sesión');
    expect(service.session()).toBeNull();
  });

  it('no deja timers pendientes al destruir el servicio', async () => {
    const { client, builder } = createFakeClient({ session, role: 'admin' });
    const service = createService(client);
    await service.whenInitialized();
    const roleReady = service.whenRoleResolved();

    service.ngOnDestroy();
    await roleReady;
    await tick();

    expect(builder.select).not.toHaveBeenCalled();
  });

  it('cierra la sesión y limpia el rol admin', async () => {
    const { client } = createFakeClient({ session, role: 'admin' });
    const service = createService(client);
    await service.whenInitialized();
    await service.whenRoleResolved();

    const result = await service.logout();

    expect(result.ok).toBe(true);
    expect(service.session()).toBeNull();
    expect(service.isAdmin()).toBe(false);
    expect(service.status()).toBe('anonymous');
  });
});
