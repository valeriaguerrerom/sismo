// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseQuakemlLocal } from './quakeml';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">
  <eventParameters publicID="smi:sgc.gov.co/catalog">
    <event publicID="smi:sgc.gov.co/event/1">
      <description><text>Pasto, Nariño</text></description>
      <type>earthquake</type>
      <origin publicID="smi:sgc.gov.co/origin/1">
        <time><value>2024-08-23T03:04:05.000000Z</value></time>
        <latitude><value>1.2136</value></latitude>
        <longitude><value>-77.2811</value></longitude>
        <depth><value>15000</value></depth>
        <creationInfo><agencyID>SGC</agencyID></creationInfo>
      </origin>
      <magnitude publicID="smi:sgc.gov.co/mag/1">
        <mag><value>3.4</value></mag>
        <type>ML</type>
      </magnitude>
    </event>
    <event publicID="smi:sgc.gov.co/event/2">
      <description><text>Volcán Galeras</text></description>
      <origin publicID="smi:sgc.gov.co/origin/2">
        <time><value>2006-01-04T06:56:00Z</value></time>
        <latitude><value>1.2216</value></latitude>
        <longitude><value>-77.3742</value></longitude>
        <depth><value>5000</value></depth>
      </origin>
      <magnitude publicID="smi:sgc.gov.co/mag/2"><mag><value>2.1</value></mag></magnitude>
    </event>
    <event publicID="smi:sgc.gov.co/event/3">
      <description><text>Sin origen</text></description>
    </event>
  </eventParameters>
</q:quakeml>`;

describe('parseQuakemlLocal (RF-16, respaldo en navegador)', () => {
  it('extrae los eventos válidos con el esquema de seismic_events', () => {
    const res = parseQuakemlLocal(SAMPLE);
    expect(res.total_en_archivo).toBe(3);
    expect(res.importados).toBe(2);
    expect(res.descartados).toBe(1);
    expect(res.origen).toBe('local');

    const [tect, volc] = res.eventos;
    expect(tect).toMatchObject({
      event_date: '2024-08-23',
      event_time: '03:04:05',
      magnitude: 3.4,
      magnitude_type: 'ML',
      depth_km: 15,
      latitude: 1.2136,
      longitude: -77.2811,
      location_name: 'Pasto, Nariño',
      event_type: 'tectonic',
      source: 'SGC',
      notes: 'smi:sgc.gov.co/event/1',
    });
    expect(volc.event_type).toBe('volcanic');
    expect(volc.depth_km).toBe(5);
  });

  it('rechaza XML inválido', () => {
    expect(() => parseQuakemlLocal('<esto no cierra')).toThrow();
  });

  it('rechaza XML sin eventos', () => {
    expect(() => parseQuakemlLocal('<root><nada/></root>')).toThrow(/event/);
  });
});
