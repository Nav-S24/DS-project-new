import uuid
from coordinator.app.database.connection import SessionLocal
from coordinator.app.models.incident import Hospital, HospitalReservation


class HospitalManager:
    def __init__(self, db_session_factory=None):
        self.SessionLocal = db_session_factory or SessionLocal

    def get_available_hospitals(self):
        db = self.SessionLocal()
        try:
            hospitals = (
                db.query(Hospital)
                .filter(Hospital.available_beds > 0)
                .all()
            )
            return [
                {
                    "id": h.id,
                    "name": h.name,
                    "location": h.location,
                    "total_beds": h.total_beds,
                    "available_beds": h.available_beds
                }
                for h in hospitals
            ]
        finally:
            db.close()

    def reserve_bed(self, hospital_id: str, incident_id: str) -> bool:
        """
        Safely and concurrently reserve a hospital bed for an incident.
        - Uses atomic conditional UPDATE (available_beds > 0) to strictly prevent negative capacity.
        - Persists an associated HospitalReservation record for the incident.
        - Idempotent: returns True without allocating additional beds if an active reservation already exists.
        """
        db = self.SessionLocal()
        try:
            # Check for existing active reservation for this incident (idempotency)
            existing = (
                db.query(HospitalReservation)
                .filter(
                    HospitalReservation.hospital_id == hospital_id,
                    HospitalReservation.incident_id == incident_id,
                    HospitalReservation.status == "ACTIVE"
                )
                .first()
            )
            if existing:
                return True

            # Atomic decrement guarded by available_beds > 0
            updated_rows = (
                db.query(Hospital)
                .filter(
                    Hospital.id == hospital_id,
                    Hospital.available_beds > 0
                )
                .update(
                    {"available_beds": Hospital.available_beds - 1},
                    synchronize_session="fetch"
                )
            )

            if updated_rows == 0:
                # Capacity full or hospital not found
                db.commit()
                return False

            # Persist reservation with link to incident
            reservation = HospitalReservation(
                id=str(uuid.uuid4()),
                hospital_id=hospital_id,
                incident_id=incident_id,
                status="ACTIVE"
            )
            db.add(reservation)
            db.commit()
            return True
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()

    def release_bed(self, hospital_id: str, incident_id: str) -> bool:
        """
        Safely and idempotently release a reserved bed.
        - Verifies that an active reservation exists for the specific incident.
        - Cancels the reservation and restores available capacity (capped at total_beds).
        - Idempotent: repeated release requests return True without incrementing capacity multiple times.
        """
        db = self.SessionLocal()
        try:
            # Find active reservation for this incident
            reservation = (
                db.query(HospitalReservation)
                .filter(
                    HospitalReservation.hospital_id == hospital_id,
                    HospitalReservation.incident_id == incident_id,
                    HospitalReservation.status == "ACTIVE"
                )
                .first()
            )

            if not reservation:
                # Check if it was already released (idempotent call)
                released = (
                    db.query(HospitalReservation)
                    .filter(
                        HospitalReservation.hospital_id == hospital_id,
                        HospitalReservation.incident_id == incident_id,
                        HospitalReservation.status == "RELEASED"
                    )
                    .first()
                )
                if released:
                    return True
                return False

            # Mark reservation as RELEASED
            reservation.status = "RELEASED"

            # Safely restore bed capacity guarded by available_beds < total_beds
            db.query(Hospital).filter(
                Hospital.id == hospital_id,
                Hospital.available_beds < Hospital.total_beds
            ).update(
                {"available_beds": Hospital.available_beds + 1},
                synchronize_session="fetch"
            )

            db.commit()
            return True
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()

    def get_status(self, hospital_id: str):
        db = self.SessionLocal()
        try:
            return db.query(Hospital).filter(Hospital.id == hospital_id).first()
        finally:
            db.close()
