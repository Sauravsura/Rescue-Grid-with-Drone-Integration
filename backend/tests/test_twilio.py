"""
Tests for Twilio Emergency Voice Hotline Integration.
"""
import pytest


@pytest.mark.asyncio
async def test_twilio_incoming_call_returns_twiml(client):
    form_data = {
        "CallSid": "CA_TEST_CALL_12345",
        "From": "+15551234567",
        "To": "+18005550199",
        "CallerCity": "Oakland",
        "CallerState": "CA",
    }
    res = await client.post("/api/v1/twilio/voice/incoming", data=form_data)
    assert res.status_code == 200
    assert "application/xml" in res.headers["content-type"]
    text = res.text
    assert "<Response>" in text
    assert "<Say" in text
    assert "<Gather" in text
    assert "<Record" in text


@pytest.mark.asyncio
async def test_twilio_process_speech_creates_emergency_report(client, officer_token):
    token, _ = officer_token
    headers = {"Authorization": f"Bearer {token}"}

    speech_data = {
        "CallSid": "CA_TEST_SPEECH_67890",
        "From": "+15559876543",
        "SpeechResult": "Major flood emergency! Water has surrounded my house on Pine Street and 2 people are trapped upstairs!",
        "Confidence": "0.94",
        "CallerCity": "Berkeley",
        "CallerState": "CA",
    }
    res = await client.post("/api/v1/twilio/voice/process-speech", data=speech_data)
    assert res.status_code == 200
    assert "application/xml" in res.headers["content-type"]
    assert "automatically fed into the emergency coordination dashboard" in res.text

    # Verify that the report was automatically registered and logged
    calls_res = await client.get("/api/v1/twilio/voice/calls", headers=headers)
    assert calls_res.status_code == 200
    calls = calls_res.json()
    matched_call = next((c for c in calls if c["call_sid"] == "CA_TEST_SPEECH_67890"), None)
    assert matched_call is not None
    assert matched_call["linked_report_id"] is not None
    assert matched_call["from_phone"] == "+15559876543"

    # Verify report content
    rep_res = await client.get(f"/api/v1/reports/{matched_call['linked_report_id']}")
    assert rep_res.status_code == 200
    rep = rep_res.json()
    assert rep["emergency_category"] == "Flood"
    assert rep["submission_source"] == "TWILIO_VOICE"
    assert rep["people_trapped"] >= 1
