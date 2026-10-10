import time
import grpc
from proto import emergency_pb2, emergency_pb2_grpc
from coordinator.app.config import settings
from coordinator.app.logging_config import log_structured_event


def get_channel():
    return grpc.insecure_channel(settings.HOSPITAL_GRPC_HOST)


def get_available_hospitals(retries: int = None):
    """
    Queries available hospitals with bounded retries for idempotent read.
    """
    max_retries = retries if retries is not None else settings.RPC_MAX_RETRIES
    start_time = time.time()

    for attempt in range(max_retries + 1):
        try:
            channel = get_channel()
            stub = emergency_pb2_grpc.HospitalServiceStub(channel)
            response = stub.GetAvailableHospitals(
                emergency_pb2.EmptyRequest(),
                timeout=settings.RPC_DEADLINE_SECONDS
            )
            duration_ms = (time.time() - start_time) * 1000
            log_structured_event(
                event_type="GRPC_CALL_SUCCESS",
                service_name="hospital_service",
                operation="GetAvailableHospitals",
                duration_ms=duration_ms,
                result="SUCCESS"
            )
            return response
        except grpc.RpcError as rpc_err:
            code = rpc_err.code()
            if code in (grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED) and attempt < max_retries:
                time.sleep(0.1 * (2 ** attempt))
                continue
            log_structured_event(
                event_type="GRPC_CALL_FAILURE",
                service_name="hospital_service",
                operation="GetAvailableHospitals",
                result="FAILURE",
                error_code=str(code),
                level=30
            )
            break
        except Exception:
            break

    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from hospital_service.app.services import HospitalManager
            manager = HospitalManager()
            hospitals = manager.get_available_hospitals()
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
        except Exception:
            return None

    return None


def reserve_bed(hospital_id: str, incident_id: str, correlation_id: str = None):
    """
    Reserves a hospital bed. If RPC deadline expires, performs reconciliation check
    instead of blind retry, avoiding double allocation.
    """
    start_time = time.time()
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.HospitalServiceStub(channel)
        request = emergency_pb2.BedReservationRequest(
            hospital_id=hospital_id,
            incident_id=incident_id
        )
        response = stub.ReserveBed(request, timeout=settings.RPC_DEADLINE_SECONDS)
        duration_ms = (time.time() - start_time) * 1000
        log_structured_event(
            event_type="GRPC_RESERVE_BED",
            service_name="hospital_service",
            incident_id=incident_id,
            hospital_id=hospital_id,
            correlation_id=correlation_id,
            duration_ms=duration_ms,
            result="SUCCESS" if response.success else "REJECTED"
        )
        return response
    except grpc.RpcError as rpc_err:
        code = rpc_err.code()
        log_structured_event(
            event_type="GRPC_RESERVE_BED_ERROR",
            service_name="hospital_service",
            incident_id=incident_id,
            hospital_id=hospital_id,
            correlation_id=correlation_id,
            result="ERROR",
            error_code=str(code)
        )

        # Ambiguous timeout outcome: reconcile via status/reservation
        if code == grpc.StatusCode.DEADLINE_EXCEEDED:
            # Check if reservation was successfully persisted in the database
            try:
                from coordinator.app.database.connection import SessionLocal
                from coordinator.app.models.incident import HospitalReservation
                db = SessionLocal()
                active_res = (
                    db.query(HospitalReservation)
                    .filter(
                        HospitalReservation.hospital_id == hospital_id,
                        HospitalReservation.incident_id == incident_id,
                        HospitalReservation.status == "ACTIVE"
                    )
                    .first()
                )
                db.close()
                if active_res:
                    return emergency_pb2.BedReservationResponse(
                        success=True,
                        message="Reconciled: Bed confirmed active despite timeout"
                    )
            except Exception:
                pass
    except Exception:
        pass

    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from hospital_service.app.services import HospitalManager
            manager = HospitalManager()
            success = manager.reserve_bed(hospital_id, incident_id)
            return emergency_pb2.BedReservationResponse(
                success=success,
                message="Reserved" if success else "Failed"
            )
        except Exception:
            return None

    return None


def release_bed(hospital_id: str, incident_id: str, correlation_id: str = None):
    """
    Releases a hospital bed. Idempotent operation with verified ownership.
    """
    start_time = time.time()
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.HospitalServiceStub(channel)
        request = emergency_pb2.BedReleaseRequest(
            hospital_id=hospital_id,
            incident_id=incident_id
        )
        response = stub.ReleaseBed(request, timeout=settings.RPC_DEADLINE_SECONDS)
        duration_ms = (time.time() - start_time) * 1000
        log_structured_event(
            event_type="GRPC_RELEASE_BED",
            service_name="hospital_service",
            incident_id=incident_id,
            hospital_id=hospital_id,
            correlation_id=correlation_id,
            duration_ms=duration_ms,
            result="SUCCESS" if response.success else "REJECTED"
        )
        return response
    except grpc.RpcError as rpc_err:
        log_structured_event(
            event_type="GRPC_RELEASE_BED_ERROR",
            service_name="hospital_service",
            incident_id=incident_id,
            hospital_id=hospital_id,
            correlation_id=correlation_id,
            result="ERROR",
            error_code=str(rpc_err.code())
        )
    except Exception:
        pass

    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from hospital_service.app.services import HospitalManager
            manager = HospitalManager()
            success = manager.release_bed(hospital_id, incident_id)
            return emergency_pb2.BedReleaseResponse(
                success=success,
                message="Released" if success else "Failed"
            )
        except Exception:
            return None

    return None


def get_hospital_status(hospital_id: str):
    """
    Queries hospital status for state reconciliation.
    """
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.HospitalServiceStub(channel)
        request = emergency_pb2.HospitalStatusRequest(hospital_id=hospital_id)
        return stub.GetHospitalStatus(request, timeout=settings.RPC_DEADLINE_SECONDS)
    except Exception:
        if settings.ALLOW_INPROCESS_FALLBACK:
            try:
                from hospital_service.app.services import HospitalManager
                manager = HospitalManager()
                h = manager.get_status(hospital_id)
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
            except Exception:
                return None
        return None
