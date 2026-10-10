import pytest
from ambulance_service.app.services import AmbulanceManager
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Incident, Ambulance, Hospital


def test_hospital_allocation_failure_causes_ambulance_rollback(test_db_session):
    db = test_db_session()
    inc_id = "INC-TEST-ROLLBACK"

    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr = HospitalManager(db_session_factory=test_db_session)

    # 1. Allocate ambulance AMB-001
    assert amb_mgr.assign("AMB-001", inc_id) is True
    amb = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb.status == "BUSY"
    assert amb.current_incident_id == inc_id

    # 2. Attempt bed reservation at fully occupied hospital HOSP-002 (0 available beds)
    hosp_res = hosp_mgr.reserve_bed("HOSP-002", inc_id)
    assert hosp_res is False  # Fails due to capacity

    # 3. Compensating transaction: rollback ambulance reservation
    release_res = amb_mgr.release("AMB-001", inc_id)
    assert release_res is True

    # 4. Verify ambulance is restored to AVAILABLE with current_incident_id=None
    db.expire_all()
    amb_after = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb_after.status == "AVAILABLE"
    assert amb_after.current_incident_id is None
    db.close()
