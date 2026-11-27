import { readFileSync } from 'node:fs';

describe('Acabado del área pública', () => {
  const css = readFileSync('src/app/core/theme/public-pages.scss', 'utf8');

  it('limita el alcance a hosts de página explícitos, excluyendo administración y su aula de vista previa', () => {
    const hosts = css.match(/\$pages:\s*'([^']+)'/)?.[1].split(',').map(s => s.trim());
    expect(hosts).toContain('app-aula');
    expect(hosts).toContain('app-course-detail');
    expect(hosts).toContain('app-login');
    expect(hosts).toContain('app-perfil');
    expect(hosts).not.toContain('app-admin');
    expect(hosts).not.toContain('app-admin-preview');
    expect(hosts).not.toContain('app-conversation-view');
    expect(css).toContain('main > :is(#{$pages})');
  });

  it('usa tokens para foco, campos, estados deshabilitados y el hover sin movimiento', () => {
    expect(css).toContain('outline: var(--focus-ring) solid var(--focus)');
    expect(css).toContain('min-height: var(--tap-min)');
    expect(css).toContain('border: 1px solid var(--muted)');
    expect(css).toMatch(/button:disabled[^}]+opacity: 1/);
    expect(css).not.toMatch(/brightness\(|translateY\(|#[0-9a-f]{6}/i);
  });
});
