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

RABBITMQ_HOST: RabbitMQ host used by the report service and notification worker. Docker Compose uses rabbitmq. The direct run default is localhost.

RABBITMQ_DEFAULT_USER: RabbitMQ username. Docker Compose uses alerts.

RABBITMQ_DEFAULT_PASS: RabbitMQ password. Docker Compose uses alerts.

WORKER_DELAY_MODE: Enables the slow worker failure simulation when set to true. The default is false.

REPLICA_LABEL: Name returned by each official alert replica. Docker Compose uses official-alert-a and official-alert-b.

REDIS_URL: Redis connection address used by the official alert service. Docker Compose uses redis://redis:6379. The direct run default is redis://localhost:6379.

CACHE_TTL_SECONDS: Alert cache lifetime in seconds. The default is 30.

ALERTS_URL: Official alert base address used by the k6 test. The default is http://localhost:3002.

AMBASSADOR_URL: Incident ambassador base address used by the k6 test. The default is http://localhost:4000.

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
