import grpc
from proto import emergency_pb2, emergency_pb2_grpc
from ambulance_service.app.services import AmbulanceManager


class AmbulanceServiceServicer(emergency_pb2_grpc.AmbulanceServiceServicer):
    def __init__(self, manager: AmbulanceManager = None):
        self.manager = manager or AmbulanceManager()

    def GetAvailableAmbulances(self, request, context):
        ambulances = self.manager.get_available()
        response = emergency_pb2.AmbulanceListResponse()
        for amb in ambulances:
            response.ambulances.add(
                id=amb["id"],
                status=amb["status"],
                latitude=amb["latitude"],
                longitude=amb["longitude"],
                current_incident_id=amb.get("current_incident_id") or ""
            )
        return response

    def AssignAmbulance(self, request, context):
        success = self.manager.assign(
            ambulance_id=request.ambulance_id,
            incident_id=request.incident_id
        )
        return emergency_pb2.AmbulanceAssignmentResponse(
            success=success,
            message="Ambulance assigned successfully" if success else "Failed to assign ambulance",
            ambulance_id=request.ambulance_id
        )

    def ReleaseAmbulance(self, request, context):
        success = self.manager.release(
            ambulance_id=request.ambulance_id,
            incident_id=request.incident_id
        )
        return emergency_pb2.AmbulanceReleaseResponse(
            success=success,
            message="Ambulance released successfully" if success else "Failed to release ambulance"
        )

    def GetAmbulanceStatus(self, request, context):
        amb = self.manager.get_status(request.ambulance_id)
        if not amb:
            return emergency_pb2.AmbulanceStatusResponse(found=False)
        return emergency_pb2.AmbulanceStatusResponse(
            found=True,
            ambulance=emergency_pb2.Ambulance(
                id=amb.id,
                status=amb.status,
                latitude=amb.latitude,
                longitude=amb.longitude,
                current_incident_id=amb.current_incident_id or ""
            )
        )
