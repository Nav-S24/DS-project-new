import pytest
from ambulance_service.app.services import AmbulanceManager
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Incident, Ambulance, Hospital, HospitalReservation
from coordinator.app.services.dispatch import dispatch_resources


def test_successful_ambulance_and_hospital_allocation(test_db_session):
    db = test_db_session()
    inc_id = "INC-TEST-SUCCESS"

    # Create incident in REPORTED state
    incident = Incident(
        id=inc_id,
        description="Severe trauma call",
        location="MG Road",
        severity="CRITICAL",
        status="REPORTED"
    )
    db.add(incident)
    db.commit()

    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr = HospitalManager(db_session_factory=test_db_session)

    # 1. Allocate ambulance
    amb_success = amb_mgr.assign("AMB-001", inc_id)
    assert amb_success is True

    # Check ambulance state
    amb = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb.status == "BUSY"
    assert amb.current_incident_id == inc_id

    # 2. Allocate hospital bed
    hosp_success = hosp_mgr.reserve_bed("HOSP-001", inc_id)
    assert hosp_success is True

    # Check hospital capacity and reservation
    hosp = db.query(Hospital).filter(Hospital.id == "HOSP-001").first()
    assert hosp.available_beds == 4  # started with 5

    res = db.query(HospitalReservation).filter(
        HospitalReservation.hospital_id == "HOSP-001",
        HospitalReservation.incident_id == inc_id
    ).first()
    assert res is not None
    assert res.status == "ACTIVE"

    # Complete dispatch
    incident.assigned_ambulance = "AMB-001"
    incident.assigned_hospital = "HOSP-001"
    incident.status = "DISPATCHED"
    db.commit()

    reloaded_incident = db.query(Incident).filter(Incident.id == inc_id).first()
    assert reloaded_incident.status == "DISPATCHED"
    assert reloaded_incident.assigned_ambulance == "AMB-001"
    assert reloaded_incident.assigned_hospital == "HOSP-001"
    db.close()
