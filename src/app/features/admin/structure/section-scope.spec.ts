import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { StructureRepository } from '../structure-repository';

it('actualiza un bloque limitado por id y curso sin alterar su posición', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'section' }, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn();
  eq.mockReturnValue({ eq, select });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { from } }] });
  const section = { id: 'section', course_id: 'course', title: 'Antes', summary: null, position: 4 };
  await TestBed.inject(StructureRepository).saveSection('course', { title: 'Después', summary: null }, 99, section);
  expect(from).toHaveBeenCalledWith('course_sections');
  expect(update).toHaveBeenCalledWith({ title: 'Después', summary: null });
  expect(eq).toHaveBeenCalledWith('id', 'section');
  expect(eq).toHaveBeenCalledWith('course_id', 'course');
});
