import threading
import pytest
from ambulance_service.app.services import AmbulanceManager
from coordinator.app.models.incident import Ambulance


def test_concurrent_ambulance_allocation_prevents_double_booking(test_db_session):
    db = test_db_session()
    amb_mgr = AmbulanceManager(db_session_factory=test_db_session)

    results = []
    barrier = threading.Barrier(2)

    def attempt_allocation(incident_id):
        barrier.wait()
        success = amb_mgr.assign("AMB-001", incident_id)
        results.append((incident_id, success))

    t1 = threading.Thread(target=attempt_allocation, args=("INC-RACE-1",))
    t2 = threading.Thread(target=attempt_allocation, args=("INC-RACE-2",))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Exactly one must succeed, one must fail
    successes = [res for res in results if res[1] is True]
    failures = [res for res in results if res[1] is False]

    assert len(successes) == 1
    assert len(failures) == 1

    winner_incident = successes[0][0]
    db.expire_all()
    amb = db.query(Ambulance).filter(Ambulance.id == "AMB-001").first()
    assert amb.status == "BUSY"
    assert amb.current_incident_id == winner_incident
    db.close()
