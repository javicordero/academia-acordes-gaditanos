import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { PerfilRepository } from './perfil-repository';

describe('PerfilRepository', () => {
  function setup(result: unknown) {
    const calls: unknown[][] = [];
    const query = {
      select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; },
      update: (...args: unknown[]) => { calls.push(['update', ...args]); return query; },
      eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
      maybeSingle: () => Promise.resolve(result),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: {
      from: (table: string) => { calls.push(['from', table]); return query; },
    }}] });
    return { repo: TestBed.inject(PerfilRepository), calls };
  }

  it('consulta únicamente el nombre del usuario indicado', async () => {
    const { repo, calls } = setup({ data: { display_name: null }, error: null });
    expect(await repo.load('u1')).toBeNull();
    expect(calls).toEqual([['from', 'profiles'], ['select', 'display_name'], ['eq', 'id', 'u1']]);
  });

  it('actualiza solo display_name y comprueba la fila devuelta', async () => {
    const { repo, calls } = setup({ data: { display_name: 'Nombre' }, error: null });
    expect(await repo.save('u1', 'Nombre')).toBe('Nombre');
    expect(calls).toEqual([['from', 'profiles'], ['update', { display_name: 'Nombre' }],
      ['eq', 'id', 'u1'], ['select', 'display_name']]);
  });

  it.each([{ data: null, error: null }, { data: null, error: {} }])('rechaza errores o filas ausentes', async result => {
    const { repo } = setup(result);
    await expect(repo.load('u1')).rejects.toThrow('load');
    await expect(repo.save('u1', null)).rejects.toThrow('save');
  });

  it('rechaza configuración ausente', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const repo = TestBed.inject(PerfilRepository);
    await expect(repo.load('u1')).rejects.toThrow('unconfigured');
    await expect(repo.save('u1', null)).rejects.toThrow('unconfigured');
  });
});
