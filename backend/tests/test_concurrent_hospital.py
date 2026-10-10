import threading
import pytest
from hospital_service.app.services import HospitalManager
from coordinator.app.models.incident import Hospital, HospitalReservation


def test_concurrent_hospital_reservations_never_exceed_capacity(test_db_session):
    db = test_db_session()
    hosp = db.query(Hospital).filter(Hospital.id == "HOSP-001").first()
    hosp.available_beds = 2
    db.commit()

    hosp_mgr = HospitalManager(db_session_factory=test_db_session)
    results = []
    barrier = threading.Barrier(5)

    def attempt_reservation(idx):
        barrier.wait()
        success = hosp_mgr.reserve_bed("HOSP-001", f"INC-CONC-{idx}")
        results.append(success)

    threads = [threading.Thread(target=attempt_reservation, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    successes = [r for r in results if r is True]
    failures = [r for r in results if r is False]

    # Exactly 2 can succeed because available_beds was 2
    assert len(successes) == 2
    assert len(failures) == 3

    db.expire_all()
    hosp_after = db.query(Hospital).filter(Hospital.id == "HOSP-001").first()
    assert hosp_after.available_beds == 0
    assert hosp_after.available_beds >= 0  # Can never be negative!

    active_reservations = (
        db.query(HospitalReservation)
        .filter(
            HospitalReservation.hospital_id == "HOSP-001",
            HospitalReservation.status == "ACTIVE"
        )
        .count()
    )
    assert active_reservations == 2
    db.close()
