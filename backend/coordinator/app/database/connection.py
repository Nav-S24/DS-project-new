import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./emergency.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False, "timeout": 20.0}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(seed=True):
    from coordinator.app.models.incident import Ambulance, Hospital, Incident, HospitalReservation
    Base.metadata.create_all(bind=engine)

    if seed:
        db = SessionLocal()
        try:
            # Seed default ambulances if empty
            if db.query(Ambulance).count() == 0:
                initial_ambulances = [
                    Ambulance(id="AMB-001", status="AVAILABLE", latitude=18.5204, longitude=73.8567, current_incident_id=None),
                    Ambulance(id="AMB-002", status="BUSY", latitude=18.5304, longitude=73.8667, current_incident_id="INC-PREV-01"),
                    Ambulance(id="AMB-003", status="AVAILABLE", latitude=18.5104, longitude=73.8467, current_incident_id=None),
                    Ambulance(id="AMB-004", status="AVAILABLE", latitude=18.5250, longitude=73.8500, current_incident_id=None),
                ]
                db.add_all(initial_ambulances)
                db.commit()

            # Seed default hospitals if empty
            if db.query(Hospital).count() == 0:
                initial_hospitals = [
                    Hospital(id="HOSP-001", name="City General Hospital", location="Pune", total_beds=100, available_beds=25),
                    Hospital(id="HOSP-002", name="Emergency Care Hospital", location="Pune", total_beds=80, available_beds=10),
                    Hospital(id="HOSP-003", name="Metro Medical Center", location="Pune", total_beds=120, available_beds=0),
                ]
                db.add_all(initial_hospitals)
                db.commit()
        finally:
            db.close()
