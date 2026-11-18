import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { MisCursosCheckoutRepository } from './mis-cursos-checkout-repository';

interface Result {
  data: unknown;
  error: { message: string } | null;
}
interface Filters {
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  in: Record<string, unknown[]>;
}
type Handler = (filters: Filters) => Result;

const user = '00000000-0000-0000-0000-000000000001';
const order = '40000000-0000-0000-0000-000000000001';
const courseA = '10000000-0000-0000-0000-000000000001';
const courseB = '10000000-0000-0000-0000-000000000002';

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (): Result => ({ data: null, error: { message: 'error' } });

/** Cliente falso: aplica los filtros de PostgREST y cuenta cada lectura. */
function fakeClient(handlers: Record<string, Handler>) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const filters: Filters = { eq: {}, is: {}, in: {} };
    const result = () => (handlers[table] ?? (() => ok([])))(filters);
    const chain: Record<string, unknown> = {
      select: vi.fn((columns: string) => {
        calls.push([table, 'select', columns]);
        return chain;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([table, 'eq', column, value]);
        filters.eq[column] = value;
        return chain;
      }),
      is: vi.fn((column: string, value: unknown) => {
        calls.push([table, 'is', column, value]);
        filters.is[column] = value;
        return chain;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        calls.push([table, 'in', column, values]);
        filters.in[column] = values;
        return chain;
      }),
      // `returns` devuelve el propio builder: encadenable y también awaitable.
      returns: vi.fn(() => chain),
      then: vi.fn((resolve, reject) => Promise.resolve(result()).then(resolve, reject)),
      maybeSingle: vi.fn(() => Promise.resolve(result()).then((value) => ({
        data: Array.isArray(value.data) ? (value.data[0] ?? null) : value.data,
        error: value.error,
      }))),
    };
    return chain;
  });
  return { from, calls };
}

function handlersFor(options: {
  status?: string;
  orderExists?: boolean;
  orderError?: boolean;
  items?: string[];
  itemsError?: boolean;
  rights?: string[];
  rightsError?: boolean;
} = {}) {
  return {
    orders: (): Result => options.orderError
      ? fail()
      : ok(options.orderExists === false ? [] : [{ id: order, status: options.status ?? 'paid' }]),
    order_items: (filters: Filters): Result => options.itemsError
      ? fail()
      : ok((options.items ?? [courseB, courseA])
        .filter(() => filters.eq['order_id'] === order)
        .map((course_id) => ({ course_id }))),
    entitlements: (filters: Filters): Result => options.rightsError
      ? fail()
      : ok((options.rights ?? [courseA])
        .filter((id) =>
          filters.eq['user_id'] === user
          && filters.is['revoked_at'] === null
          && (filters.in['course_id'] as string[]).includes(id))
        .map((course_id) => ({ course_id }))),
  };
}

function setup(options: Parameters<typeof handlersFor>[0] = {}) {
  TestBed.resetTestingModule();
  const client = fakeClient(handlersFor(options));
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: client }] });
  return { repo: TestBed.inject(MisCursosCheckoutRepository), calls: client.calls };
}

describe('MisCursosCheckoutRepository', () => {
  it('paid con derecho vigente confirma solo el curso vinculado con derecho', async () => {
    const { repo, calls } = setup();
    await expect(repo.verify(order, user)).resolves.toEqual({ kind: 'confirmed', courseId: courseA });
    expect(calls).toContainEqual(['orders', 'eq', 'id', order]);
    expect(calls).toContainEqual(['orders', 'eq', 'user_id', user]);
    expect(calls).toContainEqual(['order_items', 'eq', 'order_id', order]);
    expect(calls).toContainEqual(['entitlements', 'eq', 'user_id', user]);
    expect(calls).toContainEqual(['entitlements', 'is', 'revoked_at', null]);
    expect(calls).toContainEqual(['entitlements', 'in', 'course_id', [courseA, courseB]]);
    // Solo lecturas: el retorno no escribe pedido, derecho ni progreso.
    expect(calls.some((call) => ['insert', 'update', 'delete', 'upsert'].includes(String(call[1]))))
      .toBe(false);
  });

  it('pendiente no concede acceso', async () => {
    const { repo } = setup({ status: 'pending', rights: [] });
    await expect(repo.verify(order, user)).resolves.toEqual({ kind: 'pending' });
  });

  it('paid sin derecho activo (revocado o ausente) no confirma', async () => {
    const absent = setup({ rights: [] });
    await expect(absent.repo.verify(order, user)).resolves.toEqual({ kind: 'notavailable' });
    const otherCourse = setup({ rights: ['20000000-0000-0000-0000-000000000009'] });
    await expect(otherCourse.repo.verify(order, user)).resolves.toEqual({ kind: 'notavailable' });
  });

  it('pedido ajeno o inexistente responde igual sin consultar sus líneas', async () => {
    const { repo, calls } = setup({ orderExists: false });
    await expect(repo.verify(order, user)).resolves.toEqual({ kind: 'notavailable' });
    expect(calls.some((call) => call[0] !== 'orders')).toBe(false);
  });

  it('UUID inválido o usuario ausente no consulta la BD', async () => {
    const { repo, calls } = setup();
    await expect(repo.verify('no-uuid', user)).resolves.toEqual({ kind: 'notavailable' });
    await expect(repo.verify(order, '')).resolves.toEqual({ kind: 'notavailable' });
    expect(calls).toHaveLength(0);
  });

  it('un error de lectura es reintentable y no se disfraza de confirmación', async () => {
    for (const options of [{ orderError: true }, { itemsError: true }, { rightsError: true }]) {
      const { repo } = setup(options);
      await expect(repo.verify(order, user)).resolves.toEqual({ kind: 'error' });
    }
  });

  it('una conexión no configurada no concede acceso', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    await expect(TestBed.inject(MisCursosCheckoutRepository).verify(order, user))
      .resolves.toEqual({ kind: 'notavailable' });
  });
});
