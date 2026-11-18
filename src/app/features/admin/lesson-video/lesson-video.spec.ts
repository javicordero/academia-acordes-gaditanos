import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { LessonVideo } from './lesson-video';

const lesson = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const video = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const library = '901234';
const apiKey = 'clave-ficticia-de-prueba';

function failure(status: number): unknown {
  return Object.assign(new Error('HTTP'), { context: { status } });
}

describe('LessonVideo', () => {
  const invoke = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: SUPABASE_CLIENT, useValue: { functions: { invoke } } }],
    });
  });

  async function setup(lessonId = lesson) {
    const fixture = TestBed.createComponent(LessonVideo);
    fixture.componentRef.setInput('lessonId', lessonId);
    fixture.componentRef.setInput('courseId', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    fixture.componentRef.setInput('lessonTitle', 'Lección de prueba');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function reveal(fixture: ComponentFixture<LessonVideo>) {
    fixture.componentInstance.reveal();
    fixture.detectChanges();
  }

  it('vincula solo tras pulsar y muestra el resultado sin GUID ni metadatos privados', async () => {
    invoke.mockResolvedValue({
      data: { linkage: 'linked', status: 'ready', provider_video_id: video, library_id: library, apiKey },
      error: null,
    });
    const fixture = await setup();
    expect(invoke).not.toHaveBeenCalled();
    reveal(fixture);
    expect(fixture.componentInstance.state()).toBe('sin-video');
    const input = fixture.nativeElement.querySelector('#video-guid') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    fixture.detectChanges();
    expect(invoke).toHaveBeenCalledWith('link-lesson-video', {
      body: { lessonId: lesson, videoId: video },
    });
    expect(fixture.componentInstance.state()).toBe('vinculado');
    expect(fixture.nativeElement.querySelector('[role=status][aria-live=polite]').textContent).toContain('vinculado');
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain(video);
    expect(text).not.toContain(library);
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain('provider_video_id');
  });

  it('identifica el vínculo ya existente y el estado de procesamiento', async () => {
    invoke.mockResolvedValue({ data: { linkage: 'linked_yet', status: 'processing' }, error: null });
    const fixture = await setup();
    reveal(fixture);
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('vinculado');
    expect(fixture.nativeElement.textContent).toContain('ya existente');
    expect(fixture.nativeElement.textContent).toContain('en procesamiento');
  });

  it('distingue 403, 503 y 502 con mensajes honestos y role=alert', async () => {
    const cases: Array<[number, string]> = [
      [403, 'permisos'],
      [503, 'no tiene configurada'],
      [502, 'No se pudo verificar'],
    ];
    for (const [status, text] of cases) {
      invoke.mockResolvedValueOnce({ data: null, error: failure(status) });
      const fixture = await setup();
      reveal(fixture);
      fixture.componentInstance.videoId = video;
      await fixture.componentInstance.link();
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe(status === 503 ? 'sin-config' : 'error');
      expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(text);
      expect(fixture.nativeElement.textContent).not.toContain('HTTP');
    }
  });

  it('no invoca con un GUID inválido y lo marca accesiblemente', async () => {
    const fixture = await setup();
    reveal(fixture);
    fixture.componentInstance.videoId = 'no-es-un-guid';
    await fixture.componentInstance.link();
    fixture.detectChanges();
    expect(invoke).not.toHaveBeenCalled();
    expect(fixture.componentInstance.invalidGuid()).toBe(true);
    const input = fixture.nativeElement.querySelector('#video-guid') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('video-guid-error');
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.componentInstance.state()).toBe('error');
  });

  it('deshabilita la vinculación sin lessonId guardado y explica por qué', async () => {
    const fixture = await setup('');
    expect(fixture.componentInstance.canEdit()).toBe(false);
    expect(fixture.nativeElement.querySelector('#video-guid')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Guarda primero la lección');
    fixture.componentInstance.reveal();
    await fixture.componentInstance.link();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('no guarda nada si el cliente no está configurado', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE_CLIENT, useValue: null }] });
    const fixture = await setup();
    reveal(fixture);
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    fixture.detectChanges();
    expect(invoke).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('sin-config');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('no está configurada');
  });

  it('no expone mensajes de error del servidor', async () => {
    invoke.mockResolvedValue({ data: null, error: failure(500) });
    const fixture = await setup();
    reveal(fixture);
    fixture.componentInstance.videoId = video;
    await fixture.componentInstance.link();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('HTTP');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('No se pudo completar');
  });
});
