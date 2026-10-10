import pytest
from ambulance_service.app.services import AmbulanceManager
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Ambulance, Hospital


def test_repeated_rollback_is_idempotent(test_db_session):
    db = test_db_session()
    inc_id = "INC-REPEATED-ROLLBACK"
    other_inc = "INC-OTHER"

    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr = HospitalManager(db_session_factory=test_db_session)

    # Setup: reserve ambulance and hospital
    assert amb_mgr.assign("AMB-001", inc_id) is True
    assert hosp_mgr.reserve_bed("HOSP-001", inc_id) is True

    # Initial rollback
    assert amb_mgr.release("AMB-001", inc_id) is True
    assert hosp_mgr.release_bed("HOSP-001", inc_id) is True

    # Repeated rollback call 1
    assert amb_mgr.release("AMB-001", inc_id) is True
    assert hosp_mgr.release_bed("HOSP-001", inc_id) is True

    # Repeated rollback call 2
    assert amb_mgr.release("AMB-001", inc_id) is True
    assert hosp_mgr.release_bed("HOSP-001", inc_id) is True

    # Verify hospital available beds did not get artificially inflated beyond total
    hosp = db.query(Hospital).filter(Hospital.id == "HOSP-001").first()
    assert hosp.available_beds == 5  # Restored to original, not 5+1+1

    # Verify non-owner incident cannot release an ambulance held by someone else
    amb_mgr.assign("AMB-002", inc_id)
    wrong_release = amb_mgr.release("AMB-002", other_inc)
    assert wrong_release is False  # Rejected because other_inc does not own AMB-002

    amb2 = db.query(Ambulance).filter(Ambulance.id == "AMB-002").first()
    assert amb2.status == "BUSY"
    assert amb2.current_incident_id == inc_id
    db.close()
