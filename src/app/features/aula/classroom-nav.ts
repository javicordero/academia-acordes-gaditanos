import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Section { id: string; title: string }
import { LessonContentType } from '../../shared/lesson-content-type';
interface Lesson { id: string; section_id: string; title: string; slug: string; content_type: LessonContentType; is_free_preview?: boolean }

@Component({
  selector: 'app-classroom-nav',
  imports: [RouterLink],
  host: { '(document:keydown.escape)': 'onDocumentEscape()' },
  template: `
    <button #menu class="menu" type="button" aria-controls="classroom-index" aria-label="Lecciones del curso"
      title="Lecciones del curso" [attr.aria-expanded]="open()" [class.menu--open]="open()"
      (click)="open.set(!open())">
      <svg class="icon menu__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 5.5h14M3 10h14M3 14.5h14" />
      </svg>
      <span class="menu__label">Lecciones del curso</span>
    </button>
    <nav #index id="classroom-index" aria-label="Lecciones del curso" [class.open]="open()"
      [class.classroom-nav--compact]="compact()" (keydown.escape)="closeMenu()">
      <div class="nav-head">
        <a class="nav-back" [routerLink]="admin() ? '/admin' : '/mis-cursos'">
          <svg class="icon nav-back__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5" /></svg>
          <span>{{ admin() ? 'Volver a administración' : 'Volver a mis cursos' }}</span>
        </a>
        <!-- Compresión de escritorio: dentro del raíl, junto al título; el hamburger
             de cajón (.menu) solo existe en móvil, así que nunca se duplican.
             Se anuncia como botón de alternancia (aria-pressed con el modo
             compacto), no como expansionable: el nav sigue visible al comprimir. -->
        <button type="button" class="index-compress" data-action="compress-index"
          [attr.aria-label]="compact() ? 'Expandir índice' : 'Comprimir índice'"
          [attr.title]="compact() ? 'Expandir índice' : 'Comprimir índice'"
          [attr.aria-pressed]="compact()" (click)="compressToggle.emit()">
          <svg class="icon index-compress__icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      </div>
      <h2>{{ title() }}</h2>
      @if (teacher()) { <p class="nav-teacher">{{ teacher() }}</p> }
      @for (section of sections(); track section.id) {
        <section class="nav-block">
          <button type="button" class="block-toggle" [attr.aria-label]="section.title"
            [attr.aria-expanded]="isExpanded(section.id)"
            [attr.aria-controls]="'bloque-' + section.id" (click)="toggleBlock(section.id)">
            <span class="block-toggle__title" [attr.title]="section.title">{{ section.title }}</span>
            <span class="block-toggle__chevron" aria-hidden="true">{{ isExpanded(section.id) ? '▾' : '▸' }}</span>
          </button>
          <ul [id]="'bloque-' + section.id" [hidden]="!isExpanded(section.id)">
            @for (lesson of lessons(); track lesson.id) {
              @if (lesson.section_id === section.id) {
                <li class="lesson-row">
                  <a class="lesson-row__link" [routerLink]="admin() ? ['/admin/vista-previa', courseId(), lesson.id] : ['/aula', courseSlug(), lesson.slug]"
                    [attr.aria-current]="lesson.id === activeId() ? 'page' : null" (click)="closeMenu()">
                    @if (completedIds(); as doneIds) {
                      <span class="lesson-progress" [class.lesson-progress--done]="doneIds.has(lesson.id)">
                        @if (doneIds.has(lesson.id)) {
                          <svg class="lesson-progress__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M3 8.5 6.3 12 13 4.5" />
                          </svg>
                          <span class="sr-only">Completada</span>
                        } @else {
                          <svg class="lesson-progress__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <circle cx="8" cy="8" r="5.75" />
                          </svg>
                          <span class="sr-only">Pendiente</span>
                        }
                      </span>
                    }
                    <span class="lesson-title" [attr.title]="lesson.title">{{ lesson.title }}</span> @if (lesson.is_free_preview) { <small>Muestra</small> }
                  </a>
                </li>
              }
            }
          </ul>
        </section>
      }
    </nav>
  `,
  styles: [`
    :host { display:block; min-width:0; height:100%; min-height:0; }
    .sr-only, .menu__label { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    :focus-visible { outline:3px solid var(--focus); outline-offset:2px; border-radius:2px; }
    .icon { display:inline-block; width:1em; height:1em; flex:none; fill:none; stroke:currentColor; stroke-width:1.4; stroke-linecap:round; stroke-linejoin:round; }

    /* Índice integrado, sin tarjeta flotante. */
    nav {
      background:var(--surface);
      border:0;
      border-inline-end:var(--border-width) solid var(--border);
      border-radius:0;
      padding:0 var(--space-4) var(--space-4);
      height:100%;
      min-height:0;
      overflow-y:auto;
      overscroll-behavior:contain;
    }
    .nav-head { display:flex; align-items:center; gap:var(--space-2); padding-block:var(--space-3); border-bottom:var(--border-width) solid var(--border); }
    .nav-back { display:inline-flex; align-items:center; gap:var(--space-2); flex:1 1 auto; min-width:0; min-height:44px; font-size:.9rem; }
    .nav-back span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .nav-back__icon { width:.85rem; height:.85rem; flex:none; }
    h2 { font-size:1.2rem; overflow-wrap:anywhere; margin:var(--space-4) 0 var(--space-1); }
    .nav-teacher { margin:0 0 var(--space-4); color:var(--muted); font-size:.9rem; }
    .nav-block { border-top:var(--border-width) solid var(--border); padding:var(--space-1) 0; }
    .block-toggle {
      display:flex; align-items:center; gap:var(--space-2); width:100%;
      min-height:44px; padding:var(--space-2) var(--space-1);
      border:0; background:none; color:inherit;
      font:inherit; font-weight:700; text-align:left; cursor:pointer;
    }
    .block-toggle:hover { background:#f1e9db; }
    .block-toggle__title { flex:1 1 auto; }
    .block-toggle__chevron { flex:none; font-size:.8rem; }
    ul { list-style:none; margin:var(--space-1) 0 var(--space-2); padding:0; }
    /* Fila: el enlace ocupa el hueco y el progreso va al inicio, sin estrella aquí. */
    li.lesson-row { display:flex; align-items:center; gap:var(--space-1); }
    li a {
      display:flex; align-items:center; gap:var(--space-2); min-height:44px;
      flex:1 1 auto; min-width:0;
      padding:var(--space-2); color:inherit; text-decoration:none;
      overflow-wrap:anywhere;
    }
    .lesson-title { min-width:0; overflow-wrap:anywhere; }
    /* Progreso: solo forma (check/círculo); texto en sr-only. */
    .lesson-progress {
      display:inline-flex; align-items:center; justify-content:center; flex:none;
      width:18px; height:18px; color:var(--muted);
    }
    .lesson-progress--done { color:var(--accent); }
    .lesson-progress__icon {
      width:1rem; height:1rem; flex:none; fill:none; stroke:currentColor;
      stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;
    }
    .lesson-progress--done .lesson-progress__icon { stroke-width:2.2; }
    li a[aria-current=page] { background:#f1e9db; font-weight:700; border-inline-start:3px solid var(--accent); }
    small { font-weight:400; }

    /* Raíl estrecho de escritorio: ellipsis solo visual, texto completo en title. */
    nav.classroom-nav--compact { padding:0 .5rem .5rem; }
    .classroom-nav--compact li.lesson-row { gap:.1rem; }
    .classroom-nav--compact .nav-teacher { display:none; }
    .classroom-nav--compact h2 { font-size:1rem; margin:.75rem 0 .25rem; }
    .classroom-nav--compact .block-toggle { gap:.3rem; padding:.35rem .15rem; }
    .classroom-nav--compact li a { gap:.35rem; padding:.35rem .3rem; }
    .classroom-nav--compact .block-toggle__title,
    .classroom-nav--compact .lesson-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .classroom-nav--compact .lesson-progress { width:16px; height:16px; }
    .classroom-nav--compact small { flex:none; }

    /* Compresión solo en escritorio; en móvil manda .menu. */
    .index-compress { display:none; }
    @media (min-width:48rem) {
      .index-compress {
        display:grid; place-items:center; flex:none;
        width:44px; height:44px; padding:0;
        border:0; border-radius:2px; background:none; color:inherit;
      }
    }

    .menu { display:none; }

    @media (max-width:47.999rem) {
      /* Barra fina; nombre para lectores de pantalla. */
      .menu {
        display:flex; align-items:center; gap:var(--space-2);
        min-width:48px; min-height:48px; padding:0 var(--space-2);
        border:0; background:transparent; color:inherit;
        font:inherit; font-weight:700; cursor:pointer;
      }
      .menu__icon { width:1.45rem; height:1.45rem; stroke-width:1.6; }
      /* Sin backdrop ni X: el propio hamburger cierra el cajón y devuelve el foco. */
      .menu--open {
        position:fixed; inset:.35rem auto auto .5rem; z-index:50;
      }
      nav:not(.open) { display:none; }
      nav.open {
        position:fixed; inset:0 auto 0 0; z-index:40;
        width:85%; max-width:24rem; height:100vh; height:100dvh;
        border-inline-end:var(--border-width) solid var(--border);
        padding-top:var(--space-5);
        box-shadow:none;
      }
    }
  `],
})
export class ClassroomNav {
  private static readonly scrollPositions = new Map<string, number>();
  private readonly index = viewChild<ElementRef<HTMLElement>>('index');
  private readonly menu = viewChild<ElementRef<HTMLButtonElement>>('menu');
  readonly title = input.required<string>();
  readonly teacher = input('');
  readonly sections = input.required<Section[]>();
  readonly lessons = input.required<Lesson[]>();
  readonly activeId = input.required<string>();
  /** Estado real de progreso del curso; `null` cuando no hay progreso que mostrar. */
  readonly completedIds = input<ReadonlySet<string> | null>(null);
  readonly courseId = input.required<string>();
  readonly courseSlug = input('');
  readonly admin = input(false);
  /** Raíl estrecho de escritorio: recorta paddings y recorta títulos con ellipsis. */
  readonly compact = input(false);
  /** Un único aviso al pulsar el control de escritorio; Aula decide el estado. */
  readonly compressToggle = output<void>();
  readonly open = signal(false);
  private readonly collapsed = signal<ReadonlySet<string>>(new Set());
  private previousBodyOverflow = '';
  private savedScrollY: number | null = null;

