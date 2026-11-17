import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { LessonResources } from './lesson-resources';

const course = '11111111-1111-1111-1111-111111111111', lesson = '22222222-2222-2222-2222-222222222222', id = '33333333-3333-3333-3333-333333333333';
const path = `${course}/${lesson}/${id}/file.pdf`;
describe('LessonResources', () => {
  const invoke = vi.fn(), uploadToSignedUrl = vi.fn(), from = vi.fn(() => ({ uploadToSignedUrl }));
  let service: LessonResources;
  beforeEach(() => { vi.resetAllMocks(); from.mockReturnValue({ uploadToSignedUrl }); TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: { functions: { invoke }, storage: { from } } }] }); service = TestBed.inject(LessonResources); });
  it('usa contratos del handler y Storage sin sobrescritura', async () => {
    const file = new File(['%PDF'], 'material.pdf', { type: 'application/pdf' });
    invoke.mockResolvedValueOnce({ data: { resourceId: id, path, token: 'scoped', signedUrl: 'signed' }, error: null }).mockResolvedValueOnce({ data: { resourceId: id, finalized: true }, error: null });
    uploadToSignedUrl.mockResolvedValue({ error: null });
    const r = await service.prepare(course, lesson, 'Título', file); await service.upload(r, file); await service.finalize(lesson,id);
    expect(invoke).toHaveBeenNthCalledWith(1, 'lesson-resources', { body: { operation:'prepare-upload', lessonId:lesson, title:'Título', fileName:file.name, fileSize:file.size, mimeType:file.type } });
    expect(from).toHaveBeenCalledWith('lesson-pdfs');
    expect(uploadToSignedUrl).toHaveBeenCalledWith(path, 'scoped', file, { contentType:'application/pdf', upsert:false });
    expect(invoke).toHaveBeenNthCalledWith(2, 'lesson-resources', { body: { operation:'finalize-upload', lessonId:lesson, resourceId:id } });
  });
  it('rechaza rutas y respuestas de finalización inválidas', async () => {
    invoke.mockResolvedValueOnce({ data:{resourceId:id,path:'otro',token:'x',signedUrl:'x'}, error:null }).mockResolvedValueOnce({data:{},error:null});
    await expect(service.prepare(course,lesson,'Título',new File(['x'],'a.pdf',{type:'application/pdf'}))).rejects.toThrow();
    await expect(service.finalize(lesson,id)).rejects.toThrow(); expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
  it('propaga fallo de lista y prepara sin subir', async () => {
    invoke.mockResolvedValue({error:new Error('fallo')});
    await expect(service.list(lesson)).rejects.toThrow();
    await expect(service.prepare(course,lesson,'x',new File(['x'],'a.pdf',{type:'application/pdf'}))).rejects.toThrow();
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
  it('no afirma que la subida esté desactivada ante un 400 genérico', async () => {
    invoke.mockResolvedValue({error:{context:new Response(JSON.stringify({error:'Solicitud inválida'}),{status:400})}});
    await expect(service.prepare(course,lesson,'x',new File(['x'],'a.pdf',{type:'application/pdf'}))).rejects.toThrow('podría no estar activada');
  });
  it('valida el contrato de descarga y rechaza esquemas inseguros', async () => {
    invoke.mockResolvedValueOnce({data:{downloadUrl:'https://example.invalid/storage/signed'},error:null})
      .mockResolvedValueOnce({data:{downloadUrl:'javascript:alert(1)'},error:null});
    await expect(service.download(lesson,id)).resolves.toBe('https://example.invalid/storage/signed');
    expect(invoke).toHaveBeenCalledWith('lesson-resources',{body:{operation:'download',lessonId:lesson,resourceId:id}});
    await expect(service.download(lesson,id)).rejects.toThrow();
  });
});
describe('LessonResources sin SDK', () => {
  it('falla de forma explícita', async () => { TestBed.configureTestingModule({providers:[{provide:SUPABASE_CLIENT,useValue:null}]}); await expect(TestBed.inject(LessonResources).list(lesson)).rejects.toThrow(); });
});
