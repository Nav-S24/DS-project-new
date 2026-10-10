import os
import json
import uuid
from datetime import datetime
import pika
from messaging.connection import get_connection
from coordinator.app.models.incident import OutboxEvent
from coordinator.app.logging_config import log_structured_event
from coordinator.app.config import settings

# In-memory event audit log for test verification and telemetry
PUBLISHED_EVENTS = []


def enqueue_outbox_event(
    db,
    event_type: str,
    payload: dict,
    incident_id: str = None,
    correlation_id: str = None
) -> OutboxEvent:
    """
    Transactional Outbox Pattern:
    Persists event into the outbox table within the SAME database transaction as state changes.
    Guarantees event persistence even if broker is unreachable or application crashes immediately after commit.
    """
    event_id = str(uuid.uuid4())
    outbox_record = OutboxEvent(
        id=event_id,
        event_type=event_type,
        incident_id=incident_id or payload.get("incident_id"),
        payload=json.dumps(payload),
        status="PENDING",
        retry_count=0,
        correlation_id=correlation_id,
        created_at=datetime.utcnow()
    )
    db.add(outbox_record)
    return outbox_record


def publish_event(event_type: str, payload: dict, correlation_id: str = None) -> bool:
    """
    Publishes an event to RabbitMQ emergency_events exchange.
    Includes message_id and timestamp for idempotent consumption and deduplication.
    """
    message_id = str(uuid.uuid4())
    message = {
        "message_id": message_id,
        "event_type": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "correlation_id": correlation_id,
        "payload": payload
    }

    # Record in audit list for inspection
    PUBLISHED_EVENTS.append(message)

    connection = get_connection()
    if connection:
        try:
            channel = connection.channel()
            # Enable publisher confirms
            channel.confirm_delivery()
            channel.exchange_declare(
                exchange=settings.RABBITMQ_EXCHANGE,
                exchange_type="topic",
                durable=True
            )
            channel.basic_publish(
                exchange=settings.RABBITMQ_EXCHANGE,
                routing_key=f"emergency.{event_type.lower()}",
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Persistent message
                    message_id=message_id,
                    content_type="application/json"
                ),
                mandatory=False
            )
            connection.close()

            log_structured_event(
                event_type="RABBITMQ_EVENT_PUBLISHED",
                incident_id=payload.get("incident_id"),
                event_id=message_id,
                correlation_id=correlation_id,
                operation="publish_event",
                result="SUCCESS",
                details={"topic": f"emergency.{event_type.lower()}"}
            )
            return True
        except Exception as e:
            log_structured_event(
                event_type="RABBITMQ_PUBLISH_FAILED",
                incident_id=payload.get("incident_id"),
                event_id=message_id,
                correlation_id=correlation_id,
                operation="publish_event",
                result="FAILURE",
                error_code="BROKER_UNAVAILABLE",
                details={"error": str(e)}
            )
            return False
    return False


def process_outbox_batch(db, limit: int = 50) -> int:
    """
    Processes pending outbox events and attempts delivery to RabbitMQ.
    Marks successfully published events as PUBLISHED.
    """
    pending_events = (
        db.query(OutboxEvent)
        .filter(OutboxEvent.status == "PENDING")
        .order_by(OutboxEvent.created_at.asc())
        .limit(limit)
        .all()
    )

    published_count = 0
    for event in pending_events:
        try:
            payload = json.loads(event.payload)
            success = publish_event(
                event_type=event.event_type,
                payload=payload,
                correlation_id=event.correlation_id
            )
            if success:
                event.status = "PUBLISHED"
                event.published_at = datetime.utcnow()
                published_count += 1
            else:
                event.retry_count += 1
                if event.retry_count >= 5:
                    event.status = "FAILED"
        except Exception:
            event.retry_count += 1
            if event.retry_count >= 5:
                event.status = "FAILED"

    db.commit()
    return published_count
