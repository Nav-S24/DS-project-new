from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index
from coordinator.app.database.connection import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)
    description = Column(String, nullable=False)
    location = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    status = Column(String, nullable=False, default="REPORTED")
    assigned_ambulance = Column(String, nullable=True)
    assigned_hospital = Column(String, nullable=True)
    dispatch_error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Ambulance(Base):
    __tablename__ = "ambulances"

    id = Column(String(50), primary_key=True)
    status = Column(String(20), nullable=False, default="AVAILABLE")  # AVAILABLE, BUSY
    latitude = Column(Float, nullable=False, default=18.5204)
    longitude = Column(Float, nullable=False, default=73.8567)
    current_incident_id = Column(String(100), nullable=True)  # Incident that reserved this ambulance
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    location = Column(String(100), nullable=False)
    total_beds = Column(Integer, nullable=False, default=100)
    available_beds = Column(Integer, nullable=False, default=25)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HospitalReservation(Base):
    __tablename__ = "hospital_reservations"

    id = Column(String(100), primary_key=True)
    hospital_id = Column(String(50), ForeignKey("hospitals.id"), nullable=False, index=True)
    incident_id = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="ACTIVE")  # ACTIVE, RELEASED
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_hosp_inc_active", "hospital_id", "incident_id", "status"),
    )


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id = Column(String(100), primary_key=True)
    event_type = Column(String(100), nullable=False)
    incident_id = Column(String(100), nullable=True, index=True)
    payload = Column(String, nullable=False)  # JSON-encoded payload
    status = Column(String(20), nullable=False, default="PENDING")  # PENDING, PUBLISHED, FAILED
    retry_count = Column(Integer, nullable=False, default=0)
    correlation_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    message_id = Column(String(100), primary_key=True)
    event_type = Column(String(100), nullable=False)
    processed_at = Column(DateTime, default=datetime.utcnow)

