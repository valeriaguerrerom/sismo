import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStations, getTravelTimes, getSynthetic, getWaveform, ApiError } from './api3d';

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe('api3d', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('getStations devuelve el array de estaciones', async () => {
    global.fetch = mockFetchOnce(200, { estaciones: [{ code: 'PAS2' }, { code: 'TUM' }] }) as typeof fetch;
    const res = await getStations();
    expect(res).toHaveLength(2);
    expect(res[0].code).toBe('PAS2');
  });

  it('getTravelTimes hace POST con el cuerpo correcto', async () => {
    const spy = mockFetchOnce(200, { modelo_usado: 'homogeneous', estaciones: [] });
    global.fetch = spy as typeof fetch;
    await getTravelTimes({ lat: 1.2, lon: -77.3, depth_km: 15 });
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/travel-times');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(init?.body as string);
    expect(sent.lat).toBe(1.2);
    expect(sent.model).toBe('homogeneous'); // default aplicado
  });

  it('getSynthetic aplica defaults de malla', async () => {
    const spy = mockFetchOnce(200, { t: [], north: [], east: [], vertical: [], tP_detectado: 1, tS_detectado: 2, cfl_ok: true, tiempo_computo_ms: 10, nx: 200, nz: 150, dx_m: 100, dt_s: 0.02 });
    global.fetch = spy as typeof fetch;
    await getSynthetic({ vp: 3500, vs: 2000, density: 2600, magnitude: 5, depth_km: 15, source_type: 'tectonic', distance_km: 3 });
    const sent = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(sent.nx).toBe(200);
    expect(sent.nz).toBe(150);
    expect(sent.dt_max_s).toBe(0.02);
  });

  it('getWaveform arma la URL con estación y query de filtro', async () => {
    const spy = mockFetchOnce(200, { event_id: 'E1', station: 'PAS2', t: [], canales: {}, fs: 100, starttime_utc: '', filtro: { freqmin: 1, freqmax: 10 } });
    global.fetch = spy as typeof fetch;
    await getWaveform('CM_M4_2023', 'PAS2', { freqmin: 2, freqmax: 8 });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/api/waveforms/CM_M4_2023/PAS2');
    expect(url).toContain('freqmin=2');
    expect(url).toContain('freqmax=8');
  });

  it('lanza ApiError con el detalle del backend en error HTTP', async () => {
    global.fetch = mockFetchOnce(404, { detail: 'Evento no encontrado' }) as typeof fetch;
    await expect(getWaveform('X', 'Y')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Evento no encontrado',
    });
  });

  it('lanza ApiError status 0 si no hay conexión', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as typeof fetch;
    const err = await getStations().catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });
});