  constructor() {
    // El cajón móvil bloquea el scroll del documento mientras está abierto y
    // devuelve el desplazamiento previo al cerrar (o al destruir el componente).
    effect(() => {
      if (this.open()) {
        if (this.savedScrollY === null) {
          this.savedScrollY = window.scrollY;
          this.previousBodyOverflow = document.body.style.overflow;
          document.body.style.overflow = 'hidden';
        }
      } else {
        this.restoreScroll();
      }
    });
    afterNextRender(() => {
      const index = this.index()?.nativeElement;
      if (index) index.scrollTop = ClassroomNav.scrollPositions.get(this.key()) ?? 0;
    });
    inject(DestroyRef).onDestroy(() => {
      const index = this.index()?.nativeElement;
      if (index) ClassroomNav.scrollPositions.set(this.key(), index.scrollTop);
      this.restoreScroll();
    });
  }

  private key(): string { return `${this.admin() ? 'admin' : 'aula'}:${this.courseId()}`; }

  private restoreScroll(): void {
    if (this.savedScrollY === null) return;
    document.body.style.overflow = this.previousBodyOverflow;
    if (window.scrollY !== this.savedScrollY) window.scrollTo(0, this.savedScrollY);
    this.savedScrollY = null;
  }

  isExpanded(id: string): boolean { return !this.collapsed().has(id); }

  toggleBlock(id: string): void {
    this.collapsed.update(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  onDocumentEscape(): void {
    if (this.open()) this.closeMenu();
  }

  closeMenu(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.menu()?.nativeElement.focus();
  }
}
