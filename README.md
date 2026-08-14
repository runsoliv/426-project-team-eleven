426 Project Team Eleven

Overview

This project is an emergency weather alert system. It serves official alerts through two load balanced replicas, accepts incident reports through an ambassador, sends report events through RabbitMQ to a notification worker, and stores alert cache data in Redis. Prometheus collects service metrics and Grafana loads the system dashboard automatically.

Team members

Vilhjalmur Jonsson
GitHub username: runsoliv
UMass email: vjonsson@umass.edu

Rishik Muthyala
GitHub username: rishikmuthyala
UMass email: rmuthyala@umass.edu

Requirements

Git

Docker Desktop or Docker Engine with Docker Compose

k6 if the final load test will run without Docker

Setup

Clone the repository and enter the project directory:

    git clone https://github.com/runsoliv/426-project-team-eleven.git
    cd 426-project-team-eleven

Build and start the complete system:

    docker compose up

Check the containers:

    docker compose ps

All services with a health check should show healthy. Prometheus and Grafana should show running.

Service addresses

Grafana: http://localhost:3000

Incident report service: http://localhost:3001

Official alert service through Caddy: http://localhost:3002

Notification worker health endpoint: http://localhost:3003/health

Incident ambassador: http://localhost:4000

Prometheus: http://localhost:9090

RabbitMQ management page: http://localhost:15672

RabbitMQ username: alerts

RabbitMQ password: alerts

Grafana uses the default first login username admin and password admin. The Prometheus data source and system dashboard load automatically.

Environment variables

Docker Compose provides the required service values. No environment file is required for normal startup.

RABBITMQ_HOST

Purpose: RabbitMQ host used by the report service and notification worker.
Development value: rabbitmq
If missing: The code uses localhost. This does not work between the separate Docker containers, so the report service and worker cannot connect.

RABBITMQ_DEFAULT_USER

Purpose: Creates the RabbitMQ username used by the report service and notification worker.
Development value: alerts
If missing: RabbitMQ does not create the expected alerts user, so the report service and worker cannot authenticate.

RABBITMQ_DEFAULT_PASS

Purpose: Creates the RabbitMQ password used by the report service and notification worker.
Development value: alerts
If missing: RabbitMQ does not create the expected alerts password, so the report service and worker cannot authenticate.

WORKER_DELAY_MODE

Purpose: Enables the slow worker failure simulation.
Development value: false
If missing: The worker uses false and processes jobs normally.

REPLICA_LABEL

Purpose: Identifies which official alert replica handled a request.
Development values: official-alert-a and official-alert-b
If missing: The service uses official-alert-single.

REDIS_URL

Purpose: Redis connection address used by the official alert service.
Development value: redis://redis:6379
If missing: The code uses redis://localhost:6379. In Docker this cannot reach the separate Redis container, so alert caching is unavailable.

CACHE_TTL_SECONDS

Purpose: Sets the alert cache lifetime in seconds.
Development value: 30
If missing: The service uses 30 seconds.

ALERTS_URL

Purpose: Official alert base address used by the k6 test.
Development value: http://localhost:3002
If missing: The k6 test uses http://localhost:3002.

AMBASSADOR_URL

Purpose: Incident ambassador base address used by the k6 test.
Development value: http://localhost:4000
If missing: The k6 test uses http://localhost:4000.

Run the system

Start the complete system:

    docker compose up

Follow all service logs:

    docker compose logs -f

Stop the system:

    docker compose down

Basic tests

Get official alerts through Caddy:

    curl "http://localhost:3002/alerts?region=North%20Texas"

Send an incident report through the ambassador:

    curl -X POST http://localhost:4000/reports -H "Content-Type: application/json" -H "Idempotency-Key: incident-1001" -d '{"region":"South Florida","hazardType":"flooding","location":"Miami Beach","description":"Flood water is blocking the road"}'

Check the health endpoints:

    curl http://localhost:3001/health
    curl http://localhost:3002/health
    curl http://localhost:3003/health
    curl http://localhost:4000/health

Final load test

Start the complete system before running the test. The Sprint 5 test uses 12 virtual users for 60 seconds and exercises official alerts and incident reports.

Run with a local k6 installation:

    k6 run load-tests/sprint-5-load.js

Run with the k6 Docker image:

    docker run --rm --network 426-project-team-eleven_default -v "$PWD/load-tests:/scripts:ro" -e ALERTS_URL=http://caddy:3002 -e AMBASSADOR_URL=http://incident-ambassador:4000 grafana/k6 run /scripts/sprint-5-load.js

The final interpretation is in [results/sprint-5-load-test.md](results/sprint-5-load-test.md). The saved command output is in [results/sprint-5-load-test-raw-output.txt](results/sprint-5-load-test-raw-output.txt).

Failure test

Enable the slow notification worker:

    WORKER_DELAY_MODE=true docker compose up -d notification-worker

Return the worker to normal mode:

    WORKER_DELAY_MODE=false docker compose up -d notification-worker

Documentation

Project description: [docs/PROJECT.md](docs/PROJECT.md)

Complete service diagram: [docs/SERVICES.md](docs/SERVICES.md)

Service level objectives: [docs/SLO.md](docs/SLO.md)

Sprint 4 failure report: [results/sprint-4-failure.md](results/sprint-4-failure.md)

Sprint 5 load test report: [results/sprint-5-load-test.md](results/sprint-5-load-test.md)
