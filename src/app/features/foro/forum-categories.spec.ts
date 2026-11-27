import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ForumCategories } from './forum-categories';
import { ForumThreadRepository } from './forum-thread-repository';

const CATEGORY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function category(title = 'Pasodoble') {
  return { id: CATEGORY, slug: 'pasodoble', title, description: 'Ritmo y acompañamiento', position: 1 };
}

describe('Pantalla de categorías del foro', () => {
  const listCategories = vi.fn();
  let harness: RouterTestingHarness;
  let text: () => string;

  beforeEach(async () => {
    vi.clearAllMocks();
    listCategories.mockResolvedValue([category()]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'foro', children: [{ path: '', component: ForumCategories }] }]),
        { provide: ForumThreadRepository, useValue: { listCategories } },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/foro', ForumCategories);
    await harness.fixture.whenStable();
    harness.detectChanges();
    text = () => harness.routeNativeElement?.textContent ?? '';
  });

  it('muestra un único h1, título, descripción y enlace a los hilos', async () => {
    expect(harness.routeNativeElement?.querySelectorAll('h1')).toHaveLength(1);
    expect(text()).toContain('Foro');
    expect(text()).toContain('Ritmo y acompañamiento');
    const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/foro/' + CATEGORY + '"]');
    expect(link?.textContent).toContain('Ver hilos');
    expect(link?.getAttribute('aria-label')).toBe('Ver hilos de Pasodoble');
    expect(listCategories).toHaveBeenCalledTimes(1);
  });

  it('muestra texto, no HTML, cuando el servidor devuelve marcas', async () => {
    listCategories.mockResolvedValueOnce([category('<img src=x onerror=alert(1)>')]);
    (harness.routeDebugElement?.componentInstance as ForumCategories).load();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('muestra un esqueleto accesible durante la carga', async () => {
    let resolve!: (rows: unknown[]) => void;
    listCategories.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    (harness.routeDebugElement?.componentInstance as ForumCategories).load();
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(root.querySelector('app-skeleton .skeleton')?.getAttribute('data-variant')).toBe('list');
    expect(root.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Cargando categorías');
    expect(root.querySelector('.skeleton__shapes')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('article.page')?.getAttribute('aria-busy')).toBe('true');
    resolve([category()]);
  });

  it('estado vacío accesible', async () => {
    listCategories.mockResolvedValueOnce([]);
    (harness.routeDebugElement?.componentInstance as ForumCategories).load();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(text()).toContain('Todavía no hay categorías en el foro.');
    expect(harness.routeNativeElement?.querySelector('[role="status"]')).not.toBeNull();
  });

  it('error reintentable sin filtrar el fallo crudo', async () => {
    listCategories.mockRejectedValueOnce(new Error('https://ejemplo.test?token=secreto'));
    (harness.routeDebugElement?.componentInstance as ForumCategories).load();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron cargar');
    expect(text()).not.toContain('secreto');

    const retry = [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reintentar')!;
    retry.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(listCategories).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Pasodoble');
  });

  it('separa las categorías con padding de sección y línea fina', () => {
    const styles = readFileSync('src/app/features/foro/forum-categories.scss', 'utf8');
    const page = styles.match(/\.page\s*\{[^}]*\}/)?.[0] ?? '';
    const card = styles.match(/\.forum-card\s*\{[^}]*\}/)?.[0] ?? '';
    expect(page).toContain('padding-block: var(--section-gap)');
    expect(card).toContain('padding-block: var(--section-gap)');
    expect(card).toContain('border-top: var(--border-width) solid var(--border)');
    expect(card).not.toContain('background: var(--surface)');
    expect(card).not.toContain('border-radius');
  });
});
