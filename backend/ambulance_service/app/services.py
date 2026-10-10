import os
from coordinator.app.database.connection import SessionLocal
from coordinator.app.models.incident import Ambulance


class AmbulanceManager:
    def __init__(self, db_session_factory=None):
        self.SessionLocal = db_session_factory or SessionLocal

    def get_available(self):
        db = self.SessionLocal()
        try:
            ambulances = db.query(Ambulance).filter(Ambulance.status == "AVAILABLE").all()
            return [
                {
                    "id": a.id,
                    "status": a.status,
                    "latitude": a.latitude,
                    "longitude": a.longitude,
                    "current_incident_id": a.current_incident_id
                }
                for a in ambulances
            ]
        finally:
            db.close()

    def assign(self, ambulance_id: str, incident_id: str) -> bool:
        """
        Safely and concurrently allocate an ambulance to a specific incident.
        - Uses atomic conditional UPDATE to prevent race conditions & double-booking across threads/transactions.
        - Ensures idempotency: if the ambulance is already assigned to this incident, returns True.
        - Prevents two simultaneous incidents from claiming the same ambulance.
        - Persisted directly to PostgreSQL/SQLAlchemy.
        """
        db = self.SessionLocal()
        try:
            # Idempotency check: already owned by this incident
            existing = (
                db.query(Ambulance)
                .filter(Ambulance.id == ambulance_id, Ambulance.current_incident_id == incident_id)
                .first()
            )
            if existing:
                return True

            # Atomic conditional update: only succeeds if status == 'AVAILABLE'
            updated_rows = (
                db.query(Ambulance)
                .filter(
                    Ambulance.id == ambulance_id,
                    Ambulance.status == "AVAILABLE"
                )
                .update(
                    {
                        "status": "BUSY",
                        "current_incident_id": incident_id
                    },
                    synchronize_session="fetch"
                )
            )
            db.commit()

            return updated_rows > 0
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()

    def release(self, ambulance_id: str, incident_id: str) -> bool:
        """
        Safely and idempotently release an allocated ambulance.
        - Verifies that the ambulance is owned by the given incident before releasing.
        - Repeated release calls for the same incident return True without corrupting state.
        - Rejection if the ambulance is currently held by a different incident.
        """
        db = self.SessionLocal()
        try:
            # Check current status
            amb = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
            if not amb:
                return False

            # Idempotent: already available and not claimed
            if amb.status == "AVAILABLE" and amb.current_incident_id is None:
                return True

            # Ownership verification: reject if held by a different incident
            if amb.current_incident_id != incident_id:
                return False

            # Atomic release
            updated_rows = (
                db.query(Ambulance)
                .filter(
                    Ambulance.id == ambulance_id,
                    Ambulance.current_incident_id == incident_id
                )
                .update(
                    {
                        "status": "AVAILABLE",
                        "current_incident_id": None
                    },
                    synchronize_session="fetch"
                )
            )
            db.commit()
            return updated_rows > 0 or (amb.status == "AVAILABLE")
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()

    def update_status(self, ambulance_id: str, status: str) -> bool:
        db = self.SessionLocal()
        try:
            amb = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
            if not amb:
                return False
            amb.status = status
            if status == "AVAILABLE":
                amb.current_incident_id = None
            db.commit()
            return True
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()

    def get_status(self, ambulance_id: str):
        db = self.SessionLocal()
        try:
            return db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
        finally:
            db.close()
