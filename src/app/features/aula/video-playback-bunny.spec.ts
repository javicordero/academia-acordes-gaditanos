import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import {
  PLAYBACK_NOW,
  PlaybackResponseError,
  BunnyStreamPlaybackProvider,
  validatePlaybackPayload,
} from './video-playback-bunny';

const NOW = 1_700_000_000_000;
const LESSON = '30000000-0000-0000-0000-000000000001';
const GUID = 'abcdef00-1111-2222-3333-444455556666';
const BASE = `https://player.mediadelivery.net/embed/812678/${GUID}`;
const UNSIGNED_URL = BASE;
const SIGNED_URL = `${BASE}?token=${'a'.repeat(64)}&expires=1700000900`;
const AVISO = 'Aviso del servidor sobre la reproducción.';

function providerFor(data: unknown) {
  const invoke = vi.fn(async () => ({ data, error: null }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE_CLIENT, useValue: { functions: { invoke } } },
      { provide: PLAYBACK_NOW, useValue: () => NOW },
    ],
  });
  return { provider: TestBed.inject(BunnyStreamPlaybackProvider), invoke };
}

describe('adaptador Bunny: validación de la respuesta 200', () => {
  it('acepta expiresAt 0 con unsigned=true y devuelve expiresAt null (sin temporizador)', () => {
    const valid = validatePlaybackPayload(
      { embedUrl: UNSIGNED_URL, expiresAt: 0, notice: AVISO, unsigned: true },
      NOW,
    );
    expect(valid).toEqual({ embedUrl: UNSIGNED_URL, expiresAt: null, notice: AVISO });
  });

  it('rechaza expiresAt 0 sin unsigned', () => {
    expect(validatePlaybackPayload({ embedUrl: UNSIGNED_URL, expiresAt: 0, notice: AVISO }, NOW)).toBeNull();
    expect(validatePlaybackPayload(
      { embedUrl: UNSIGNED_URL, expiresAt: 0, notice: AVISO, unsigned: false },
      NOW,
    )).toBeNull();
  });

  it('rechaza unsigned=true con caducidad futura', () => {
    expect(validatePlaybackPayload(
      { embedUrl: SIGNED_URL, expiresAt: 1_700_000_900, notice: AVISO, unsigned: true },
      NOW,
    )).toBeNull();
  });

  it('rechaza un embed sin firma con parámetros en la URL', () => {
    expect(validatePlaybackPayload(
      { embedUrl: `${UNSIGNED_URL}?token=${'a'.repeat(64)}`, expiresAt: 0, notice: AVISO, unsigned: true },
      NOW,
    )).toBeNull();
  });

  it('conserva la firma con expiración futura y unsigned ausente o false', () => {
    for (const extra of [{}, { unsigned: false }]) {
      expect(validatePlaybackPayload(
        { embedUrl: SIGNED_URL, expiresAt: 1_700_000_900, notice: AVISO, ...extra },
        NOW,
      )).toEqual({ embedUrl: SIGNED_URL, expiresAt: 1_700_000_900_000, notice: AVISO });
    }
  });

  it('rechaza valores inesperados de unsigned y una firma sin token', () => {
    expect(validatePlaybackPayload(
      { embedUrl: SIGNED_URL, expiresAt: 1_700_000_900, notice: AVISO, unsigned: 'true' },
      NOW,
    )).toBeNull();
    expect(validatePlaybackPayload(
      { embedUrl: BASE, expiresAt: 1_700_000_900, notice: AVISO },
      NOW,
    )).toBeNull();
  });
});

describe('BunnyStreamPlaybackProvider: modo DEV sin firma', () => {
  it('entrega el aviso del servidor sin exponer expiresAt en la fuente ni estado caducado', async () => {
    const { provider } = providerFor({ embedUrl: UNSIGNED_URL, expiresAt: 0, notice: AVISO, unsigned: true });
    const ticket = await provider.requestTicket(LESSON);
    expect(ticket?.expiresAt).toBeNull();
    expect(ticket?.source.notice).toBe(AVISO);
    expect(ticket?.source.expiresAt).toBeUndefined();
    expect(await provider.expiresAt(LESSON)).toBeNull();
  });

  it('cierra el reproductor si el payload sin firma no cumple el contrato', async () => {
    const sinFlag = providerFor({ embedUrl: UNSIGNED_URL, expiresAt: 0, notice: AVISO });
    await expect(sinFlag.provider.requestTicket(LESSON)).rejects.toBeInstanceOf(PlaybackResponseError);

    const conCaducidad = providerFor({
      embedUrl: SIGNED_URL,
      expiresAt: 1_700_000_900,
      notice: AVISO,
      unsigned: true,
    });
    await expect(conCaducidad.provider.requestTicket(LESSON)).rejects.toBeInstanceOf(PlaybackResponseError);
  });

  it('mantiene la caducidad de la firma firmada', async () => {
    const { provider } = providerFor({ embedUrl: SIGNED_URL, expiresAt: 1_700_000_900, notice: AVISO });
    const ticket = await provider.requestTicket(LESSON);
    expect(ticket?.expiresAt).toBe(1_700_000_900_000);
    expect(ticket?.source.expiresAt).toBe(1_700_000_900_000);
  });
});
