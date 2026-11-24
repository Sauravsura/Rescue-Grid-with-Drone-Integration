"""
Tests for Final Rescue Intelligence Report and PDF Generation (Section 13).
"""
import pytest


@pytest.mark.asyncio
async def test_rescue_intelligence_report_json_and_pdf(client, officer_token):
    token, _ = officer_token
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch existing incident
    inc_res = await client.get("/api/v1/incidents", headers=headers)
    incidents = inc_res.json()
    assert len(incidents) > 0
    incident_id = incidents[0]["id"]

    # 1. Test JSON Final Report
    report_res = await client.get(f"/api/v1/incidents/{incident_id}/final-report", headers=headers)
    assert report_res.status_code == 200
    report = report_res.json()

    # Validate the 9 mandated sections
    assert "section_1_incident_identification" in report
    assert "section_2_executive_summary" in report
    assert "section_3_citizen_reports" in report
    assert "section_4_geographic_information" in report
    assert "section_5_drone_survey_findings" in report
    assert "section_6_ai_analysis" in report
    assert "section_7_suggested_rescue_planning" in report
    assert "section_8_evidence_and_audit_trail" in report
    assert "section_9_disclaimer" in report

    # 2. Test Download PDF Report
    pdf_res = await client.get(f"/api/v1/incidents/{incident_id}/final-report/pdf", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF-1.4")
    assert pdf_res.content.endswith(b"%%EOF\n")
    assert len(pdf_res.content) > 500
