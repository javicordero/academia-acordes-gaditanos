import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  LibraryCourse,
  LibraryProblem,
  MisCursosRepository,
} from './mis-cursos-repository';

@Component({
  selector: 'app-mis-cursos',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mis-cursos.html',
  styleUrl: './mis-cursos.scss',
})
export class MisCursos {
  readonly auth = inject(AuthService);
  private readonly repository = inject(MisCursosRepository);
  readonly levels = { iniciacion: 'Iniciaci\u00f3n', basico: 'B\u00e1sico', intermedio: 'Intermedio' };

  /** Descarta respuestas de una identidad o recarga anteriores. */
  private request = 0;
  private destroyed = false;
  private loadedIdentity = '';

  readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  readonly courses = signal<LibraryCourse[]>([]);
  readonly unavailable = signal(0);
  readonly problems = signal<LibraryProblem[]>([]);
  readonly retrying = signal(false);

  /** Fallos temporales concretos, sin contar los cursos inaccesibles. */
  /** Solo los fallos parciales se reintentan aislados; el error global recarga todo. */
  readonly failed = computed(() => (this.problems() ?? []).filter((problem) => problem.kind === 'failed'));

  /** Usuario y estado de sesión; un token refrescado con el mismo id no recarga. */
  private readonly identity = computed(() => {
    const status = this.auth.status();
    if (status !== 'authenticated') return status;
    return `${status}:${this.auth.session()?.user.id ?? ''}`;
  });

  readonly userId = computed(() =>
    this.auth.status() === 'authenticated' ? this.auth.session()?.user.id ?? null : null);

  constructor() {
    this.identity(); // fija la identidad inicial antes de la primera carga
    effect(() => {
      const identity = this.identity();
      untracked(() => void this.load(identity));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.request++;
    });
  }

  /**
   * Reintenta solo los cursos fallidos, conservando los validos ya cargados.
   * No entra en bucle: el boton vive en un aviso que desaparece al no quedar
   * fallos, y mientras hay una peticion en curso el estado es `loading`.
   */
  retry(): void {
    if (this.retrying() || !this.userId()) return;

    // Sin fallos parciales, el botón del error global fuerza una carga completa.
    if (!this.failed().length) {
      if (this.state() !== 'error') return;
      this.retrying.set(true);
      this.loadedIdentity = '';
      void this.load(this.identity()).finally(() => this.retrying.set(false));
      return;
    }

    this.retrying.set(true);
    const request = ++this.request;
    const previous = { courses: this.courses(), problems: this.problems() };
    void this.repository.load(this.userId()!, previous).then(
      (library) => {
        if (this.destroyed || request !== this.request) return;
        this.courses.set(library.courses);
        this.unavailable.set(library.unavailable);
        this.problems.set(library.problems);
        this.state.set(library.courses.length ? 'ready' : 'empty');
      },
      () => {
        if (this.destroyed || request !== this.request) return;
        // Reintento fallido: se conservan los cursos validos ya mostrados.
        this.state.set('ready');
      },
    ).finally(() => {
      if (request === this.request) this.retrying.set(false);
    });
  }

  private async load(identity: string): Promise<void> {
    const userId = this.userId();
    if (!userId || identity === this.loadedIdentity) {
      if (!userId) this.state.set('empty');
      return;
    }

    this.loadedIdentity = identity;
    const request = ++this.request;
    this.retrying.set(false);
    this.courses.set([]);
    this.problems.set([]);
    this.unavailable.set(0);
    this.state.set('loading');

    try {
      const library = await this.repository.load(userId);
      if (this.destroyed || request !== this.request) return;
      this.courses.set(library.courses);
      this.unavailable.set(library.unavailable);
      this.problems.set(library.problems);
      this.state.set(library.courses.length ? 'ready' : 'empty');
    } catch {
      if (this.destroyed || request !== this.request) return;
      this.courses.set([]);
      this.unavailable.set(0);
      this.problems.set([]);
      this.state.set('error');
    }
  }
}
