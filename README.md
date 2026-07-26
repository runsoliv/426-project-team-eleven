# 426-project-team-eleven

Team members:

Vilhjalmur Jonsson  
Github username: runsoliv  
Umass email: vjonsson@umass.edu  

Rishik Muthyala  
GitHub username: rishikmuthyala  
UMass email: rmuthyala@umass.edu  

Our system simulates an emergency weather alert network that coordinates severe weather warnings, emergency shelters, and community notifications during natural disasters such as hurricanes, tornadoes, and floods. A single server cannot handle the surge in requests and alerts during large scale emergencies when thousands of residents need real time information at once. Emergency responders and the public are directly affected when the system is slow or unavailable and delayed or inaccurate alerts can prevent people from reaching safety and coordinating an effective response.  

## Documentation

- [Project](docs/PROJECT.md)
- [Services](docs/SERVICES.md)
- [Service Level Objectives](docs/SLO.md)


## Run the system

docker compose up 

Test the incident report service (view reports)

curl http://localhost:3001/reports

Test the incident report service through the ambassador (send a report)

curl -X POST http://localhost:4000/reports \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: incident-1001" \
  -d '{
    "region": "South Florida",
    "hazardType": "flooding",
    "location": "Miami Beach",
    "description": "Flood water is blocking the road"
  }'

View ambassador logs

docker compose logs incident-ambassador

Test the official alert service (view active alerts)

curl http://localhost:3002/alerts

Test the official alert service health check

curl http://localhost:3002/health

View official alert service logs

docker compose logs official-alert-service
