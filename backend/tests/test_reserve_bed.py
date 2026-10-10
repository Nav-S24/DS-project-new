import pytest
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Hospital, HospitalReservation


def test_reserve_bed(test_db_session):
    mgr = HospitalManager(db_session_factory=test_db_session)
    db = test_db_session()

    inc_id = "INC-RES-BED"
    assert mgr.reserve_bed("HOSP-001", inc_id) is True

    hosp = db.query(Hospital).filter(Hospital.id == "HOSP-001").first()
    assert hosp.available_beds == 4

    res = (
        db.query(HospitalReservation)
        .filter(
            HospitalReservation.hospital_id == "HOSP-001",
            HospitalReservation.incident_id == inc_id
        )
        .first()
    )
    assert res is not None
    assert res.status == "ACTIVE"

    # Idempotent re-request
    assert mgr.reserve_bed("HOSP-001", inc_id) is True
    # Capacity must NOT be decremented again
    assert db.query(Hospital).filter(Hospital.id == "HOSP-001").first().available_beds == 4
    db.close()
