import uuid
import pytest
from messaging.consumer import DeduplicatingEventConsumer


def test_duplicate_rabbitmq_event_handling():
    consumer = DeduplicatingEventConsumer()
    msg_id = str(uuid.uuid4())

    event_payload = {
        "message_id": msg_id,
        "event_type": "AMBULANCE_RESERVED",
        "payload": {
            "incident_id": "INC-DEDUP-1",
            "ambulance_id": "AMB-001"
        }
    }

    # First delivery: processed
    first_result = consumer.handle_message(event_payload)
    assert first_result is True
    assert len(consumer.handled_events) == 1

    # Duplicate delivery (same message_id): safely ignored
    second_result = consumer.handle_message(event_payload)
    assert second_result is False
    assert len(consumer.handled_events) == 1

    # Third duplicate delivery: safely ignored
    third_result = consumer.handle_message(event_payload)
    assert third_result is False
    assert len(consumer.handled_events) == 1

    # New distinct message: processed
    new_payload = {
        "message_id": str(uuid.uuid4()),
        "event_type": "HOSPITAL_RESERVED",
        "payload": {
            "incident_id": "INC-DEDUP-1",
            "hospital_id": "HOSP-001"
        }
    }
    new_result = consumer.handle_message(new_payload)
    assert new_result is True
    assert len(consumer.handled_events) == 2
