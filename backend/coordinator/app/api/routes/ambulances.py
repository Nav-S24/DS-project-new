from fastapi import APIRouter
from coordinator.app.grpc_clients.ambulance_client import get_available_ambulances

router = APIRouter(
    prefix="/ambulances",
    tags=["Ambulances"]
)


@router.get("/available")
def available_ambulances():
    response = get_available_ambulances()
    if not response or not response.ambulances:
        return []

    return [
        {
            "id": ambulance.id,
            "status": ambulance.status,
            "latitude": ambulance.latitude,
            "longitude": ambulance.longitude,
            "current_incident_id": ambulance.current_incident_id
        }
        for ambulance in response.ambulances
    ]
