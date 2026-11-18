import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CheckoutButton } from '../../core/checkout/checkout-button';
import {
  CourseAccess,
  PublicCourse,
  levelLabels,
} from '../../features/cursos/public-courses-repository';

/**
 * Tarjeta presentacional del catálogo. Recibe la forma pública del curso y un
 * estado de acceso opcional (ya calculado por la ficha o la biblioteca).
 * No consulta el repositorio ni decide compras: delega en `CheckoutButton`.
 */
@Component({
  selector: 'app-course-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CheckoutButton],
  templateUrl: './course-card.html',
  styleUrl: './course-card.scss',
})
export class CourseCard {
  readonly course = input.required<PublicCourse>();
  readonly accessState = input<CourseAccess | '' | null>(null);

  readonly levelLabel = computed(() => levelLabels[this.course().level]);
  readonly titleId = computed(() => `curso-titulo-${this.course().slug}`);
}
