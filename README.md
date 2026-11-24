# DRC Platform: Disaster Response and Rescue Coordination

DRC Platform helps emergency teams move from scattered distress calls to coordinated rescue action. Citizens submit SOS reports from a web or mobile app, and each report is recorded with its category, description, location, and number of people affected or trapped. The system groups related reports into a single incident using distance, time, category, and text similarity. Officers review uncertain matches, confirm or reject them, merge or split incidents, and route each incident to the right department. Every priority decision can be overridden by a person, and the reason is recorded in an audit log.

For areas that are hard to reach, the platform plans drone surveys. An officer generates a mission job card with a target area and known hazards, and a pilot accepts it, flies the survey, and submits field observations with coordinates and photos. The system combines these findings with citizen reports to produce a nine-section rescue intelligence report, available as JSON and PDF.

## Project structure

- `backend/`: FastAPI service with PostgreSQL, Alembic migrations, tests, and Docker support
- `frontend/`: Next.js operations dashboard and citizen report page, plus an Expo mobile app in `mobile/`

## Run locally

**Backend**

```bash
cd backend
cp .env.example .env
docker compose up --build
# in a second terminal, once the containers are running:
docker compose exec backend python scripts/seed_demo.py
```

Without Docker, set `DATABASE_URL="sqlite+aiosqlite:///./disaster_platform.db"` in `.env`, then run:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API documentation is at http://localhost:8000/docs.

**Frontend**

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

Open http://localhost:3000.

Demo accounts created by the seed script use the password `Password123!`:

| Role | Email |
|---|---|
| Admin | admin@disaster.org |
| Officer | officer.john@disaster.org |
| Pilot | pilot.sarah@rescue.org |
| Citizen | alice@citizen.org |

## Tests

```bash
cd backend
pytest -q
```

## Status and limitations

This is a hackathon prototype. AI image and audio analysis use simulated providers by default. The Twilio voice hotline uses placeholder credentials, and drone telemetry is simulated. The demo runs in simulated mode unless real services are configured.

Full integration and deployment steps are in `DRC_INTEGRATION_AND_DEPLOY.md`.

## License

Add your chosen license here.