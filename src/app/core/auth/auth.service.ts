import { DOCUMENT } from '@angular/common';
import {
  Injectable,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { EmailOtpType, Session, SupabaseClient } from '@supabase/supabase-js';

import {
  SUPABASE_CONFIG,
  isSupabaseConfigComplete,
} from '../../../environments/supabase-config';
import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import { authErrorMessage } from './auth-errors';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'unconfigured';

export interface AuthResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly needsEmailConfirmation?: boolean;
}

export const AUTH_CONFIG_MISSING_MESSAGE =
  'La autenticación aún no está configurada en esta instalación. No hay cuentas activas.';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly client: SupabaseClient | null = inject(SUPABASE_CLIENT);
  private readonly configProblem = !isSupabaseConfigComplete(
    inject(SUPABASE_CONFIG),
  );
  private readonly document = inject(DOCUMENT);

  private readonly _session = signal<Session | null>(null);
  private readonly _initialized = signal(false);
  private readonly _isAdmin = signal(false);
  private readonly _error = signal<string | null>(null);

  private readonly initialization: Promise<void>;
  private roleRequest = 0;
  private roleLoadedFor: string | null = null;
  private rolePromise: Promise<void> | null = null;
  private roleResolve: (() => void) | null = null;
  private roleTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  readonly session = this._session.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly isAdmin = this._isAdmin.asReadonly();
  readonly error = this._error.asReadonly();
  readonly configurationPending = computed(() => this.configProblem);
  readonly loading = computed(() => !this._initialized());
  readonly status = computed<AuthStatus>(() => {
    if (!this._initialized()) {
      return 'loading';
    }

    if (this.configProblem) {
      return 'unconfigured';
    }

    return this._session() ? 'authenticated' : 'anonymous';
  });

  constructor() {
    this.initialization = this.initialize();
  }

  /** Espera a que se restaure la sesión; evita carreras en los guards. */
  whenInitialized(): Promise<void> {
    return this.initialization;
  }

  /** Espera a que termine la consulta del rol admin de la sesión actual. */
  whenRoleResolved(): Promise<void> {
    return this.rolePromise ?? Promise.resolve();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancelRoleTimer();
    this.resolveRoleWaiters();
    this.rolePromise = null;
  }

  async register(email: string, password: string): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: this.callbackUrl('/auth/cuenta-confirmada'),
      },
    });

    if (error) {
      return this.failure(error);
    }

    if (data.session) {
      this.applySession(data.session);
      return { ok: true, needsEmailConfirmation: false };
    }

    return { ok: true, needsEmailConfirmation: true };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return this.failure(error);
    }

    this.applySession(data.session ?? null);
    return { ok: true };
  }

  async logout(): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { error } = await this.client.auth.signOut();

    if (error) {
      return this.failure(error);
    }

    this.applySession(null);
    return { ok: true };
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: this.callbackUrl('/auth/actualizar-contrasena'),
    });

    if (error) {
      const message = authErrorMessage(error);

      if (message.startsWith('Demasiados intentos')) {
        this._error.set(message);
        return { ok: false, message };
      }

      // No se revela si el correo existe: solicitar recuperación es una acción
      // genérica aunque la respuesta técnica sea un error.
      return {
        ok: true,
        message:
          'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña. Revisa también la carpeta de spam.',
      };
    }

    return {
      ok: true,
      message:
        'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña. Revisa también la carpeta de spam.',
    };
  }

  async updatePassword(password: string): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { error } = await this.client.auth.updateUser({ password });

    if (error) {
      return this.failure(error);
    }

    return { ok: true };
  }

  /** Canjea el código PKCE del enlace de correo. Nunca se registra el código. */
  async completeEmailLink(code: string): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);

    if (error) {
      return this.failure(error);
    }

    return this.applyLinkSession(data.session);
  }

  /**
   * Algunas plantillas de correo entregan `token_hash` en vez de `code`.
   * Se verifica con el tipo OT esperado y se limpia igual que en el código.
   */
  async completeEmailOtpLink(
    tokenHash: string,
    type: EmailOtpType,
  ): Promise<AuthResult> {
    if (!this.client) {
      return this.missingConfiguration();
    }

    this._error.set(null);
    const { data, error } = await this.client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return this.failure(error);
    }

    return this.applyLinkSession(data.session);
  }

  private applyLinkSession(linkSession: Session | null): AuthResult {
    if (!linkSession) {
      const message =
        'No se pudo iniciar la sesión desde el enlace. Solicita uno nuevo.';
      this._error.set(message);
      return { ok: false, message };
    }

    this.applySession(linkSession);
    return { ok: true };
  }

  clearError(): void {
    this._error.set(null);
  }

  private async initialize(): Promise<void> {
    if (!this.client) {
      this._initialized.set(true);
      return;
    }

    try {
      const { data } = this.client.auth.onAuthStateChange(
        (_event, session) => {
          // El callback solo actualiza estado ligero. La consulta a PostgREST
          // se difiere a una macrotarea para no bloquear el lock de Auth.
          this.applySession(session);
        },
      );

      // La suscripción vive mientras viva la aplicación; es un servicio root.
      void data.subscription;

      const { data: sessionData, error } = await this.client.auth.getSession();

      if (error) {
        this._error.set(authErrorMessage(error));
      }

      this.applySession(sessionData.session ?? null);
    } catch (error) {
      this._error.set(authErrorMessage(error));
      this.applySession(null);
    } finally {
      this._initialized.set(true);
    }
  }

  private applySession(session: Session | null): void {
    this._session.set(session);

    if (!session) {
      this.invalidateRoleWork();
      this.roleLoadedFor = null;
      this._isAdmin.set(false);
      return;
    }

    const userId = session.user.id;

    // TOKEN_REFRESHED y USER_UPDATED mantienen el mismo usuario: no repetir
    // consulta ni descartar una respuesta todavía válida.
    if (this.roleLoadedFor === userId) {
      return;
    }

    this.invalidateRoleWork();
    this.roleLoadedFor = userId;
    this._isAdmin.set(false);
    this.roleRequest += 1;
    const request = this.roleRequest;

    let resolve!: () => void;
    this.rolePromise = new Promise<void>((done) => {
      resolve = done;
    });
    this.roleResolve = resolve;
    this.scheduleRoleLoad(userId, request, resolve);
  }

  private invalidateRoleWork(): void {
    this.cancelRoleTimer();
    this.roleRequest += 1;
    this.resolveRoleWaiters();
    this.rolePromise = null;
  }

  private cancelRoleTimer(): void {
    if (this.roleTimer !== null) {
      clearTimeout(this.roleTimer);
      this.roleTimer = null;
    }
  }

  private resolveRoleWaiters(): void {
    const resolve = this.roleResolve;
    this.roleResolve = null;
    resolve?.();
  }

  private scheduleRoleLoad(
    userId: string,
    request: number,
    resolve: () => void,
  ): void {
    this.roleTimer = setTimeout(() => {
      this.roleTimer = null;

      if (this.destroyed || request !== this.roleRequest) {
        return;
      }

      void this.loadAdminRole(userId, request, resolve);
    }, 0);
  }

  private async loadAdminRole(
    userId: string,
    request: number,
    resolve: () => void,
  ): Promise<void> {
    let isAdmin = false;

    if (this.client && !this.destroyed && request === this.roleRequest) {
      try {
        const { data, error } = await this.client
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();

        isAdmin = !error && data?.role === 'admin';
      } catch {
        isAdmin = false;
      }
    }

    if (!this.destroyed && request === this.roleRequest) {
      this._isAdmin.set(isAdmin);
    }

    if (this.roleResolve === resolve) {
      this.roleResolve = null;
      resolve();
    }
  }

  private callbackUrl(nextPath: string): string {
    const url = new URL('auth/callback', this.document.baseURI);
    url.searchParams.set('next', nextPath);
    return url.toString();
  }

  private failure(error: unknown): AuthResult {
    const message = authErrorMessage(error);
    this._error.set(message);
    return { ok: false, message };
  }

  private missingConfiguration(): AuthResult {
    this._error.set(AUTH_CONFIG_MISSING_MESSAGE);
    return { ok: false, message: AUTH_CONFIG_MISSING_MESSAGE };
  }
}
