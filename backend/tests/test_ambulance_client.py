import pytest
from coordinator.app.grpc_clients.ambulance_client import (
    get_available_ambulances,
    assign_ambulance,
    release_ambulance
)


def test_ambulance_client_flow(test_db_session):
    resp = get_available_ambulances()
    assert resp is not None
    assert len(resp.ambulances) > 0

    amb_id = resp.ambulances[0].id
    inc_id = "INC-CLIENT-TEST-1"

    assign_resp = assign_ambulance(amb_id, inc_id)
    assert assign_resp is not None
    assert assign_resp.success is True

    release_resp = release_ambulance(amb_id, inc_id)
    assert release_resp is not None
    assert release_resp.success is True
