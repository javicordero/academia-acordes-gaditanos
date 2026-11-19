import { DOCUMENT } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, skip } from 'rxjs';

import { AnalyticsService } from './core/analytics/analytics.service';
import { AuthService } from './core/auth/auth.service';
import { CookieBanner } from './shared/cookie-banner/cookie-banner';
import { SiteFooter } from './shared/site-footer/site-footer';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, CookieBanner, SiteFooter],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  /** Se instancia al arrancar para escuchar NavigationEnd tras el consentimiento. */
  private readonly analytics = inject(AnalyticsService);
  readonly logoutError = signal<string | null>(null);

  /** Única fuente de verdad del disclosure móvil; el template solo la lee. */
  readonly menuOpen = signal(false);

  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly siteNav = viewChild<ElementRef<HTMLElement>>('siteNav');

  /** Un único stream de navegaciones para la URL y el foco, sin duplicar filtros. */
  private readonly navigationEnd$ = this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
  );

  private readonly currentUrl = toSignal(
    this.navigationEnd$.pipe(map((event) => event.urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  constructor() {
    // La primera navegación es la carga inicial: no le robamos el foco al usuario.
    // En navegaciones posteriores llevamos el foco al contenido principal.
    this.navigationEnd$
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => {
        this.document.getElementById('contenido-principal')?.focus();
      });

    // Cualquier navegación cierra el panel: enlaces del menú,logout, cambio de
    // ruta o entrada en el aula (donde la cabecera ni existe).
    this.navigationEnd$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.closeMenu());

    // Efecto de sincronización con una API imperativa: bloquea el scroll del
    // body solo mientras el diálogo está abierto y restaura el valor previo.
    effect((onCleanup) => {
      if (!this.menuOpen()) {
        return;
      }
      const body = this.document.body;
      const previousOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
      onCleanup(() => {
        body.style.overflow = previousOverflow;
      });
    });

    // El panel permanece en el DOM para animar translateX; el foco se coloca
    // después de renderizar, cuando la clase is-open ya lo ha hecho visible.
    afterRenderEffect(() => {
      if (!this.menuOpen()) {
        return;
      }
      this.firstPanelControl()?.focus();
    });
  }

  /**
   * El aula pública y la vista previa de administración comparten el layout a
   * pantalla completa (`app-classroom-nav` + la hoja del aula). Ambas ocultan la
   * cabecera global para dar la misma experiencia; la detección sale de Router,
   * nunca de `window.location`.
   */
  readonly isClassroom = computed(() => {
    const url = this.currentUrl();
    return url.includes('/aula/') || url.includes('/vista-previa');
  });

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  /** Único cierre: con restoreFocus lo devuelve al botón que abrió el panel. */
  closeMenu(restoreFocus = false): void {
    this.menuOpen.set(false);
    if (restoreFocus) {
      this.menuToggle()?.nativeElement.focus();
    }
  }

  /** Escape: cierra y devuelve el foco al mismo botón que abrió el diálogo. */
  onEscape(event?: Event): void {
    if (!this.menuOpen()) {
      return;
    }
    event?.preventDefault();
    this.closeMenu(true);
  }

  /**
   * Trampa mínima: el tabulador cicla entre el toggle y los controles visibles
   * del panel, de modo que el foco no escape al contenido de fondo.
   */
  onMenuKeydown(event: KeyboardEvent): void {
    if (!this.menuOpen() || event.key !== 'Tab') {
      return;
    }

    const controls = this.menuControls();
    if (controls.length === 0) {
      return;
    }

    const active = this.document.activeElement as HTMLElement | null;
    const current = active ? controls.indexOf(active) : -1;
    const next =
      current === -1
        ? event.shiftKey
          ? controls.length - 1
          : 0
        : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;

    event.preventDefault();
    controls[next].focus();
  }

  /** Pulsar cualquier control del panel cierra; la navegación sigue su curso. */
  onPanelClick(): void {
    this.closeMenu();
  }

  /** El foco de apertura va al primer enlace, no a la X de cierre. */
  private firstPanelControl(): HTMLElement | null {
    return (
      this.siteNav()?.nativeElement.querySelector<HTMLElement>('nav a[href]') ?? null
    );
  }

  private menuControls(): HTMLElement[] {
    const controls: HTMLElement[] = [];
    const toggle = this.menuToggle()?.nativeElement;
    if (toggle) {
      controls.push(toggle);
    }
    const panel = this.siteNav()?.nativeElement;
    if (panel) {
      controls.push(
        ...Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ),
      );
    }
    return controls;
  }

  async logout(): Promise<void> {
    this.logoutError.set(null);
    const result = await this.auth.logout();

    if (!result.ok) {
      this.logoutError.set(
        result.message ?? 'No se pudo cerrar la sesión. Inténtalo de nuevo.',
      );
      return;
    }

    this.closeMenu();
    await this.router.navigateByUrl('/cursos');
  }
}
