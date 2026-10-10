import os
import sys

# Setup Python paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "coordinator")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "proto")))

TEST_DB_PATH = "/tmp/test_emergency.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

import pytest
from coordinator.app.database.connection import engine, Base, SessionLocal, init_db
from coordinator.app.models.incident import Ambulance, Hospital, Incident, HospitalReservation


@pytest.fixture(autouse=True)
def setup_test_database():
    """
    Initializes and seeds the database before each test.
    """
    # Clean previous tables
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    # Seed known baseline ambulances
    amb1 = Ambulance(id="AMB-001", status="AVAILABLE", latitude=18.5204, longitude=73.8567, current_incident_id=None)
    amb2 = Ambulance(id="AMB-002", status="AVAILABLE", latitude=18.5304, longitude=73.8667, current_incident_id=None)
    amb3 = Ambulance(id="AMB-003", status="BUSY", latitude=18.5104, longitude=73.8467, current_incident_id="INC-EXISTING")

    # Seed known baseline hospitals
    hosp1 = Hospital(id="HOSP-001", name="City General Hospital", location="Pune", total_beds=50, available_beds=5)
    hosp2 = Hospital(id="HOSP-002", name="Full Hospital", location="Pune", total_beds=20, available_beds=0)

    session.add_all([amb1, amb2, amb3, hosp1, hosp2])
    session.commit()
    session.close()

    yield SessionLocal

    # Teardown
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_db_session(setup_test_database):
    return setup_test_database
