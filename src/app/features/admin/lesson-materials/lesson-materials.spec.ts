import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { LessonResources } from '../../../shared/lesson-resources/lesson-resources';
import { SUPABASE_CONFIG } from '../../../../environments/supabase-config';
import { LessonMaterials } from './lesson-materials';

const course = '11111111-1111-1111-1111-111111111111', lesson = '22222222-2222-2222-2222-222222222222', id = '33333333-3333-3333-3333-333333333333';
describe('LessonMaterials', () => {
  const session = signal<any>({user:{id:'user'}});
  const service = {list:vi.fn(),prepare:vi.fn(),upload:vi.fn(),finalize:vi.fn(),download:vi.fn()};
  const item = {id,title:'Material',kind:'pdf' as const};
  const url = `https://example.test/storage/v1/object/sign/lesson-pdfs/${course}/${lesson}/${id}/file.pdf?token=fake`;
  beforeEach(() => { vi.resetAllMocks(); session.set({user:{id:'user'}}); service.list.mockResolvedValue([]); service.prepare.mockResolvedValue({resourceId:id,path:'path',token:'token'}); service.upload.mockResolvedValue(undefined); service.finalize.mockResolvedValue(undefined); TestBed.configureTestingModule({providers:[{provide:AuthService,useValue:{session}},{provide:LessonResources,useValue:service},{provide:SUPABASE_CONFIG,useValue:{url:'https://example.test',publishableKey:'fake'}}]}); });
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
  it('prepara solo al pulsar y elimina el enlace tras el tiempo restante', async () => {
    service.list.mockResolvedValue([item]); service.download.mockResolvedValue(url);
    const fixture = await setup();
    expect(service.download).not.toHaveBeenCalled();
    vi.useFakeTimers();
    const started = Date.now(); let resolve!: (value: string) => void;
    service.download.mockReturnValueOnce(new Promise<string>(r => resolve = r));
    const button = fixture.nativeElement.querySelector('li button') as HTMLButtonElement;
    button.click(); expect(service.download).toHaveBeenCalledWith(lesson,id);
    vi.setSystemTime(started + 10_000); resolve(url); await Promise.resolve(); await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('li a')?.getAttribute('href')).toBe(url);
    expect(fixture.nativeElement.querySelector('li [role=status]').textContent).toContain('Descarga lista');
    vi.advanceTimersByTime(50_000); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('li a')).toBeNull();
    fixture.destroy(); vi.useRealTimers();
  });
  it('rechaza enlaces ajenos y errores sin mostrarlos', async () => {
    service.list.mockResolvedValue([item]); const fixture = await setup(), c = fixture.componentInstance;
    service.download.mockResolvedValueOnce(url.replace('example.test','elsewhere.test'));
    await c.prepareDownload(item); fixture.detectChanges();
    expect(c.links()[id]).toBeUndefined(); expect(fixture.nativeElement.querySelector('li [role=status]').textContent).toContain('No se pudo');
    service.download.mockRejectedValueOnce(new Error('Respuesta inválida'));
    await c.prepareDownload(item); expect(c.downloadErrors()[id]).toBe(true);
  });
  it('descarta respuestas y enlaces al cambiar contexto o cerrar sesión, pero no al renovar sesión', async () => {
    service.list.mockResolvedValue([item]); service.download.mockResolvedValue(url);
    const fixture = await setup(), c = fixture.componentInstance;
    await c.prepareDownload(item); session.set({user:{id:'user'}}); fixture.detectChanges();
    expect(c.links()[id]).toBe(url);
    let resolve!: (value: string) => void;
    service.download.mockReturnValueOnce(new Promise<string>(r => resolve = r));
    const pending = c.prepareDownload(item);
    fixture.componentRef.setInput('courseId','44444444-4444-4444-4444-444444444444'); fixture.detectChanges();
    resolve(url); await pending; expect(c.links()[id]).toBeUndefined();
    await fixture.whenStable(); session.set(null); fixture.detectChanges();
    expect(c.links()).toEqual({}); expect(c.downloadPending()).toEqual({});
    fixture.destroy();
  });
  it('descarta respuestas pendientes al cambiar de lección o usuario y al destruir', async () => {
    service.list.mockResolvedValue([item]);
    const fixture = await setup(), c = fixture.componentInstance;
    let resolve!: (value: string) => void;
    service.download.mockReturnValueOnce(new Promise<string>(r => resolve = r));
    const first = c.prepareDownload(item);
    fixture.componentRef.setInput('lessonId','44444444-4444-4444-4444-444444444444'); fixture.detectChanges();
    resolve(url); await first; expect(c.links()).toEqual({});
    await fixture.whenStable();
    service.download.mockReturnValueOnce(new Promise<string>(r => resolve = r));
    const second = c.prepareDownload(item); session.set({user:{id:'other'}}); fixture.detectChanges();
    resolve(url); await second; expect(c.links()).toEqual({});
    await fixture.whenStable();
    service.download.mockReturnValueOnce(new Promise<string>(r => resolve = r));
    const third = c.prepareDownload(item); fixture.destroy();
    resolve(url); await third; expect(c.links()).toEqual({});
  });
  it('usa un título genérico y una sola acción real de descarga', async () => {
    service.list.mockResolvedValue([item]);
    service.download.mockResolvedValue(url);
    const fixture = await setup(), root: HTMLElement = fixture.nativeElement;
    await fixture.componentInstance.prepareDownload(item); fixture.detectChanges();
    const heading = root.querySelector<HTMLElement>('#materials-heading')!;
    expect(heading.textContent).toContain('Materiales de la lección');
    expect(heading.textContent).not.toContain('Materiales PDF');
    expect(root.textContent).toContain('Lección: Lección');
    const downloadActions = [...root.querySelectorAll('button, a')].filter(el =>
      (el.getAttribute('aria-label') ?? el.textContent ?? '').includes('Descargar PDF'));
    expect(downloadActions).toHaveLength(1);
    expect(root.querySelectorAll('[role=status]')).toHaveLength(1);
  });
  it('explica el estado vacío sin ofrecer acciones falsas', async () => {
    const fixture = await setup(), root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('No hay materiales para esta lección.');
    expect(root.querySelector('li button, li a')).toBeNull();
  });
});
