import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteFooter } from './site-footer';

const EXPECTED_LEGAL_LINKS: ReadonlyArray<
  readonly [label: string, href: string]
> = [
  ['Aviso legal', '/legal/aviso-legal'],
  ['Privacidad', '/legal/privacidad'],
  ['Cookies', '/legal/cookies'],
  ['Términos de compra', '/legal/terminos'],
  ['Reembolsos', '/legal/reembolsos'],
];

const EXPECTED_LINKS: ReadonlyArray<readonly [label: string, href: string]> = [
  ['X', 'https://x.com/acordesgaditano'],
  ['YouTube', 'https://www.youtube.com/@acordesgaditanos'],
  ['TikTok', 'https://www.tiktok.com/@acordes.gaditanos'],
  ['Instagram', 'https://www.instagram.com/acordesgaditanos/'],
  [
    'WhatsApp',
    'https://whatsapp.com/channel/0029VbET4pW3QxRxRJQOtB0I',
  ],
  ['Telegram', 'https://t.me/acordesgaditanos'],
  [
    'LinkedIn',
    'https://www.linkedin.com/in/javier-cordero-toscano',
  ],
  ['GitHub', 'https://github.com/javicordero'],
];

describe('SiteFooter', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(SiteFooter);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra la marca de Acordes Gaditanos', async () => {
    const element = await render();
    const brand = element.querySelector('.site-footer__title');

    expect(brand?.textContent?.trim()).toBe('Acordes Gaditanos');
  });

  it('atribuye el desarrollo a Javier Cordero Toscano', async () => {
    const element = await render();

    expect(element.textContent).toContain(
      'Desarrollado por Javier Cordero Toscano',
    );
  });

  it('enlaza las redes de marca y los perfiles de autoría con hrefs exactos', async () => {
    const element = await render();
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.site-footer__link'),
    ).map((link) => [link.textContent?.trim(), link.getAttribute('href')]);

    expect(links).toEqual(
      EXPECTED_LINKS.map(([label, href]) => [
        `${label} (se abre en una pestaña nueva)`,
        href,
      ]),
    );
  });

  it('abre los enlaces sociales en pestaña nueva sin referrer', async () => {
    const element = await render();
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.site-footer__link'),
    );

    expect(links).toHaveLength(EXPECTED_LINKS.length);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\/[^\s"]+$/);
    }
  });

  it('incluye el año actual en el aviso de copyright', async () => {
    const element = await render();
    const meta = element.querySelector('.site-footer__meta');

    expect(meta?.textContent).toContain(String(new Date().getFullYear()));
    expect(meta?.textContent).toContain('Academia de Guitarra');
  });

  it('enlaza todas las páginas legales con sus rutas exactas', async () => {
    const element = await render();
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.site-footer__legal-link'),
    ).map((link) => [link.textContent?.trim(), link.getAttribute('href')]);

    expect(links).toEqual(
      EXPECTED_LEGAL_LINKS.map(([label, href]) => [label, href]),
    );
    expect(element.querySelector('#footer-legal')?.textContent?.trim()).toBe(
      'Legal',
    );
    expect(
      element.querySelector('ul[aria-labelledby="footer-legal"]'),
    ).not.toBeNull();
  });

  it('mantiene los enlaces legales internos y con objetivo táctil amplio', async () => {
    const element = await render();
    const links = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.site-footer__legal-link'),
    );

    expect(links).toHaveLength(EXPECTED_LEGAL_LINKS.length);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/legal\//);
      expect(link.getAttribute('target')).toBeNull();
      expect(link.getAttribute('rel')).toBeNull();
    }

    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain('site-footer__legal-link');
    expect(css).toContain('44px');
  });

  it('conserva los enlaces externos y no añade rutas de herramientas ni suscripción', async () => {
    const element = await render();
    const hrefs = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('a'),
    ).map((link) => link.getAttribute('href') ?? '');

    expect(hrefs).toHaveLength(
      EXPECTED_LINKS.length + EXPECTED_LEGAL_LINKS.length,
    );
    for (const href of hrefs) {
      expect(href).not.toContain('/herramientas');
      expect(href).not.toContain('/suscribirse');
    }
    for (const [, href] of EXPECTED_LINKS) {
      expect(hrefs).toContain(href);
    }
  });
});
