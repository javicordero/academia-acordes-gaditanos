import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { LessonMaterials } from './lesson-materials';

const course = '11111111-1111-1111-1111-111111111111', lesson = '22222222-2222-2222-2222-222222222222', id = '33333333-3333-3333-3333-333333333333';
describe('LessonMaterials', () => {
  const session = signal<any>({user:{id:'user'}});
  const service = {list:vi.fn(),prepare:vi.fn(),upload:vi.fn(),finalize:vi.fn()};
  beforeEach(() => { vi.resetAllMocks(); session.set({user:{id:'user'}}); service.list.mockResolvedValue([]); service.prepare.mockResolvedValue({resourceId:id,path:'path',token:'token'}); service.upload.mockResolvedValue(undefined); service.finalize.mockResolvedValue(undefined); TestBed.configureTestingModule({providers:[{provide:AuthService,useValue:{session}},{provide:LessonResources,useValue:service}]}); });
  async function setup() { const fixture = TestBed.createComponent(LessonMaterials); fixture.componentRef.setInput('courseId',course); fixture.componentRef.setInput('lessonId',lesson); fixture.componentRef.setInput('lessonTitle','Lección'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); return fixture; }
  function fill(c: LessonMaterials) { c.title='Título'; c.selectFile({target:{files:[new File(['pdf'],'a.pdf',{type:'application/pdf'})]}} as unknown as Event); }
  it('carga una vez por contexto y no recarga por una renovación de sesión del mismo usuario', async () => {
    const fixture = await setup();
    expect(service.list).toHaveBeenCalledTimes(1);
    session.set({user:{id:'user'}}); fixture.detectChanges(); await fixture.whenStable();
    expect(service.list).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('lessonId','44444444-4444-4444-4444-444444444444'); fixture.detectChanges(); await fixture.whenStable();
    expect(service.list).toHaveBeenCalledTimes(2);
  });
  it('bloquea nuevas subidas hasta recargar la lista tras finalizar', async () => {
    const fixture = await setup(), c = fixture.componentInstance; fill(c);
    service.list.mockRejectedValueOnce(new Error('offline'));
    await c.submit(); fixture.detectChanges();
    expect(c.publishedPendingRefresh()).toBe(id);
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Reintentar validación');
    await c.submit(); expect(service.prepare).toHaveBeenCalledTimes(1); expect(service.upload).toHaveBeenCalledTimes(1);
    service.list.mockRejectedValueOnce(new Error('offline')); await c.reload();
    expect(c.publishedPendingRefresh()).toBe(id);
    await c.reload(); fixture.detectChanges();
    expect(c.publishedPendingRefresh()).toBeNull(); expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(false);
    expect(service.finalize).toHaveBeenCalledTimes(1);
  });
  it('indica errores de campos accesibles y rechaza archivos y títulos inválidos', async () => {
    const fixture = await setup(), c = fixture.componentInstance;
    const invalidFiles = [
      new File([], 'a.pdf', {type:'application/pdf'}),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'a.pdf', {type:'application/pdf'}),
      new File(['x'], 'a.pdf', {type:'text/plain'}),
      new File(['x'], 'á.pdf', {type:'application/pdf'}),
    ];
    for (const file of invalidFiles) {
      c.title='Título'; c.selectFile({target:{files:[file]}} as unknown as Event); await c.submit();
      expect(c.invalidFile()).toBe(true);
    }
    fill(c); c.title='mal\u0001'; await c.submit(); fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('#pdf-title');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toBe('pdf-title-error');
    c.title=''; c.selectFile({target:{files:[]}} as unknown as Event); await c.submit(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#pdf-file').getAttribute('aria-describedby')).toBe('pdf-file-error');
    expect(service.prepare).not.toHaveBeenCalled();
  });
  it('permite reintentar finalización con el mismo ID sin repetir subida', async () => {
    const fixture = await setup(), c = fixture.componentInstance; fill(c); service.finalize.mockRejectedValueOnce(new Error());
    await c.submit(); expect(c.pending()).toBe(id); expect(c.status()).not.toContain('validado');
    await c.retry(); expect(service.finalize).toHaveBeenCalledTimes(2); expect(service.finalize).toHaveBeenLastCalledWith(lesson,id); expect(service.upload).toHaveBeenCalledTimes(1); expect(c.status()).toContain('validado');
  });
  it('un fallo ambiguo de subida no finaliza automáticamente', async () => {
    const fixture = await setup(), c = fixture.componentInstance; fill(c); service.upload.mockRejectedValueOnce(new Error()); await c.submit();
    expect(service.finalize).not.toHaveBeenCalled(); expect(c.pending()).toBe(id); expect(c.error()).toContain('no está confirmada');
  });
  it('bloquea duplicados e ignora respuesta al cambiar de lección', async () => {
    const fixture = await setup(), c = fixture.componentInstance; fill(c); let resolve!: (v: any) => void;
    service.prepare.mockReturnValueOnce(new Promise(r => resolve=r)); const pending = c.submit(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true); await c.submit(); expect(service.prepare).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('lessonId','44444444-4444-4444-4444-444444444444'); fixture.detectChanges();
    resolve({resourceId:id,path:'path',token:'token'}); await pending; expect(service.upload).not.toHaveBeenCalled(); expect(c.pending()).toBeNull();
  });
  it('ignora respuesta tras cerrar sesión', async () => {
    const fixture = await setup(), c = fixture.componentInstance; fill(c); let resolve!: (v: any) => void;
    service.prepare.mockReturnValueOnce(new Promise(r => resolve=r)); const pending = c.submit(); session.set(null); fixture.detectChanges(); resolve({resourceId:id,path:'path',token:'token'}); await pending; expect(service.upload).not.toHaveBeenCalled();
  });
});
