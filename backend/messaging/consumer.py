import json
from datetime import datetime
from messaging.connection import get_connection
from coordinator.app.database.connection import SessionLocal
from coordinator.app.models.incident import ProcessedEvent
from coordinator.app.logging_config import log_structured_event


class DeduplicatingEventConsumer:
    """
    RabbitMQ consumer with durable database deduplication to handle duplicate events safely.
    Survives consumer process crashes and restarts.
    """
    def __init__(
        self,
        exchange_name="emergency_events",
        queue_name="emergency_service_queue",
        db_session_factory=None
    ):
        self.exchange_name = exchange_name
        self.queue_name = queue_name
        self.SessionLocal = db_session_factory or SessionLocal
        self.in_memory_cache = set()
        self.handled_events = []

    def handle_message(self, message: dict) -> bool:
        """
        Process a message safely. If already processed (checked in DB and memory), ignore without error.
        """
        msg_id = message.get("message_id")
        if not msg_id:
            return False

        # Fast path: check in-memory cache
        if msg_id in self.in_memory_cache:
            log_structured_event(
                event_type="DUPLICATE_EVENT_DETECTED_MEM",
                event_id=msg_id,
                operation="handle_message",
                result="IGNORED_DUPLICATE"
            )
            return False

        # Durable path: check database
        db = self.SessionLocal()
        try:
            existing = (
                db.query(ProcessedEvent)
                .filter(ProcessedEvent.message_id == msg_id)
                .first()
            )
            if existing:
                self.in_memory_cache.add(msg_id)
                log_structured_event(
                    event_type="DUPLICATE_EVENT_DETECTED_DB",
                    event_id=msg_id,
                    operation="handle_message",
                    result="IGNORED_DUPLICATE"
                )
                return False

            # Mark processed persistently
            record = ProcessedEvent(
                message_id=msg_id,
                event_type=message.get("event_type", "UNKNOWN"),
                processed_at=datetime.utcnow()
            )
            db.add(record)
            db.commit()

            self.in_memory_cache.add(msg_id)
            self.handled_events.append(message)

            log_structured_event(
                event_type="EVENT_PROCESSED_SUCCESSFULLY",
                incident_id=message.get("payload", {}).get("incident_id"),
                event_id=msg_id,
                operation="handle_message",
                result="PROCESSED"
            )
            return True
        except Exception as e:
            db.rollback()
            log_structured_event(
                event_type="CONSUMER_PROCESSING_ERROR",
                event_id=msg_id,
                operation="handle_message",
                result="FAILURE",
                details={"error": str(e)}
            )
            return False
        finally:
            db.close()

    def on_message_callback(self, ch, method, properties, body):
        try:
            message = json.loads(body.decode("utf-8"))
            was_new = self.handle_message(message)
            # Acknowledge only after message handled or successfully deduplicated
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception:
            # Reject and do not requeue poison messages to avoid infinite loops
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    def start_consuming(self, binding_keys=None):
        connection = get_connection()
        if not connection:
            return
        channel = connection.channel()
        channel.exchange_declare(exchange=self.exchange_name, exchange_type="topic", durable=True)
        channel.queue_declare(queue=self.queue_name, durable=True)

        keys = binding_keys or ["emergency.#"]
        for key in keys:
            channel.queue_bind(exchange=self.exchange_name, queue=self.queue_name, routing_key=key)

        channel.basic_qos(prefetch_count=10)
        channel.basic_consume(queue=self.queue_name, on_message_callback=self.on_message_callback)
        channel.start_consuming()
