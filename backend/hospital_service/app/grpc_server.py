import grpc
from proto import emergency_pb2, emergency_pb2_grpc
from hospital_service.app.services import HospitalManager


class HospitalServiceServicer(emergency_pb2_grpc.HospitalServiceServicer):
    def __init__(self, manager: HospitalManager = None):
        self.manager = manager or HospitalManager()

    def GetAvailableHospitals(self, request, context):
        hospitals = self.manager.get_available_hospitals()
        response = emergency_pb2.HospitalListResponse()
        for h in hospitals:
            response.hospitals.add(
                id=h["id"],
                name=h["name"],
                location=h["location"],
                total_beds=h["total_beds"],
                available_beds=h["available_beds"]
            )
        return response

    def ReserveBed(self, request, context):
        success = self.manager.reserve_bed(
            hospital_id=request.hospital_id,
            incident_id=request.incident_id
        )
        return emergency_pb2.BedReservationResponse(
            success=success,
            message="Bed reserved successfully" if success else "Failed to reserve bed"
        )

    def ReleaseBed(self, request, context):
        success = self.manager.release_bed(
            hospital_id=request.hospital_id,
            incident_id=request.incident_id
        )
        return emergency_pb2.BedReleaseResponse(
            success=success,
            message="Bed released successfully" if success else "Failed to release bed"
        )

    def GetHospitalStatus(self, request, context):
        h = self.manager.get_status(request.hospital_id)
        if not h:
            return emergency_pb2.HospitalStatusResponse(found=False)
        return emergency_pb2.HospitalStatusResponse(
            found=True,
            hospital=emergency_pb2.Hospital(
                id=h.id,
                name=h.name,
                location=h.location,
                total_beds=h.total_beds,
                available_beds=h.available_beds
            )
        )
