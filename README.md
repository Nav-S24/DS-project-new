DISTRIBUTED EMERGENCY RESPONSE SYSTEM

PROJECT OVERVIEW

A distributed emergency dispatch system that coordinates emergency
incidents, ambulances, hospitals, and other emergency resources.

The project demonstrates distributed computing concepts including: -
REST/HTTP communication - gRPC remote procedure calls - RabbitMQ
asynchronous messaging - PostgreSQL persistent storage - SQLAlchemy
ORM - Resource allocation - Fault handling and rollback - Event-driven
processing


TECHNOLOGIES

Python, FastAPI, PostgreSQL, SQLAlchemy, gRPC, Protocol Buffers,
RabbitMQ, REST/HTTP, and the frontend technology used in frontend_ds.

HOW THE SYSTEM WORKS

1.  A user creates an emergency incident from the frontend.
2.  The coordinator receives the request through REST/HTTP.
3.  The incident is stored in PostgreSQL.
4.  The coordinator requests available ambulances through gRPC.
5.  An available ambulance is assigned.
6.  The coordinator requests available hospitals through gRPC.
7.  A hospital bed is reserved.
8.  If both resources are successfully allocated, dispatch is completed.
9.  Important state changes are published through RabbitMQ.
10. The frontend displays the dispatch result and status.