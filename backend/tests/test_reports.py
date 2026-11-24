"""
Tests for Citizen SOS Report Ingestion and Media Processing.
"""
import io
import pytest


@pytest.mark.asyncio
async def test_report_ingestion_immediate_acknowledgment(client):
    report_data = {
        "emergency_category": "Flood",
        "description": "Rising floodwaters reported entering the apartment lobby.",
        "latitude": 37.7810,
        "longitude": -122.4120,
        "people_affected": 2,
        "people_trapped": 0,
        "reporter_safety_status": "AT_RISK",
        "submission_source": "APP",
    }
    res = await client.post("/api/v1/reports", json=report_data)
    assert res.status_code == 201
    data = res.json()
    assert "report_id" in data
    assert data["initial_status"] == "SUBMITTED"
    assert "confirmation" in data

    # Fetch report by ID
    get_res = await client.get(f"/api/v1/reports/{data['report_id']}")
    assert get_res.status_code == 200
    rep = get_res.json()
    assert rep["emergency_category"] == "Flood"
    assert rep["latitude"] == 37.7810
    assert rep["longitude"] == -122.4120


@pytest.mark.asyncio
async def test_media_upload_and_hashing(client):
    # Create report first
    report_data = {
        "emergency_category": "Fire",
        "description": "Thick smoke visible from warehouse roof.",
        "latitude": 37.7750,
        "longitude": -122.4180,
    }
    r = await client.post("/api/v1/reports", json=report_data)
    report_id = r.json()["report_id"]

    # Upload test image
    file_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xFF\xC0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xFF\xDA\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xFF\xD9"
    files = {"file": ("smoke_roof.jpg", io.BytesIO(file_bytes), "image/jpeg")}

    media_res = await client.post(f"/api/v1/reports/{report_id}/media", files=files)
    assert media_res.status_code == 201
    media_data = media_res.json()
    assert media_data["media_type"] == "IMAGE"
    assert len(media_data["sha256_hash"]) == 64
    assert media_data["processing_status"] in ["COMPLETED", "PROCESSING"]
