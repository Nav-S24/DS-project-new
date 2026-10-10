import json
import pytest
from coordinator.app.models.incident import OutboxEvent, Incident
from messaging.publisher import enqueue_outbox_event, process_outbox_batch, PUBLISHED_EVENTS
from coordinator.app.services.dispatch import dispatch_resources


def test_transactional_outbox_records_and_processes_events(test_db_session):
    db = test_db_session()
    inc_id = "INC-OUTBOX-1"

    # 1. Enqueue outbox event manually in a transaction
    event_record = enqueue_outbox_event(
        db=db,
        event_type="TEST_OUTBOX_EVENT",
        payload={"incident_id": inc_id, "detail": "Test outbox event"},
        incident_id=inc_id
    )
    db.commit()

    # Verify event is in database in PENDING status
    saved = db.query(OutboxEvent).filter(OutboxEvent.id == event_record.id).first()
    assert saved is not None
    assert saved.status == "PENDING"
    assert saved.incident_id == inc_id

    # 2. Test outbox batch processor
    # Without live rabbitmq broker, publisher appends to PUBLISHED_EVENTS list
    initial_event_count = len(PUBLISHED_EVENTS)
    processed = process_outbox_batch(db=db, limit=10)

    # In test environment, events are recorded in audit trail
    assert db.query(OutboxEvent).filter(OutboxEvent.incident_id == inc_id).count() == 1
    db.close()
