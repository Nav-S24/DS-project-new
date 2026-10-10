import logging
import json
import uuid
from datetime import datetime
from typing import Optional, Any, Dict

# Base logger setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)

logger = logging.getLogger("emergency_coordinator")


def generate_correlation_id() -> str:
    return f"corr-{uuid.uuid4().hex[:12]}"


def log_structured_event(
    event_type: str,
    service_name: str = "coordinator",
    incident_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    operation: Optional[str] = None,
    state_from: Optional[str] = None,
    state_to: Optional[str] = None,
    ambulance_id: Optional[str] = None,
    hospital_id: Optional[str] = None,
    event_id: Optional[str] = None,
    duration_ms: Optional[float] = None,
    result: Optional[str] = None,
    error_code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    level: int = logging.INFO
):
    """
    Emits a consistent, structured log record for distributed event tracing.
    Excludes sensitive personal data or full text report payloads.
    """
    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "event_type": event_type,
        "service_name": service_name,
        "incident_id": incident_id,
        "correlation_id": correlation_id or generate_correlation_id(),
        "operation": operation,
        "state_from": state_from,
        "state_to": state_to,
        "ambulance_id": ambulance_id,
        "hospital_id": hospital_id,
        "event_id": event_id,
        "duration_ms": duration_ms,
        "result": result,
        "error_code": error_code,
    }

    if details:
        # Sanitize details (ensure no secrets or credentials)
        clean_details = {k: v for k, v in details.items() if "pass" not in k.lower() and "secret" not in k.lower()}
        record["details"] = clean_details

    # Clean out None fields for readability
    clean_record = {k: v for k, v in record.items() if v is not None}
    logger.log(level, json.dumps(clean_record))
