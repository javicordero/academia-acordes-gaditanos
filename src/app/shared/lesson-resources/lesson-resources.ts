import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export interface PdfResource { id: string; title: string; kind: 'pdf' }
export interface UploadReservation { resourceId: string; path: string; token: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@Injectable({ providedIn: 'root' })
export class LessonResources {
  private readonly client = inject(SUPABASE_CLIENT);
  private async invoke(body: object): Promise<any> {
    if (!this.client) throw new Error('Servicio no configurado');
    const { data, error } = await this.client.functions.invoke('lesson-resources', { body });
    if (error) {
      // Una versión anterior del handler responde 400 para operaciones desconocidas.
      if ('operation' in body && body.operation === 'prepare-upload' && 'context' in error && error.context instanceof Response && error.context.status === 400) {
        try { if ((await error.context.clone().json()).error === 'Solicitud inválida') throw new Error('No se aceptó la solicitud; la subida podría no estar activada en este entorno.'); }
        catch (e) { if (e instanceof Error && e.message.startsWith('No se aceptó')) throw e; }
      }
      throw new Error('No se pudo completar la operación. Comprueba conexión y permisos.');
    }
    return data;
  }
  async list(lessonId: string): Promise<PdfResource[]> {
    const data = await this.invoke({ operation: 'list', lessonId });
    if (!Array.isArray(data?.items) || !data.items.every((x: any) => uuid.test(x.id) && typeof x.title === 'string' && x.kind === 'pdf')) throw new Error('Respuesta inválida');
    return data.items;
  }
  async download(lessonId: string, resourceId: string): Promise<string> {
    const data = await this.invoke({ operation: 'download', lessonId, resourceId });
    if (typeof data?.downloadUrl !== 'string') throw new Error('Respuesta inválida');
    let url: URL;
    try { url = new URL(data.downloadUrl); } catch { throw new Error('Respuesta inválida'); }
    if (url.username || url.password || (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Respuesta inválida');
    return data.downloadUrl;
  }
  async prepare(courseId: string, lessonId: string, title: string, file: File): Promise<UploadReservation> {
    const data = await this.invoke({ operation: 'prepare-upload', lessonId, title, fileName: file.name, fileSize: file.size, mimeType: file.type });
    if (!uuid.test(courseId) || !uuid.test(lessonId) || !uuid.test(data?.resourceId) || data.path !== `${courseId}/${lessonId}/${data.resourceId}/file.pdf` || typeof data.token !== 'string' || !data.token || typeof data.signedUrl !== 'string' || !data.signedUrl) throw new Error('Respuesta inválida');
    return { resourceId: data.resourceId, path: data.path, token: data.token };
  }
  async upload(reservation: UploadReservation, file: File): Promise<void> {
    if (!this.client) throw new Error('Servicio no configurado');
    const { error } = await this.client.storage.from('lesson-pdfs').uploadToSignedUrl(reservation.path, reservation.token, file, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error('No se pudo confirmar la subida');
  }
  async finalize(lessonId: string, resourceId: string): Promise<void> {
    const data = await this.invoke({ operation: 'finalize-upload', lessonId, resourceId });
    if (data?.resourceId !== resourceId || data?.finalized !== true) throw new Error('Respuesta inválida');
  }
}
