import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { MisCursosRepository } from './mis-cursos-repository';

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
  private readonly userId = computed(() => this.auth.status() === 'authenticated' ? this.auth.session()?.user.id : undefined);
  readonly library = resource({ params: () => this.userId(), loader: ({params}) => this.repository.load(params) });
  readonly levels = { iniciacion: 'Iniciación', basico: 'Básico', intermedio: 'Intermedio' };
}
