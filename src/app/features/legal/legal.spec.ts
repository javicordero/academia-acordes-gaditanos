import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { LEGAL_PAGES, LegalPageKey } from './legal-content';

interface LegalCase {
  readonly url: string;
  readonly heading: string;
  readonly title: string;
  readonly key: LegalPageKey;
}

const CASES: readonly LegalCase[] = [
  {
    url: '/legal/aviso-legal',
    heading: 'Aviso legal',
    title: 'Aviso legal · Academia Acordes Gaditanos',
    key: 'aviso-legal',
  },
  {
    url: '/legal/privacidad',
    heading: 'Política de privacidad',
    title: 'Privacidad · Academia Acordes Gaditanos',
    key: 'privacidad',
  },
  {
    url: '/legal/cookies',
    heading: 'Política de cookies',
    title: 'Cookies · Academia Acordes Gaditanos',
    key: 'cookies',
  },
  {
    url: '/legal/terminos',
    heading: 'Términos de compra',
    title: 'Términos de compra · Academia Acordes Gaditanos',
    key: 'terminos',
  },
  {
    url: '/legal/reembolsos',
    heading: 'Reembolsos y desistimiento',
    title: 'Reembolsos · Academia Acordes Gaditanos',
    key: 'reembolsos',
  },
];

const MARKERS = [
  '[Titular]',
  '[CIF/NIF]',
  '[Domicilio]',
  '[Correo de contacto]',
];

describe('Páginas legales', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
    harness = await RouterTestingHarness.create();
  });

  async function open(url: string): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  }

  it.each(CASES)(
    'renderiza $url con un único h1, título y contenido',
    async ({ url, heading, title, key }) => {
      const element = await open(url);
      const h1 = element.querySelectorAll('h1');

      expect(h1).toHaveLength(1);
      expect(h1[0].textContent?.trim()).toBe(heading);
      expect(h1[0].id).toBe('legal-title');
      expect(
        element.querySelector('article[aria-labelledby="legal-title"]'),
      ).not.toBeNull();
      expect(TestBed.inject(Title).getTitle()).toBe(title);
      expect(document.title).toBe(title);
      expect(element.querySelector('.legal__notice')?.textContent).toContain(
        'Plantilla orientativa: revisar antes de publicación',
      );
      expect(element.querySelector('.legal__intro')?.textContent?.trim()).toBe(
        LEGAL_PAGES[key].intro,
      );

      const sections = element.querySelectorAll<HTMLElement>(
        'section[aria-labelledby]',
      );
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        const id = section.getAttribute('aria-labelledby');
        expect(id).toBeTruthy();
        expect(section.querySelector(`[id="${id}"]`)).not.toBeNull();
        expect(section.querySelector('h1')).toBeNull();
      }
      const headings = [
        ...element.querySelectorAll<HTMLElement>('h1, h2, h3'),
      ];
      expect(headings[0].tagName).toBe('H1');
      let seenH2 = false;
      for (const heading of headings) {
        if (heading.tagName === 'H2') {
          seenH2 = true;
        }
        if (heading.tagName === 'H3') {
          expect(seenH2).toBe(true);
        }
      }
    },
  );

  it('muestra los marcadores acordados y no inventa datos personales', async () => {
    for (const url of ['/legal/aviso-legal', '/legal/privacidad']) {
      const text = (await open(url)).textContent ?? '';
      for (const marker of MARKERS) {
        expect(text).toContain(marker);
      }
    }

    for (const { url } of CASES) {
      const text = (await open(url)).textContent ?? '';
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/https?:\/\//i);
      expect(text).not.toContain('Javier Cordero');
      expect(text).not.toMatch(/\b\d{7,}\b/);

      const placeholders = text.match(/\[[^\]]+\]/g) ?? [];
      for (const placeholder of placeholders) {
        expect(MARKERS).toContain(placeholder);
      }
    }
  });

  it('describe GA4 como opcional y el banner de preferencias como ya disponible', async () => {
    const privacy = (await open('/legal/privacidad')).textContent ?? '';

    expect(privacy).toContain('Google Analytics 4 (GA4)');
    expect(privacy).toContain('consentimiento previo');
    expect(privacy).toContain('ID configurado');

    const cookies = (await open('/legal/cookies')).textContent ?? '';

    expect(cookies).toContain(
      'no carga analítica ni servicios de medición por sí sola',
    );
    expect(cookies).toContain('GA4 propio de Acordes Gaditanos');
    expect(cookies).toContain('sin consentimiento no se activa');
    expect(cookies).toContain('banner de preferencias, ya disponible');
    expect(cookies).not.toContain(
      'cuando se implemente el mecanismo de consentimiento',
    );
    expect(cookies).not.toContain('no se activa ninguna analítica');
  });

  it.each(CASES)(
    'el índice de $url enlaza solo a ids reales de la página',
    async ({ url }) => {
      const element = await open(url);
      const index = element.querySelector('nav.legal__index');
      expect(index).not.toBeNull();
      expect(index?.querySelector('h2')?.textContent?.trim()).toBe(
        'Índice de esta página',
      );
      const list = index?.querySelector('ul.legal__index-list');
      expect(list).not.toBeNull();

      const links = Array.from(
        element.querySelectorAll<HTMLAnchorElement>('a.legal__index-link'),
      );
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const href = link.getAttribute('href') ?? '';
        expect(href.startsWith('#')).toBe(true);
        const id = href.slice(1);
        expect(id).not.toBe('');
        expect(element.querySelector(`[id="${id}"]`), `${url} -> ${href}`)
          .not.toBeNull();
        expect(link.textContent?.trim()).not.toBe('');
      }
    },
  );

  it('usa clases accesibles y responsive, sin otros controles que el índice', async () => {
    const element = await open('/legal/privacidad');

    expect(element.querySelector('.legal')).not.toBeNull();
    expect(element.querySelector('.legal__title')).not.toBeNull();
    expect(element.querySelector('.legal__notice')).not.toBeNull();
    expect(element.querySelector('.legal__section')).not.toBeNull();
    expect(element.querySelector('.legal__section--sub')).not.toBeNull();
    expect(element.querySelectorAll('button, input')).toHaveLength(0);

    const css = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .join('\n')
      .replace(/\s+/g, '');

    expect(css).toContain('--legal-');
    expect(css).toContain('@media');
    expect(css).toContain('20rem');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('min-height:44px');
  });

  it('redirige /legal al aviso legal', async () => {
    await harness.navigateByUrl('/legal');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/legal/aviso-legal');
  });

  it('deja intacta la página 404 para rutas desconocidas', async () => {
    const missing = await open('/ruta-legal-que-no-existe');
    expect(missing.querySelector('h1')?.textContent?.trim()).toBe(
      'Página no encontrada',
    );
    expect(TestBed.inject(Router).url).toBe('/ruta-legal-que-no-existe');

    const explicit = await open('/not-found');
    expect(explicit.querySelector('h1')?.textContent?.trim()).toBe(
      'Página no encontrada',
    );
  });
});
