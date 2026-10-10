import grpc
from concurrent import futures
import time

from proto import emergency_pb2_grpc
from ambulance_service.app.grpc_server import AmbulanceServiceServicer
from coordinator.app.database.connection import init_db

# Ensure persistent database schema exists
init_db(seed=True)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    emergency_pb2_grpc.add_AmbulanceServiceServicer_to_server(
        AmbulanceServiceServicer(),
        server
    )
    server.add_insecure_port("[::]:50051")
    server.start()
    print("Ambulance gRPC Service running on port 50051")
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)


if __name__ == "__main__":
    serve()
