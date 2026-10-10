import pytest
from ambulance_service.app.services import AmbulanceManager
from coordinator.app.models.incident import Ambulance


def test_release_ambulance(test_db_session):
    mgr = AmbulanceManager(db_session_factory=test_db_session)
    db = test_db_session()

    inc_id = "INC-REL-AMB"
    assert mgr.assign("AMB-001", inc_id) is True

    amb = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb.status == "BUSY"

    assert mgr.release("AMB-001", inc_id) is True

    db.expire_all()
    amb_after = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb_after.status == "AVAILABLE"
    assert amb_after.current_incident_id is None
    db.close()
