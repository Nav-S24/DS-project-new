import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from coordinator.app.schemas.incident import IncidentCreate, IncidentResponse
from coordinator.app.models.incident import Incident
from coordinator.app.database.connection import get_db
from coordinator.app.services.dispatch import dispatch_resources, reconcile_and_recover_incidents
from messaging.publisher import publish_event

router = APIRouter(
    prefix="/incidents",
    tags=["Incidents"]
)


@router.post("/")
def create_incident(
    incident: IncidentCreate,
    db: Session = Depends(get_db)
):
    incident_id = f"INC-{str(uuid.uuid4())[:8].upper()}"

    # Step 1: Save incident as REPORTED initially
    new_incident = Incident(
        id=incident_id,
        description=incident.description,
        location=incident.location,
        severity=incident.severity,
        status="REPORTED",
        assigned_ambulance=None,
        assigned_hospital=None,
        dispatch_error=None
    )
    db.add(new_incident)
    db.commit()
    db.refresh(new_incident)

    # Step 2: Publish INCIDENT_CREATED event
    publish_event(
        "INCIDENT_CREATED",
        {
            "incident_id": new_incident.id,
            "description": new_incident.description,
            "location": new_incident.location,
            "severity": new_incident.severity
        }
    )

    # Step 3: Run persistent saga allocation workflow
    resources = dispatch_resources(incident_id, db)
    db.refresh(new_incident)

    return {
        "incident_id": new_incident.id,
        "id": new_incident.id,
        "description": new_incident.description,
        "location": new_incident.location,
        "severity": new_incident.severity,
        "status": new_incident.status,
        "assigned_ambulance": new_incident.assigned_ambulance,
        "assigned_hospital": new_incident.assigned_hospital,
        "dispatch_error": new_incident.dispatch_error or resources.get("error")
    }


@router.get("/")
def get_incidents(db: Session = Depends(get_db)):
    incidents = db.query(Incident).order_by(Incident.created_at.desc()).all()
    return [
        {
            "incident_id": inc.id,
            "id": inc.id,
            "description": inc.description,
            "location": inc.location,
            "severity": inc.severity,
            "status": inc.status,
            "assigned_ambulance": inc.assigned_ambulance,
            "assigned_hospital": inc.assigned_hospital,
            "dispatch_error": inc.dispatch_error,
            "created_at": inc.created_at.isoformat() if inc.created_at else None
        }
        for inc in incidents
    ]


@router.post("/recover")
def trigger_recovery(db: Session = Depends(get_db)):
    """
    On-demand endpoint to reconcile stuck or intermediate incidents after crash.
    """
    recovered = reconcile_and_recover_incidents(db)
    return {
        "status": "reconciliation_complete",
        "recovered_incidents": recovered
    }
