import pytest
from coordinator.app.models.incident import Incident, Ambulance
from coordinator.app.services.dispatch import dispatch_resources


def test_no_ambulance_available_handles_cleanly(test_db_session):
    db = test_db_session()

    # Mark all ambulances as BUSY
    db.query(Ambulance).update({"status": "BUSY", "current_incident_id": "INC-OCCUPIED"})
    db.commit()

    inc_id = "INC-NO-AMB"
    inc = Incident(
        id=inc_id,
        description="Accident reported",
        location="Bavdhan Flyover",
        severity="HIGH",
        status="REPORTED"
    )
    db.add(inc)
    db.commit()

    result = dispatch_resources(incident_id=inc_id, db=db)

    assert result["ambulance_id"] is None
    assert result["hospital_id"] is None
    assert result["error"] == "NO_AMBULANCE_AVAILABLE"
    assert result["status"] == "WAITING_FOR_AMBULANCE"

    db.expire_all()
    inc_after = db.query(Incident).filter(Incident.id == inc_id).first()
    assert inc_after.status == "WAITING_FOR_AMBULANCE"
    assert inc_after.dispatch_error == "NO_AMBULANCE_AVAILABLE"
    assert inc_after.assigned_ambulance is None
    db.close()
