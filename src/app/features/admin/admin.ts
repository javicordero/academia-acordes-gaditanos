import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { Course, CoursesRepository, CourseStatus } from './courses-repository';
import { CourseEditor } from './course-editor/course-editor';
import { LessonMaterials } from './lesson-materials/lesson-materials';
import { LessonVideo } from './lesson-video/lesson-video';
import { Lesson, StructureRepository } from './structure-repository';
import { Structure } from './structure/structure';

type Section =
  | 'cursos'
  | 'nuevo'
  | 'datos'
  | 'estructura'
  | 'leccion'
  | 'vista-previa'
  | 'estado';

const SECTION_TITLES: Record<Section, string> = {
  cursos: 'Cursos',
  nuevo: 'Nuevo curso',
  datos: 'Datos del curso',
  estructura: 'Estructura',
  leccion: 'Lección: vídeo y materiales',
  'vista-previa': 'Vista previa',
  estado: 'Publicación y estado',
};

const STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

/** Nota editorial: solo se muestra en el panel, nunca como contenido del alumno. */
function lessonNote(lesson: Lesson | undefined): string {
  if (!lesson) return '';
  return [lesson.content_md, lesson.summary]
    .map((value) => (value ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

@Component({
  selector: 'app-admin',
  imports: [
    CourseEditor,
    Structure,
    LessonVideo,
    LessonMaterials,
    RouterLink,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  private readonly repository = inject(CoursesRepository);
  private readonly structureRepository = inject(StructureRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly coursesHeading = viewChild<ElementRef<HTMLElement>>('coursesHeading');
  private readonly sectionHeading = viewChild<ElementRef<HTMLElement>>('sectionHeading');

  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly section = signal<Section>('cursos');
  readonly courseId = signal('');
  readonly lessonId = signal<string | null>(null);
  readonly lessonTitle = signal('');
  readonly lessonNote = signal('');
  readonly sectionTitle = computed(() => SECTION_TITLES[this.section()]);
  readonly selectedCourse = computed(
    () => this.courses().find((course) => course.id === this.courseId()) ?? null,
  );
  readonly statusLabel = computed(() => {
    const course = this.selectedCourse();
    return course ? STATUS_LABELS[course.status] : 'Cargando estado…';
  });
  readonly inCourse = computed(
    () => !!this.courseId() && this.section() !== 'cursos' && this.section() !== 'nuevo',
  );
  readonly links = computed(() => {
    const course = this.courseId();
    const lesson = this.lessonId();
    return [
      { key: 'datos' as const, label: 'Datos del curso', path: ['/admin', 'curso', course, 'datos'] },
      { key: 'estructura' as const, label: 'Estructura', path: ['/admin', 'curso', course, 'estructura'] },
      {
        key: 'leccion' as const,
        label: 'Lección: vídeo y materiales',
        path: lesson
          ? ['/admin', 'curso', course, 'leccion', lesson]
          : ['/admin', 'curso', course, 'estructura'],
      },
      { key: 'vista-previa' as const, label: 'Vista previa', path: ['/admin', 'curso', course, 'vista-previa'] },
      { key: 'estado' as const, label: 'Publicación y estado', path: ['/admin', 'curso', course, 'estado'] },
    ];
  });

  private loadVersion = 0;
  private contextVersion = 0;
  private navigations = 0;
  private previousUser: string | null | undefined;

  constructor() {
    effect(() => {
      const user = this.auth?.session()?.user.id ?? null;
      if (this.previousUser !== undefined && this.previousUser !== user) this.clearLessonState();
      this.previousUser = user;
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        const initial = this.navigations++ === 0;
        this.syncFromRoute();
        // No se roba el foco en la carga inicial; sí al cambiar de sección.
        if (!initial) this.focusSection();
      });

    this.destroyRef.onDestroy(() => {
      this.loadVersion++;
      this.contextVersion++;
    });
    this.syncFromRoute();
    void this.load();
  }

  async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set(false);
    try {
      const courses = await this.repository.list();
      if (version === this.loadVersion) this.courses.set(courses);
    } catch {
      if (version === this.loadVersion) this.error.set(true);
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  /** Une los parámetros de todas las rutas hijas, incluidos los aliases antiguos. */
  private syncFromRoute(): void {
    const params: Record<string, string> = {};
    let node: ActivatedRouteSnapshot | null = this.route.snapshot.firstChild;
    let section: Section = 'cursos';
    while (node) {
      Object.assign(params, node.params);
      const fromData = node.data['section'] as Section | undefined;
      if (fromData) section = fromData;
      node = node.firstChild;
    }

    const courseId = params['courseId'] ?? '';
    const lessonId = params['lessonId'] ?? null;
    const courseChanged = courseId !== this.courseId();
    const lessonChanged = !!lessonId && lessonId !== this.lessonId();
    if (courseChanged || lessonChanged) {
      this.contextVersion++;
      this.lessonTitle.set('');
      this.lessonNote.set('');
    }
    this.section.set(section);
    this.courseId.set(courseId);
    if (courseChanged || lessonId) this.lessonId.set(lessonId);
    if (section === 'leccion' && courseId && lessonId) void this.loadLesson(courseId, lessonId);
  }

  private async loadLesson(courseId: string, lessonId: string): Promise<void> {
    const version = this.contextVersion;
    const user = this.auth?.session()?.user.id ?? null;
    try {
      const { lessons } = await this.structureRepository.list(courseId);
      if (
        version !== this.contextVersion ||
        this.destroyRef.destroyed ||
        this.section() !== 'leccion' ||
        this.courseId() !== courseId ||
        this.lessonId() !== lessonId ||
        (this.auth?.session()?.user.id ?? null) !== user
      ) return;
      const lesson = lessons.find((item) => item.id === lessonId);
      this.lessonTitle.set(lesson?.title ?? '');
      this.lessonNote.set(lessonNote(lesson));
    } catch {
      // Sin datos no se inventa texto: el bloque simplemente no aparece.
      if (version === this.contextVersion && this.courseId() === courseId) {
        this.lessonTitle.set('');
        this.lessonNote.set('');
      }
    }
  }

  private clearLessonState(): void {
    this.contextVersion++;
    this.lessonId.set(null);
    this.lessonTitle.set('');
    this.lessonNote.set('');
  }

  private focusSection(): void {
    afterNextRender(() => {
      const heading = this.section() === 'cursos' ? this.coursesHeading() : this.sectionHeading();
      heading?.nativeElement.focus();
    }, { injector: this.injector });
  }

  go(section: Section, lessonId?: string | null): void {
    const course = this.courseId();
    if (!course) return;
    const chosen = lessonId ?? this.lessonId();
    const path: Record<'datos' | 'estructura' | 'leccion' | 'vista-previa' | 'estado', string[]> = {
      datos: ['/admin', 'curso', course, 'datos'],
      estructura: ['/admin', 'curso', course, 'estructura'],
      leccion: chosen
        ? ['/admin', 'curso', course, 'leccion', chosen]
        : ['/admin', 'curso', course, 'estructura'],
      'vista-previa': ['/admin', 'curso', course, 'vista-previa'],
      estado: ['/admin', 'curso', course, 'estado'],
    };
    if (section === 'cursos' || section === 'nuevo') return;
    void this.router.navigate(path[section]);
  }

  openNew(): void {
    void this.router.navigate(['/admin', 'nuevo']);
  }

  backToCourses(): void {
    void this.router.navigate(['/admin']);
    this.lessonId.set(null);
    this.lessonTitle.set('');
    this.lessonNote.set('');
    afterNextRender(() => this.coursesHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  saved(): void {
    void this.load();
    this.backToCourses();
  }

  statusOf(course: Course): string {
    return STATUS_LABELS[course.status];
  }
}
