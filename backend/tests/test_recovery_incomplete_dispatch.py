import pytest
from coordinator.app.models.incident import Incident, Ambulance, HospitalReservation
from coordinator.app.services.dispatch import reconcile_and_recover_incidents
from ambulance_service.app.services import AmbulanceManager
from hospital_service.app.services import HospitalManager


def test_recovery_of_incomplete_dispatch_rollback(test_db_session):
    db = test_db_session()
    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)

    # Scenario 1: Crash while ROLLBACK_PENDING
    inc_crash = Incident(
        id="INC-CRASH-01",
        description="Crash scenario",
        location="Station Rd",
        severity="HIGH",
        status="ROLLBACK_PENDING",
        assigned_ambulance="AMB-001",
        assigned_hospital="HOSP-002",
        dispatch_error="HOSPITAL_TIMEOUT"
    )
    amb_mgr.assign("AMB-001", "INC-CRASH-01")

    db.add(inc_crash)
    db.commit()

    db.expire_all()
    amb_before = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb_before.status == "BUSY"
    assert amb_before.current_incident_id == "INC-CRASH-01"

    # Run recovery
    recovered = reconcile_and_recover_incidents(db=db)
    assert len(recovered) >= 1
    assert any(r["incident_id"] == "INC-CRASH-01" for r in recovered)

    db.expire_all()
    inc_after = db.query(Incident).filter(Incident.id == "INC-CRASH-01").first()
    assert inc_after.status == "ROLLED_BACK"
    assert inc_after.assigned_ambulance is None

    amb_after = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb_after.status == "AVAILABLE"
    assert amb_after.current_incident_id is None

    # Repeated recovery attempt is safe and idempotent
    recovered_repeat = reconcile_and_recover_incidents(db=db)
    assert len(recovered_repeat) == 0
    db.close()


def test_recovery_of_crash_before_dispatched_commit(test_db_session):
    db = test_db_session()
    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)
    hosp_mgr = HospitalManager(db_session_factory=test_db_session)

    # Scenario 2: Coordinator died while in DISPATCHING after both resources were acquired
    inc_id = "INC-CRASH-BOTH-ACQUIRED"
    inc = Incident(
        id=inc_id,
        description="Cardiac emergency",
        location="FC Road",
        severity="CRITICAL",
        status="DISPATCHING",
        assigned_ambulance="AMB-001",
        assigned_hospital="HOSP-001",
        dispatch_error=None
    )
    db.add(inc)
    db.commit()

    # Both resources were allocated successfully
    assert amb_mgr.assign("AMB-001", inc_id) is True
    assert hosp_mgr.reserve_bed("HOSP-001", inc_id) is True

    # Run recovery: should reconcile that both resources are reserved and finalize DISPATCHED
    recovered = reconcile_and_recover_incidents(db=db)
    assert any(r["incident_id"] == inc_id for r in recovered)

    db.expire_all()
    inc_after = db.query(Incident).filter(Incident.id == inc_id).first()
    assert inc_after.status == "DISPATCHED"
    assert inc_after.assigned_ambulance == "AMB-001"
    assert inc_after.assigned_hospital == "HOSP-001"
    db.close()
