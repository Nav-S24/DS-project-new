from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class IncidentCreate(BaseModel):
    description: str
    location: str
    severity: str


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    incident_id: str
    id: Optional[str] = None
    description: str
    location: str
    severity: str
    status: str
    assigned_ambulance: Optional[str] = None
    assigned_hospital: Optional[str] = None
    dispatch_error: Optional[str] = None
    created_at: Optional[datetime] = None
