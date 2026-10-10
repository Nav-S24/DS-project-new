import uuid
import pytest
from messaging.consumer import DeduplicatingEventConsumer
from coordinator.app.models.incident import ProcessedEvent


def test_persistent_deduplication_survives_consumer_restart(test_db_session):
    msg_id = str(uuid.uuid4())
    event_payload = {
        "message_id": msg_id,
        "event_type": "AMBULANCE_RESERVED",
        "payload": {"incident_id": "INC-DURABLE-1", "ambulance_id": "AMB-001"}
    }

    # Consumer Instance 1 receives message
    consumer_1 = DeduplicatingEventConsumer(db_session_factory=test_db_session)
    result_1 = consumer_1.handle_message(event_payload)
    assert result_1 is True

    # Verify message_id is recorded in the persistent database
    db = test_db_session()
    record = db.query(ProcessedEvent).filter(ProcessedEvent.message_id == msg_id).first()
    assert record is not None
    assert record.message_id == msg_id
    db.close()

    # "Crash" and destroy consumer 1 (clearing its in-memory cache)
    del consumer_1

    # Consumer Instance 2 boots up with an empty in-memory cache
    consumer_2 = DeduplicatingEventConsumer(db_session_factory=test_db_session)
    assert len(consumer_2.in_memory_cache) == 0

    # Duplicate message is delivered to Consumer 2
    result_2 = consumer_2.handle_message(event_payload)
    # Must be safely rejected/ignored due to database record!
    assert result_2 is False
    assert len(consumer_2.handled_events) == 0
