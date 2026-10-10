import pytest
from coordinator.app.main import health


def test_coordinator_health_endpoint(test_db_session):
    db = test_db_session()
    data = health(db=db)

    assert "status" in data
    assert "components" in data
    assert "database" in data["components"]
    assert data["components"]["database"]["status"] == "healthy"
    assert "ambulance_grpc" in data["components"]
    assert "hospital_grpc" in data["components"]
    assert "rabbitmq" in data["components"]
    assert "transactional_outbox" in data["components"]
    db.close()
