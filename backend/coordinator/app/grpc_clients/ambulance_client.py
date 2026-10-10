import time
import grpc
from proto import emergency_pb2, emergency_pb2_grpc
from coordinator.app.config import settings
from coordinator.app.logging_config import log_structured_event


def get_channel():
    return grpc.insecure_channel(settings.AMBULANCE_GRPC_HOST)


def get_available_ambulances(retries: int = None):
    """
    Queries available ambulances with bounded retries for idempotent read.
    """
    max_retries = retries if retries is not None else settings.RPC_MAX_RETRIES
    start_time = time.time()

    for attempt in range(max_retries + 1):
        try:
            channel = get_channel()
            stub = emergency_pb2_grpc.AmbulanceServiceStub(channel)
            response = stub.GetAvailableAmbulances(
                emergency_pb2.EmptyRequest(),
                timeout=settings.RPC_DEADLINE_SECONDS
            )
            duration_ms = (time.time() - start_time) * 1000
            log_structured_event(
                event_type="GRPC_CALL_SUCCESS",
                service_name="ambulance_service",
                operation="GetAvailableAmbulances",
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
                service_name="ambulance_service",
                operation="GetAvailableAmbulances",
                result="FAILURE",
                error_code=str(code),
                level=30  # WARNING
            )
            break
        except Exception as e:
            break

    # Test/development fallback if explicitly enabled
    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from ambulance_service.app.services import AmbulanceManager
            manager = AmbulanceManager()
            ambulances = manager.get_available()
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
        except Exception:
            return None

    return None


def assign_ambulance(ambulance_id: str, incident_id: str, correlation_id: str = None):
    """
    Assigns an ambulance. If RPC deadline expires, performs reconciliation
    check on ambulance status instead of blindly assuming failure or blind-retrying.
    """
    start_time = time.time()
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.AmbulanceServiceStub(channel)
        request = emergency_pb2.AmbulanceAssignmentRequest(
            ambulance_id=ambulance_id,
            incident_id=incident_id
        )
        response = stub.AssignAmbulance(request, timeout=settings.RPC_DEADLINE_SECONDS)
        duration_ms = (time.time() - start_time) * 1000
        log_structured_event(
            event_type="GRPC_ASSIGN_AMBULANCE",
            service_name="ambulance_service",
            incident_id=incident_id,
            ambulance_id=ambulance_id,
            correlation_id=correlation_id,
            duration_ms=duration_ms,
            result="SUCCESS" if response.success else "REJECTED"
        )
        return response
    except grpc.RpcError as rpc_err:
        code = rpc_err.code()
        log_structured_event(
            event_type="GRPC_ASSIGN_AMBULANCE_ERROR",
            service_name="ambulance_service",
            incident_id=incident_id,
            ambulance_id=ambulance_id,
            correlation_id=correlation_id,
            result="ERROR",
            error_code=str(code)
        )

        # Ambiguous timeout outcome: reconcile state
        if code == grpc.StatusCode.DEADLINE_EXCEEDED:
            status_resp = get_ambulance_status(ambulance_id)
            if (status_resp and status_resp.found and
                    status_resp.ambulance.current_incident_id == incident_id):
                # The reservation actually succeeded despite the client timeout!
                return emergency_pb2.AmbulanceAssignmentResponse(
                    success=True,
                    message="Reconciled: Assigned despite timeout",
                    ambulance_id=ambulance_id
                )

    except Exception:
        pass

    # In-process test fallback
    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from ambulance_service.app.services import AmbulanceManager
            manager = AmbulanceManager()
            success = manager.assign(ambulance_id, incident_id)
            return emergency_pb2.AmbulanceAssignmentResponse(
                success=success,
                message="Assigned" if success else "Failed",
                ambulance_id=ambulance_id
            )
        except Exception:
            return None

    return None


def release_ambulance(ambulance_id: str, incident_id: str, correlation_id: str = None):
    """
    Releases an ambulance. Idempotent operation with verified ownership.
    """
    start_time = time.time()
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.AmbulanceServiceStub(channel)
        request = emergency_pb2.AmbulanceReleaseRequest(
            ambulance_id=ambulance_id,
            incident_id=incident_id
        )
        response = stub.ReleaseAmbulance(request, timeout=settings.RPC_DEADLINE_SECONDS)
        duration_ms = (time.time() - start_time) * 1000
        log_structured_event(
            event_type="GRPC_RELEASE_AMBULANCE",
            service_name="ambulance_service",
            incident_id=incident_id,
            ambulance_id=ambulance_id,
            correlation_id=correlation_id,
            duration_ms=duration_ms,
            result="SUCCESS" if response.success else "REJECTED"
        )
        return response
    except grpc.RpcError as rpc_err:
        log_structured_event(
            event_type="GRPC_RELEASE_AMBULANCE_ERROR",
            service_name="ambulance_service",
            incident_id=incident_id,
            ambulance_id=ambulance_id,
            correlation_id=correlation_id,
            result="ERROR",
            error_code=str(rpc_err.code())
        )
    except Exception:
        pass

    if settings.ALLOW_INPROCESS_FALLBACK:
        try:
            from ambulance_service.app.services import AmbulanceManager
            manager = AmbulanceManager()
            success = manager.release(ambulance_id, incident_id)
            return emergency_pb2.AmbulanceReleaseResponse(
                success=success,
                message="Released" if success else "Failed"
            )
        except Exception:
            return None

    return None


def get_ambulance_status(ambulance_id: str):
    """
    Queries ambulance status for state reconciliation.
    """
    try:
        channel = get_channel()
        stub = emergency_pb2_grpc.AmbulanceServiceStub(channel)
        request = emergency_pb2.AmbulanceStatusRequest(ambulance_id=ambulance_id)
        return stub.GetAmbulanceStatus(request, timeout=settings.RPC_DEADLINE_SECONDS)
    except Exception:
        if settings.ALLOW_INPROCESS_FALLBACK:
            try:
                from ambulance_service.app.services import AmbulanceManager
                manager = AmbulanceManager()
                amb = manager.get_status(ambulance_id)
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
            except Exception:
                return None
        return None
