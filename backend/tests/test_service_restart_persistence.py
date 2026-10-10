import pytest
from ambulance_service.app.services import AmbulanceManager
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Ambulance, Hospital


def test_service_restart_preserves_resource_state(test_db_session):
    # Service Instance 1 runs allocation
    amb_mgr_1 = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr_1 = HospitalManager(db_session_factory=test_db_session)

    assert amb_mgr_1.assign("AMB-001", "INC-PERSIST-1") is True
    assert hosp_mgr_1.reserve_bed("HOSP-001", "INC-PERSIST-1") is True

    # "Crash" and destroy instance 1
    del amb_mgr_1
    del hosp_mgr_1

    # Service Instance 2 starts up after restart
    amb_mgr_2 = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr_2 = HospitalManager(db_session_factory=test_db_session)

    # Verify state is intact
    available_ambs = amb_mgr_2.get_available()
    amb_ids = [a["id"] for a in available_ambs]
    assert "AMB-001" not in amb_ids  # Still busy!

    amb_status = amb_mgr_2.get_status("AMB-001")
    assert amb_status.status == "BUSY"
    assert amb_status.current_incident_id == "INC-PERSIST-1"

    hosp_status = hosp_mgr_2.get_status("HOSP-001")
    assert hosp_status.available_beds == 4  # Capacity reservation persisted!
