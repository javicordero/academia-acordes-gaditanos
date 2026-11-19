import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConsentService } from '../../core/consent/consent.service';
import {
  LEGAL_NOTICE,
  LEGAL_PAGES,
  LegalBlock,
  LegalPageKey,
} from './legal-content';

interface LegalHeading {
  readonly level: 2 | 3;
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
}

@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './legal.html',
  styleUrl: './legal.scss',
})
export class Legal {
  private readonly route = inject(ActivatedRoute);
  private readonly consent = inject(ConsentService);

  protected readonly notice = LEGAL_NOTICE;
  protected readonly page =
    LEGAL_PAGES[this.route.snapshot.data['page'] as LegalPageKey] ??
    LEGAL_PAGES['aviso-legal'];

  /** El control de preferencias solo existe en la página de cookies. */
  protected readonly isCookiesPage = this.page.key === 'cookies';

  protected readonly headings: readonly LegalHeading[] = this.page.sections.flatMap(
    (section) => [
      {
        level: 2 as const,
        id: section.id,
        heading: section.heading,
        blocks: section.blocks,
      },
      ...(section.subsections ?? []).map((sub) => ({
        level: 3 as const,
        id: sub.id,
        heading: sub.heading,
        blocks: sub.blocks,
      })),
    ],
  );

  /** Reabre el panel sin guardar ni cambiar la decisión existente. */
  protected changeCookiePreferences(): void {
    this.consent.openPreferences();
  }
}
