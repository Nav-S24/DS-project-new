import os


class Settings:
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "test")  # "development", "test", "production"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./emergency.db")

    # gRPC Service Addresses
    AMBULANCE_GRPC_HOST: str = os.getenv("AMBULANCE_GRPC_HOST", "localhost:50051")
    HOSPITAL_GRPC_HOST: str = os.getenv("HOSPITAL_GRPC_HOST", "localhost:50052")

    # gRPC Deadlines and Retries
    RPC_DEADLINE_SECONDS: float = float(os.getenv("RPC_DEADLINE_SECONDS", "3.0"))
    RPC_MAX_RETRIES: int = int(os.getenv("RPC_MAX_RETRIES", "2"))

    # Whether in-process service fallback is permitted (allowed in dev/test, disabled in production)
    ALLOW_INPROCESS_FALLBACK: bool = os.getenv(
        "ALLOW_INPROCESS_FALLBACK",
        "true" if os.getenv("ENVIRONMENT", "test") in ("test", "development") else "false"
    ).lower() in ("true", "1", "yes")

    # RabbitMQ Settings
    RABBITMQ_HOST: str = os.getenv("RABBITMQ_HOST", "localhost")
    RABBITMQ_PORT: int = int(os.getenv("RABBITMQ_PORT", "5672"))
    RABBITMQ_USER: str = os.getenv("RABBITMQ_USER", "guest")
    RABBITMQ_PASS: str = os.getenv("RABBITMQ_PASS", "guest")
    RABBITMQ_EXCHANGE: str = os.getenv("RABBITMQ_EXCHANGE", "emergency_events")
    RABBITMQ_QUEUE: str = os.getenv("RABBITMQ_QUEUE", "emergency_service_queue")


settings = Settings()
