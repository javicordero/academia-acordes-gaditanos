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
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    CookieBanner,
    SiteFooter,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss',
  host: { '(document:click)': 'onDocumentClick($event)' },
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

  /** Disclosure de cuenta, independiente del menú móvil y del aula. */
  readonly userMenuOpen = signal(false);

  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly siteNav = viewChild<ElementRef<HTMLElement>>('siteNav');
  private readonly userMenu = viewChild<ElementRef<HTMLElement>>('userMenu');
  private readonly userMenuButton = viewChild<ElementRef<HTMLButtonElement>>('userMenuButton');

  /**
   * Nombre visible opcional del perfil, leído solo de los metadatos de la sesión.
   * Nunca se muestra el correo: si el valor no es un nombre corto y seguro se
   * usa un rótulo genérico, sin inventar datos de alumno.
   */
  readonly accountName = computed(() => {
    const metadata = this.auth.session()?.user.user_metadata as
      | Record<string, unknown>
      | undefined;
    const candidate = metadata?.['display_name'] ?? metadata?.['name'];
    if (typeof candidate !== 'string') return 'Mi cuenta';
    const name = candidate.trim();
    if (!name || name.length > 60 || name.includes('@')) return 'Mi cuenta';
    return name;
  });

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
    // En navegaciones posteriores llevamos el foco al contenido principal SIN
    // desplazar la página: la portada tiene sangrados que el navegador intentaría
    // hacer visibles, dejando el index scrolleado al pulsar la marca.
    this.navigationEnd$
      .pipe(skip(1), takeUntilDestroyed())
      .subscribe(() => {
        this.document.getElementById('contenido-principal')?.focus({ preventScroll: true });
      });

    // Cualquier navegación cierra el panel: enlaces del menú,logout, cambio de
    // ruta o entrada en el aula (donde la cabecera ni existe).
    this.navigationEnd$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.closeMenu();
        this.closeUserMenu();
      });

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

  /** Abrir el overlay cierra el desplegable de cuenta: nunca se solapan. */
  toggleMenu(): void {
    const opening = !this.menuOpen();
    if (opening) {
      this.closeUserMenu();
    }
    this.menuOpen.set(opening);
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

  toggleUserMenu(event?: Event): void {
    // El disclosure de cuenta no dispara el cierre por click fuera con el mismo
    // evento que lo abre, y al abrirse cierra el overlay móvil para no solapar.
    event?.stopPropagation();
    const opening = !this.userMenuOpen();
    if (opening) {
      this.closeMenu();
    }
    this.userMenuOpen.set(opening);
  }

  closeUserMenu(restoreFocus = false): void {
    this.userMenuOpen.set(false);
    if (restoreFocus) {
      this.userMenuButton()?.nativeElement.focus();
    }
  }

  /** Escape cierra y devuelve el foco al botón; las flechas recorren las opciones. */
  onUserMenuKeydown(event: KeyboardEvent): void {
    if (!this.userMenuOpen()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeUserMenu(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const items = Array.from(
      this.userMenu()?.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const active = this.document.activeElement as HTMLElement | null;
    const current = active ? items.indexOf(active) : -1;
    const next =
      event.key === 'ArrowDown'
        ? (current + 1) % items.length
        : (current <= 0 ? items.length - 1 : current - 1);
    items[next].focus();
  }

  /** El desplegable vive fuera del overlay: su click no llega a la navegación. */
  onUserMenuClick(event: Event): void {
    event.stopPropagation();
  }

  /** Un click fuera del desplegable lo cierra sin tocar otros estados. */
  onDocumentClick(event: Event): void {
    if (!this.userMenuOpen()) {
      return;
    }
    const container = this.userMenu()?.nativeElement;
    const target = event.target as Node | null;
    if (container && target && !container.contains(target)) {
      this.userMenuOpen.set(false);
    }
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
    this.closeUserMenu();
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
