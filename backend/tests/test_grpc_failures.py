import pytest
import os
from coordinator.app.config import settings
from coordinator.app.grpc_clients import ambulance_client, hospital_client


def test_grpc_services_unavailable_without_fallback(monkeypatch):
    # Simulate production mode where in-process fallback is disallowed
    monkeypatch.setattr(settings, "ALLOW_INPROCESS_FALLBACK", False)
    # Point to non-existent ports
    monkeypatch.setattr(settings, "AMBULANCE_GRPC_HOST", "localhost:59998")
    monkeypatch.setattr(settings, "HOSPITAL_GRPC_HOST", "localhost:59999")
    monkeypatch.setattr(settings, "RPC_DEADLINE_SECONDS", 0.3)
    monkeypatch.setattr(settings, "RPC_MAX_RETRIES", 0)

    # Calling remote unavailable service returns None/failure cleanly without crashing
    amb_resp = ambulance_client.get_available_ambulances(retries=0)
    assert amb_resp is None

    hosp_resp = hospital_client.get_available_hospitals(retries=0)
    assert hosp_resp is None
