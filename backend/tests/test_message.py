import pytest
from messaging.publisher import publish_event, PUBLISHED_EVENTS


def test_messaging_event_publication():
    initial_count = len(PUBLISHED_EVENTS)
    published = publish_event("INCIDENT_CREATED", {
        "incident_id": "INC-MSG-01",
        "description": "Test incident",
        "severity": "HIGH"
    })
    # Audited regardless of offline/online broker
    assert len(PUBLISHED_EVENTS) == initial_count + 1
    last_event = PUBLISHED_EVENTS[-1]
    assert last_event["event_type"] == "INCIDENT_CREATED"
    assert last_event["payload"]["incident_id"] == "INC-MSG-01"
