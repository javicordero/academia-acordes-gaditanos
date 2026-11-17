import { ChangeDetectionStrategy, Component } from '@angular/core';

interface SocialLink {
  readonly label: string;
  readonly href: string;
}

/**
 * Enlaces externos de la academia. Un enlace con `nombre` y `href` es una red
 * social; el enlace de la autoría se modela aparte para no ser una red de marca.
 */
interface AuthorLink {
  readonly label: string;
  readonly href: string;
}

@Component({
  selector: 'app-site-footer',
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class SiteFooter {
  protected readonly currentYear = new Date().getFullYear();

  /** Redes de Acordes Gaditanos (marca). URLs confirmadas por el usuario. */
  protected readonly brandLinks: readonly SocialLink[] = [
    { label: 'X', href: 'https://x.com/acordesgaditano' },
    { label: 'YouTube', href: 'https://www.youtube.com/@acordesgaditanos' },
    { label: 'TikTok', href: 'https://www.tiktok.com/@acordes.gaditanos' },
    { label: 'Instagram', href: 'https://www.instagram.com/acordesgaditanos/' },
    {
      label: 'WhatsApp',
      href: 'https://whatsapp.com/channel/0029VbET4pW3QxRxRJQOtB0I',
    },
    { label: 'Telegram', href: 'https://t.me/acordesgaditanos' },
  ];

  /** Perfiles de autoría (Javier Cordero Toscano). URLs confirmadas por el usuario. */
  protected readonly authorLinks: readonly AuthorLink[] = [
    {
      label: 'LinkedIn',
      href: 'https://www.linkedin.com/in/javier-cordero-toscano',
    },
    { label: 'GitHub', href: 'https://github.com/javicordero' },
  ];
}
