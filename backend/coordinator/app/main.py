import time
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from coordinator.app.database.connection import init_db, get_db, SessionLocal
from coordinator.app.api.routes import incidents, ambulances
from coordinator.app.services.dispatch import reconcile_and_recover_incidents
from coordinator.app.grpc_clients.ambulance_client import get_available_ambulances
from coordinator.app.grpc_clients.hospital_client import get_available_hospitals
from coordinator.app.models.incident import OutboxEvent
from messaging.connection import get_connection
from messaging.publisher import process_outbox_batch
from coordinator.app.config import settings

# Initialize database schema and seed persistent resources
init_db(seed=True)

# Run startup recovery for incomplete intermediate dispatches (crash recovery)
try:
    reconcile_and_recover_incidents()
except Exception as e:
    print(f"Startup reconciliation warning: {e}")

app = FastAPI(title="Distributed Emergency Response Coordinator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "emergency-coordinator",
        "version": "1.0.0",
        "status": "running",
        "environment": settings.ENVIRONMENT
    }


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """
    Comprehensive distributed cluster health check.
    Probes real dependencies: Database, Ambulance gRPC, Hospital gRPC, RabbitMQ.
    Distinguishes running process from genuine dependency availability.
    """
    components = {}
    is_healthy = True

    # 1. Probe Database
    try:
        t0 = time.time()
        db.execute(text("SELECT 1"))
        db_latency_ms = round((time.time() - t0) * 1000, 2)
        components["database"] = {
            "status": "healthy",
            "latency_ms": db_latency_ms,
            "type": "postgresql" if "postgres" in settings.DATABASE_URL else "sqlite"
        }
    except Exception as e:
        components["database"] = {"status": "unhealthy", "error": str(e)}
        is_healthy = False

    # 2. Probe Ambulance gRPC Service
    try:
        t0 = time.time()
        amb_resp = get_available_ambulances(retries=0)
        amb_latency_ms = round((time.time() - t0) * 1000, 2)
        components["ambulance_grpc"] = {
            "status": "healthy" if amb_resp is not None else "degraded",
            "latency_ms": amb_latency_ms,
            "target": settings.AMBULANCE_GRPC_HOST
        }
    except Exception as e:
        components["ambulance_grpc"] = {"status": "unhealthy", "error": str(e)}

    # 3. Probe Hospital gRPC Service
    try:
        t0 = time.time()
        hosp_resp = get_available_hospitals(retries=0)
        hosp_latency_ms = round((time.time() - t0) * 1000, 2)
        components["hospital_grpc"] = {
            "status": "healthy" if hosp_resp is not None else "degraded",
            "latency_ms": hosp_latency_ms,
            "target": settings.HOSPITAL_GRPC_HOST
        }
    except Exception as e:
        components["hospital_grpc"] = {"status": "unhealthy", "error": str(e)}

    # 4. Probe RabbitMQ Broker
    try:
        conn = get_connection()
        if conn:
            conn.close()
            components["rabbitmq"] = {
                "status": "healthy",
                "target": f"{settings.RABBITMQ_HOST}:{settings.RABBITMQ_PORT}"
            }
        else:
            components["rabbitmq"] = {
                "status": "degraded",
                "message": "Broker offline - transactional outbox fallback active",
                "target": f"{settings.RABBITMQ_HOST}:{settings.RABBITMQ_PORT}"
            }
    except Exception as e:
        components["rabbitmq"] = {"status": "unhealthy", "error": str(e)}

    # 5. Outbox pending events
    try:
        pending_outbox = db.query(OutboxEvent).filter(OutboxEvent.status == "PENDING").count()
        components["transactional_outbox"] = {
            "status": "healthy",
            "pending_events": pending_outbox
        }
    except Exception:
        components["transactional_outbox"] = {"status": "unknown"}

    overall_status = "healthy" if is_healthy and all(c.get("status") == "healthy" for c in components.values()) else "degraded" if is_healthy else "unhealthy"

    return {
        "status": overall_status,
        "timestamp": time.time(),
        "environment": settings.ENVIRONMENT,
        "components": components
    }


@app.post("/outbox/flush")
def flush_outbox(db: Session = Depends(get_db)):
    """
    Manually triggers outbox delivery to RabbitMQ.
    """
    published = process_outbox_batch(db)
    return {
        "status": "flush_complete",
        "published_count": published
    }


app.include_router(incidents.router)
app.include_router(ambulances.router)
