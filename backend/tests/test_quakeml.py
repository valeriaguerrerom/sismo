"""Pruebas del parser QuakeML (RF-16)."""
from fastapi.testclient import TestClient

from api.quakeml import parse_quakeml_bytes
from main import app

SAMPLE_QUAKEML = """<?xml version="1.0" encoding="UTF-8"?>
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
      <type>volcanic eruption</type>
      <origin publicID="smi:sgc.gov.co/origin/2">
        <time><value>2006-01-04T06:56:00.000000Z</value></time>
        <latitude><value>1.2216</value></latitude>
        <longitude><value>-77.3742</value></longitude>
        <depth><value>5000</value></depth>
      </origin>
      <magnitude publicID="smi:sgc.gov.co/mag/2">
        <mag><value>2.1</value></mag>
      </magnitude>
    </event>
    <event publicID="smi:sgc.gov.co/event/3">
      <description><text>Sin origen</text></description>
    </event>
  </eventParameters>
</q:quakeml>
""".encode("utf-8")


def test_parse_quakeml_extrae_eventos_validos():
    res = parse_quakeml_bytes(SAMPLE_QUAKEML)
    assert res.total_en_archivo == 3
    assert res.importados == 2
    assert res.descartados == 1

    tect = res.eventos[0]
    assert tect.event_date == "2024-08-23"
    assert tect.event_time == "03:04:05"
    assert tect.magnitude == 3.4
    assert tect.magnitude_type == "ML"
    assert tect.depth_km == 15.0
    assert tect.latitude == 1.2136
    assert tect.longitude == -77.2811
    assert tect.event_type == "tectonic"
    assert tect.source == "SGC"
    assert tect.location_name == "Pasto, Nariño"

    volc = res.eventos[1]
    assert volc.event_type == "volcanic"
    assert volc.depth_km == 5.0


def test_endpoint_import_quakeml():
    client = TestClient(app)
    r = client.post(
        "/api/import/quakeml",
        files={"file": ("catalogo.xml", SAMPLE_QUAKEML, "application/xml")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["importados"] == 2
    assert body["eventos"][0]["location_name"] == "Pasto, Nariño"


def test_endpoint_rechaza_archivo_invalido():
    client = TestClient(app)
    r = client.post(
        "/api/import/quakeml",
        files={"file": ("malo.xml", b"<esto no es quakeml>", "application/xml")},
    )
    assert r.status_code == 400


def test_endpoint_rechaza_archivo_vacio():
    client = TestClient(app)
    r = client.post("/api/import/quakeml", files={"file": ("vacio.xml", b"", "application/xml")})
    assert r.status_code == 400
