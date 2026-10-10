import pytest
from coordinator.app.grpc_clients.hospital_client import (
    get_available_hospitals,
    reserve_bed,
    release_bed
)


def test_hospital_client_flow(test_db_session):
    resp = get_available_hospitals()
    assert resp is not None
    assert len(resp.hospitals) > 0

    hosp_id = resp.hospitals[0].id
    inc_id = "INC-CLIENT-HOSP-1"

    reserve_resp = reserve_bed(hosp_id, inc_id)
    assert reserve_resp is not None
    assert reserve_resp.success is True

    release_resp = release_bed(hosp_id, inc_id)
    assert release_resp is not None
    assert release_resp.success is True
