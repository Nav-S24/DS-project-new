import pytest
import grpc
from proto import emergency_pb2, emergency_pb2_grpc
from coordinator.app.grpc_clients import ambulance_client
from ambulance_service.app.services import AmbulanceManager


def test_deadline_exceeded_triggers_state_reconciliation(test_db_session, monkeypatch):
    mgr = AmbulanceManager(db_session_factory=test_db_session)
    inc_id = "INC-TIMEOUT-RECON"

    # Pre-reserve ambulance on the server side (simulating server succeeded before sending response)
    mgr.assign("AMB-001", inc_id)

    # Mock the gRPC stub to simulate a client DEADLINE_EXCEEDED RpcError
    class MockRpcError(grpc.RpcError):
        def code(self):
            return grpc.StatusCode.DEADLINE_EXCEEDED

    class MockStub:
        def AssignAmbulance(self, request, timeout=None):
            raise MockRpcError()

    monkeypatch.setattr(
        emergency_pb2_grpc,
        "AmbulanceServiceStub",
        lambda channel: MockStub()
    )

    # Call assign_ambulance; client handles DEADLINE_EXCEEDED by checking actual status
    resp = ambulance_client.assign_ambulance("AMB-001", inc_id)

    assert resp is not None
    assert resp.success is True
    assert "Reconciled" in resp.message
