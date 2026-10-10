import time
from coordinator.app.grpc_clients.ambulance_client import (
    get_available_ambulances,
    assign_ambulance,
    release_ambulance,
    get_ambulance_status
)
from coordinator.app.grpc_clients.hospital_client import (
    get_available_hospitals,
    reserve_bed,
    release_bed,
    get_hospital_status
)
from coordinator.app.database.connection import SessionLocal
from coordinator.app.models.incident import Incident, Ambulance, HospitalReservation
from messaging.publisher import publish_event, enqueue_outbox_event, process_outbox_batch
from coordinator.app.logging_config import log_structured_event, generate_correlation_id


def dispatch_resources(incident_id: str, db=None, correlation_id: str = None):
    """
    Executes a persistent two-phase saga allocation for the given incident.
    - Saves state transitions in the database atomically.
    - Writes events to the Transactional Outbox within the same DB transaction.
    - If any step fails, triggers compensatory rollback.
    - Releases only verified resources associated with this incident.
    - Emits structured distributed logging for observability.
    """
    corr_id = correlation_id or generate_correlation_id()
    close_db_on_exit = False
    if db is None:
        db = SessionLocal()
        close_db_on_exit = True

    start_time = time.time()
    try:
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if incident:
            incident.status = "DISPATCHING"
            enqueue_outbox_event(
                db=db,
                event_type="DISPATCHING_STARTED",
                payload={"incident_id": incident_id},
                incident_id=incident_id,
                correlation_id=corr_id
            )
            db.commit()

            log_structured_event(
                event_type="SAGA_STATE_TRANSITION",
                incident_id=incident_id,
                correlation_id=corr_id,
                operation="dispatch_resources",
                state_from="REPORTED",
                state_to="DISPATCHING"
            )

        # Step 1: Query available ambulances
        ambulance_response = get_available_ambulances()

        if ambulance_response is None:
            if incident:
                incident.status = "WAITING_FOR_AMBULANCE"
                incident.dispatch_error = "AMBULANCE_SERVICE_UNAVAILABLE"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_FAILED",
                    payload={"incident_id": incident_id, "error": "AMBULANCE_SERVICE_UNAVAILABLE"},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("DISPATCH_FAILED", {
                "incident_id": incident_id,
                "error": "AMBULANCE_SERVICE_UNAVAILABLE"
            }, correlation_id=corr_id)

            log_structured_event(
                event_type="DISPATCH_FAILED",
                incident_id=incident_id,
                correlation_id=corr_id,
                error_code="AMBULANCE_SERVICE_UNAVAILABLE",
                result="FAILURE"
            )
            return {
                "ambulance_id": None,
                "hospital_id": None,
                "error": "AMBULANCE_SERVICE_UNAVAILABLE",
                "status": "WAITING_FOR_AMBULANCE"
            }

        if not ambulance_response.ambulances:
            if incident:
                incident.status = "WAITING_FOR_AMBULANCE"
                incident.dispatch_error = "NO_AMBULANCE_AVAILABLE"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_FAILED",
                    payload={"incident_id": incident_id, "error": "NO_AMBULANCE_AVAILABLE"},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("NO_AMBULANCE_AVAILABLE", {"incident_id": incident_id}, correlation_id=corr_id)
            publish_event("DISPATCH_FAILED", {
                "incident_id": incident_id,
                "error": "NO_AMBULANCE_AVAILABLE"
            }, correlation_id=corr_id)

            log_structured_event(
                event_type="DISPATCH_FAILED",
                incident_id=incident_id,
                correlation_id=corr_id,
                error_code="NO_AMBULANCE_AVAILABLE",
                result="FAILURE"
            )
            return {
                "ambulance_id": None,
                "hospital_id": None,
                "error": "NO_AMBULANCE_AVAILABLE",
                "status": "WAITING_FOR_AMBULANCE"
            }

        ambulance = ambulance_response.ambulances[0]

        # Step 2: Persistently assign ambulance
        ambulance_assignment = assign_ambulance(ambulance.id, incident_id, correlation_id=corr_id)

        if ambulance_assignment is None or not ambulance_assignment.success:
            if incident:
                incident.status = "WAITING_FOR_AMBULANCE"
                incident.dispatch_error = "AMBULANCE_ASSIGNMENT_FAILED"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_FAILED",
                    payload={"incident_id": incident_id, "error": "AMBULANCE_ASSIGNMENT_FAILED"},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("DISPATCH_FAILED", {
                "incident_id": incident_id,
                "error": "AMBULANCE_ASSIGNMENT_FAILED"
            }, correlation_id=corr_id)

            return {
                "ambulance_id": None,
                "hospital_id": None,
                "error": "AMBULANCE_ASSIGNMENT_FAILED",
                "status": "WAITING_FOR_AMBULANCE"
            }

        # Ambulance successfully reserved
        if incident:
            incident.assigned_ambulance = ambulance.id
            enqueue_outbox_event(
                db=db,
                event_type="AMBULANCE_RESERVED",
                payload={"incident_id": incident_id, "ambulance_id": ambulance.id},
                incident_id=incident_id,
                correlation_id=corr_id
            )
            db.commit()

        publish_event("AMBULANCE_RESERVED", {
            "incident_id": incident_id,
            "ambulance_id": ambulance.id
        }, correlation_id=corr_id)

        log_structured_event(
            event_type="AMBULANCE_ALLOCATED",
            incident_id=incident_id,
            ambulance_id=ambulance.id,
            correlation_id=corr_id,
            result="SUCCESS"
        )

        # Step 3: Query available hospitals
        hospital_response = get_available_hospitals()

        # Handle hospital service failure or bed exhaustion
        if hospital_response is None or not hospital_response.hospitals:
            error_reason = "HOSPITAL_SERVICE_UNAVAILABLE" if hospital_response is None else "NO_HOSPITAL_BED_AVAILABLE"

            # Transition to ROLLBACK_PENDING state
            if incident:
                incident.status = "ROLLBACK_PENDING"
                incident.dispatch_error = error_reason
                enqueue_outbox_event(
                    db=db,
                    event_type="ROLLBACK_PENDING",
                    payload={"incident_id": incident_id, "ambulance_id": ambulance.id, "reason": error_reason},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("ROLLBACK_PENDING", {
                "incident_id": incident_id,
                "ambulance_id": ambulance.id,
                "reason": error_reason
            }, correlation_id=corr_id)

            # Compensating rollback: release reserved ambulance safely
            release_ambulance(ambulance.id, incident_id, correlation_id=corr_id)

            publish_event("AMBULANCE_RELEASED", {
                "incident_id": incident_id,
                "ambulance_id": ambulance.id
            }, correlation_id=corr_id)

            if incident:
                incident.assigned_ambulance = None
                incident.status = "ROLLED_BACK"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_ROLLED_BACK",
                    payload={"incident_id": incident_id, "reason": error_reason, "ambulance_id": ambulance.id},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("DISPATCH_ROLLED_BACK", {
                "incident_id": incident_id,
                "reason": error_reason,
                "ambulance_id": ambulance.id
            }, correlation_id=corr_id)

            log_structured_event(
                event_type="SAGA_ROLLBACK_COMPLETED",
                incident_id=incident_id,
                ambulance_id=ambulance.id,
                correlation_id=corr_id,
                error_code=error_reason,
                state_from="ROLLBACK_PENDING",
                state_to="ROLLED_BACK"
            )

            return {
                "ambulance_id": None,
                "hospital_id": None,
                "error": error_reason,
                "status": "WAITING_FOR_HOSPITAL"
            }

        hospital = hospital_response.hospitals[0]

        # Step 4: Persistently reserve hospital bed
        hospital_reservation = reserve_bed(hospital.id, incident_id, correlation_id=corr_id)

        if hospital_reservation is None or not hospital_reservation.success:
            error_reason = "HOSPITAL_SERVICE_UNAVAILABLE" if hospital_reservation is None else "BED_RESERVATION_FAILED"

            if incident:
                incident.status = "ROLLBACK_PENDING"
                incident.dispatch_error = error_reason
                enqueue_outbox_event(
                    db=db,
                    event_type="ROLLBACK_PENDING",
                    payload={"incident_id": incident_id, "ambulance_id": ambulance.id, "hospital_id": hospital.id, "reason": error_reason},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("ROLLBACK_PENDING", {
                "incident_id": incident_id,
                "ambulance_id": ambulance.id,
                "hospital_id": hospital.id,
                "reason": error_reason
            }, correlation_id=corr_id)

            # Compensating rollback: release reserved ambulance safely
            release_ambulance(ambulance.id, incident_id, correlation_id=corr_id)

            publish_event("AMBULANCE_RELEASED", {
                "incident_id": incident_id,
                "ambulance_id": ambulance.id
            }, correlation_id=corr_id)

            if incident:
                incident.assigned_ambulance = None
                incident.status = "ROLLED_BACK"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_ROLLED_BACK",
                    payload={"incident_id": incident_id, "reason": error_reason, "ambulance_id": ambulance.id, "hospital_id": hospital.id},
                    incident_id=incident_id,
                    correlation_id=corr_id
                )
                db.commit()

            publish_event("DISPATCH_ROLLED_BACK", {
                "incident_id": incident_id,
                "reason": error_reason,
                "ambulance_id": ambulance.id,
                "hospital_id": hospital.id
            }, correlation_id=corr_id)

            log_structured_event(
                event_type="SAGA_ROLLBACK_COMPLETED",
                incident_id=incident_id,
                ambulance_id=ambulance.id,
                hospital_id=hospital.id,
                correlation_id=corr_id,
                error_code=error_reason,
                state_from="ROLLBACK_PENDING",
                state_to="ROLLED_BACK"
            )

            return {
                "ambulance_id": None,
                "hospital_id": None,
                "error": error_reason,
                "status": "WAITING_FOR_HOSPITAL"
            }

        # Step 5: Both resources confirmed - commit DISPATCHED
        if incident:
            incident.assigned_hospital = hospital.id
            incident.status = "DISPATCHED"
            incident.dispatch_error = None
            enqueue_outbox_event(
                db=db,
                event_type="DISPATCH_COMPLETED",
                payload={"incident_id": incident_id, "ambulance_id": ambulance.id, "hospital_id": hospital.id},
                incident_id=incident_id,
                correlation_id=corr_id
            )
            db.commit()

        publish_event("HOSPITAL_RESERVED", {
            "incident_id": incident_id,
            "hospital_id": hospital.id
        }, correlation_id=corr_id)

        publish_event("DISPATCH_COMPLETED", {
            "incident_id": incident_id,
            "ambulance_id": ambulance.id,
            "hospital_id": hospital.id
        }, correlation_id=corr_id)

        duration_ms = (time.time() - start_time) * 1000
        log_structured_event(
            event_type="SAGA_DISPATCH_SUCCESS",
            incident_id=incident_id,
            ambulance_id=ambulance.id,
            hospital_id=hospital.id,
            correlation_id=corr_id,
            duration_ms=duration_ms,
            state_from="DISPATCHING",
            state_to="DISPATCHED",
            result="SUCCESS"
        )

        return {
            "ambulance_id": ambulance.id,
            "hospital_id": hospital.id,
            "error": None,
            "status": "DISPATCHED"
        }
    finally:
        if close_db_on_exit:
            db.close()


def reconcile_and_recover_incidents(db=None):
    """
    Recovers incomplete or stuck dispatches (e.g. after coordinator crash).
    - Detects incidents stuck in intermediate states (DISPATCHING, ROLLBACK_PENDING).
    - Safely rolls back incomplete allocations or finalizes completed ones.
    - Idempotent and safe to run on boot or periodically.
    - Also drains and flushes pending outbox events.
    """
    close_db_on_exit = False
    if db is None:
        db = SessionLocal()
        close_db_on_exit = True

    recovered = []
    try:
        pending_incidents = (
            db.query(Incident)
            .filter(Incident.status.in_(["DISPATCHING", "ROLLBACK_PENDING"]))
            .all()
        )

        for incident in pending_incidents:
            corr_id = generate_correlation_id()
            if incident.status == "ROLLBACK_PENDING":
                # Ensure resources are released
                if incident.assigned_ambulance:
                    release_ambulance(incident.assigned_ambulance, incident.id, correlation_id=corr_id)
                    publish_event("AMBULANCE_RELEASED", {
                        "incident_id": incident.id,
                        "ambulance_id": incident.assigned_ambulance
                    }, correlation_id=corr_id)
                if incident.assigned_hospital:
                    release_bed(incident.assigned_hospital, incident.id, correlation_id=corr_id)

                incident.assigned_ambulance = None
                incident.assigned_hospital = None
                incident.status = "ROLLED_BACK"
                enqueue_outbox_event(
                    db=db,
                    event_type="DISPATCH_ROLLED_BACK",
                    payload={"incident_id": incident.id, "reason": "RECOVERY_ROLLBACK_COMPLETED"},
                    incident_id=incident.id,
                    correlation_id=corr_id
                )
                db.commit()

                publish_event("DISPATCH_ROLLED_BACK", {
                    "incident_id": incident.id,
                    "reason": "RECOVERY_ROLLBACK_COMPLETED"
                }, correlation_id=corr_id)
                recovered.append({"incident_id": incident.id, "action": "ROLLED_BACK"})

            elif incident.status == "DISPATCHING":
                # Check actual resource state
                has_amb = False
                has_hosp = False

                if incident.assigned_ambulance:
                    amb_status = get_ambulance_status(incident.assigned_ambulance)
                    if amb_status and amb_status.found and amb_status.ambulance.current_incident_id == incident.id:
                        has_amb = True

                if incident.assigned_hospital:
                    hosp_res = (
                        db.query(HospitalReservation)
                        .filter(
                            HospitalReservation.hospital_id == incident.assigned_hospital,
                            HospitalReservation.incident_id == incident.id,
                            HospitalReservation.status == "ACTIVE"
                        )
                        .first()
                    )
                    if hosp_res:
                        has_hosp = True

                if has_amb and has_hosp:
                    incident.status = "DISPATCHED"
                    incident.dispatch_error = None
                    enqueue_outbox_event(
                        db=db,
                        event_type="DISPATCH_COMPLETED",
                        payload={"incident_id": incident.id, "ambulance_id": incident.assigned_ambulance, "hospital_id": incident.assigned_hospital},
                        incident_id=incident.id,
                        correlation_id=corr_id
                    )
                    db.commit()
                    publish_event("DISPATCH_COMPLETED", {
                        "incident_id": incident.id,
                        "ambulance_id": incident.assigned_ambulance,
                        "hospital_id": incident.assigned_hospital
                    }, correlation_id=corr_id)
                    recovered.append({"incident_id": incident.id, "action": "FINALIZED_DISPATCH"})
                else:
                    # Incomplete: rollback any held ambulance
                    if incident.assigned_ambulance:
                        release_ambulance(incident.assigned_ambulance, incident.id, correlation_id=corr_id)
                        publish_event("AMBULANCE_RELEASED", {
                            "incident_id": incident.id,
                            "ambulance_id": incident.assigned_ambulance
                        }, correlation_id=corr_id)
                    if incident.assigned_hospital:
                        release_bed(incident.assigned_hospital, incident.id, correlation_id=corr_id)

                    incident.assigned_ambulance = None
                    incident.status = "ROLLED_BACK"
                    enqueue_outbox_event(
                        db=db,
                        event_type="DISPATCH_ROLLED_BACK",
                        payload={"incident_id": incident.id, "reason": "RECOVERY_INCOMPLETE_ROLLBACK"},
                        incident_id=incident.id,
                        correlation_id=corr_id
                    )
                    db.commit()
                    publish_event("DISPATCH_ROLLED_BACK", {
                        "incident_id": incident.id,
                        "reason": "RECOVERY_INCOMPLETE_ROLLBACK"
                    }, correlation_id=corr_id)
                    recovered.append({"incident_id": incident.id, "action": "ROLLED_BACK"})

        # Process any pending outbox events
        try:
            process_outbox_batch(db=db)
        except Exception:
            pass

        return recovered
    finally:
        if close_db_on_exit:
            db.close()
