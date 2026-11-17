import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Section { id: string; title: string }
interface Lesson { id: string; section_id: string; title: string; slug: string; is_free_preview?: boolean }

@Component({
  selector: 'app-classroom-nav',
  imports: [RouterLink],
  template: `
    <button #menu class="menu" type="button" aria-controls="classroom-index"
      [attr.aria-expanded]="open()" (click)="open.set(!open())" (keydown.escape)="closeMenu()">Lecciones del curso</button>
    <nav #index id="classroom-index" aria-label="Lecciones del curso" [class.open]="open()" (keydown.escape)="closeMenu()">
      <a [routerLink]="admin() ? '/admin' : '/mis-cursos'">← {{ admin() ? 'Volver a administración' : 'Volver a mis cursos' }}</a>
      <h2>{{ title() }}</h2>
      @for (section of sections(); track section.id) {
        <details open>
          <summary>{{ section.title }}</summary>
          <ul>
            @for (lesson of lessons(); track lesson.id) {
              @if (lesson.section_id === section.id) {
                <li><a [routerLink]="admin() ? ['/admin/vista-previa', courseId(), lesson.id] : ['/aula', courseSlug(), lesson.slug]"
                  [attr.aria-current]="lesson.id === activeId() ? 'page' : null" (click)="open.set(false)">
                  <span aria-hidden="true">{{ lesson.id === activeId() ? '▶' : '○' }}</span>
                  {{ lesson.title }} @if (lesson.is_free_preview) { <small>Muestra</small> }
                </a></li>
              }
            }
          </ul>
        </details>
      }
    </nav>
  `,
  styles: [`
    :host { display:block; min-width:0; }
    nav { background:#f3f0e9; border:1px solid #e2dbce; border-radius:.75rem; padding:1.25rem; }
    nav > a { font-size:.9rem; }
    h2 { font-size:1.2rem; overflow-wrap:anywhere; margin:1.25rem 0; }
    details { border-top:1px solid #d9d0c1; padding:.8rem 0; }
    summary { cursor:pointer; font-weight:700; }
    ul { list-style:none; margin:.5rem 0 0; padding:0; }
    li a { display:flex; align-items:baseline; gap:.6rem; padding:.65rem; color:inherit; text-decoration:none; border-radius:.4rem; overflow-wrap:anywhere; }
    li a[aria-current=page] { background:#e5d4c3; font-weight:700; border-left:3px solid #7b3f2a; }
    small { font-weight:400; }
    .menu { display:none; }
    @media (min-width:48rem) { nav { max-height:calc(100vh - 8rem); overflow:auto; position:sticky; top:1rem; } }
    @media (max-width:47.999rem) {
      .menu { display:block; width:100%; }
      nav:not(.open) { display:none; }
    }
  `],
})
export class ClassroomNav {
  private static readonly scrollPositions = new Map<string, number>();
  private readonly index = viewChild<ElementRef<HTMLElement>>('index');
  private readonly menu = viewChild<ElementRef<HTMLButtonElement>>('menu');
  readonly title = input.required<string>();
  readonly sections = input.required<Section[]>();
  readonly lessons = input.required<Lesson[]>();
  readonly activeId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly courseSlug = input('');
  readonly admin = input(false);
  readonly open = signal(false);
  constructor() {
    afterNextRender(() => {
      const index = this.index()?.nativeElement;
      if (index) index.scrollTop = ClassroomNav.scrollPositions.get(this.key()) ?? 0;
    });
    inject(DestroyRef).onDestroy(() => {
      const index = this.index()?.nativeElement;
      if (index) ClassroomNav.scrollPositions.set(this.key(), index.scrollTop);
    });
  }
  private key(): string { return `${this.admin() ? 'admin' : 'aula'}:${this.courseId()}`; }
  closeMenu(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.menu()?.nativeElement.focus();
  }
}
