************THIS REPO IS IN AN ALPHA STAGE*************
This repo is an idea based off of other open-source intelligence platforms, it's not intended to be original, it's intended to create a useful situational awareness of open data.
Long Live OSINT

# Meridian

**Open-source global situational awareness and collaborative intelligence platform.**

Monitor 150+ live data feeds — conflicts, aviation, maritime, weather, cyber threats, financial markets, and more — on an interactive map. Collaborate in real time with your team using Plan Mode.

> Self-host in under 5 minutes. Bring your own LLM (OpenAI, Anthropic, Groq, or fully local via Ollama). All core data feeds are free and open.

---

## Features

- **Interactive Map** — 64 layers across 8 categories powered by MapLibre GL JS (no Mapbox billing)
- **150+ Live Feeds** — USGS, NOAA, NASA FIRMS, ACLED, OpenSky, AISHub, CISA KEV, GDELT, and more
- **AI Analyst** — Natural language queries against all live feeds (OpenAI / Claude / Groq / Ollama)
- **Plan Mode** — Real-time collaborative workspace: shared map, annotations, event timeline, task board, watch list
- **Alerts** — Plain-English alert rules with email, webhook, Slack, and Discord delivery
- **Intelligence Reports** — AI-generated daily briefs and on-demand situation reports

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Git

### 1. Clone and configure

```bash
git clone https://github.com/your-org/meridian.git
cd meridian
cp .env.example .env
```

Edit `.env` and set your `SECRET_KEY`. Everything else is optional for a basic running instance.

### 2. Start

```bash
docker compose up
```

That's it. Visit **http://localhost:5173**.

- API docs: http://localhost:8000/docs
- API redoc: http://localhost:8000/redoc

### 3. Configure an LLM (optional)

AI features (chat, daily brief, situation reports) require a configured LLM provider.
Edit `.env` and uncomment one of the provider blocks, then restart:

```bash
# Local (free, no API key):
LITELLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2

# Or OpenAI:
LITELLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

---

## Project Structure

```
meridian/
├── apps/
│   ├── api/        # FastAPI backend — REST API, feed workers, AI services
│   ├── web/        # React + TypeScript frontend — map, panels, UI
│   └── collab/     # Node.js Yjs WebSocket server — Plan Mode real-time sync
├── infra/
│   └── schema.sql  # PostgreSQL + PostGIS + TimescaleDB schema
├── docker-compose.yml
└── .env.example
```

## Adding a Data Source

Every feed implements a single abstract base class. See `apps/api/workers/base.py`:

```python
class FeedWorker(ABC):
    source_id: str
    category: FeedCategory
    refresh_interval: int  # seconds

    async def fetch(self) -> list[GeoEvent]: ...
    def health_check(self) -> FeedStatus: ...
```

See `apps/api/workers/usgs_earthquakes.py` for a complete example.
Contributions of new data source workers are welcome — open a PR.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Map | MapLibre GL JS |
| Styling | Tailwind CSS |
| Real-time | Socket.io |
| Collaboration | Yjs + y-websocket |
| API | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 + PostGIS + TimescaleDB |
| Cache | Redis 7 |
| AI | LiteLLM (OpenAI / Anthropic / Groq / Ollama) |
| Workers | APScheduler |

## License

[AGPL-3.0](LICENSE) — free to use, modify, and self-host. Any modifications deployed as a service must be open-sourced.
