import grpc
from concurrent import futures
import time

from proto import emergency_pb2_grpc
from hospital_service.app.grpc_server import HospitalServiceServicer
from coordinator.app.database.connection import init_db

# Ensure persistent database schema exists
init_db(seed=True)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    emergency_pb2_grpc.add_HospitalServiceServicer_to_server(
        HospitalServiceServicer(),
        server
    )
    server.add_insecure_port("[::]:50052")
    server.start()
    print("Hospital gRPC Service running on port 50052")
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == "__main__":
    serve()
