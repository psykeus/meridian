# Meridian Platform — Complete Feature Guide

> **Meridian** is an open-source global situational awareness platform that ingests 69+ live data feeds, displays them on an interactive map, and supports real-time collaborative intelligence analysis.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard & Navigation](#2-dashboard--navigation)
3. [Interactive Map](#3-interactive-map)
4. [Intelligence Panels](#4-intelligence-panels)
5. [Deck Presets](#5-deck-presets)
6. [Data Sources & Feed Workers](#6-data-sources--feed-workers)
7. [AI Intelligence Suite](#7-ai-intelligence-suite)
8. [Alert System](#8-alert-system)
9. [Plan Mode — Collaborative Analysis](#9-plan-mode--collaborative-analysis)
10. [Watch List & Entity Tracking](#10-watch-list--entity-tracking)
11. [Situation Reports](#11-situation-reports)
12. [Authentication & Security](#12-authentication--security)
13. [Settings & Configuration](#13-settings--configuration)
14. [Feed Health Monitoring](#14-feed-health-monitoring)
15. [Organizations & Billing](#15-organizations--billing)
16. [REST API Reference](#16-rest-api-reference)
17. [Keyboard Shortcuts](#17-keyboard-shortcuts)
18. [Architecture Overview](#18-architecture-overview)

---

## 1. Getting Started

### First Launch — Onboarding Tutorial

New users are greeted with a **7-step interactive onboarding** walkthrough at `/onboarding`:

| Step | Topic | What You Learn |
|------|-------|---------------|
| 1 | Welcome | Platform purpose and capabilities |
| 2 | Dashboard | Panel layout, deck switching, grid customization |
| 3 | Live Map | Map controls, layers, markers, base styles |
| 4 | Alert Rules | Creating alert rules for automated notifications |
| 5 | Plan Mode | Collaborative rooms, annotations, task boards |
| 6 | AI Intelligence | AI chat, daily briefs, anomaly detection |
| 7 | Ready | Get started with the Command Center |

The onboarding state is stored locally. You can revisit it anytime.

### Quick Start

1. **Log in** or **Register** with email/password or Google OAuth
2. You arrive at the **Dashboard** with the Command Center deck active
3. The **map** (top 55%) shows live events from 69+ feeds
4. The **panel grid** (bottom 45%) shows curated intelligence panels
5. Use the **Deck Switcher** in the top nav to change dashboard presets
6. Click any **event marker** on the map to open the Context Drawer with details

---

## 2. Dashboard & Navigation

### Layout Structure

```
┌──────────────────────────────────────────────────┐
│  TopNav: MERIDIAN | Deck Switcher | Layers | UTC │
├──┬───────────────────────────────────────────────┤
│  │  Interactive Map (55% height)                  │
│  │  + LayerPanel  + TimeScrubber  + Search Bar    │
│S ├───────────────────────────────────────────────┤
│I │  Panel Grid (45% height)                       │
│D │  Draggable, resizable intelligence panels      │
│E │  Organized by active Deck preset               │
│  ├───────────────────────────────────────────────┤
│  │  Minimized Panel Pills (if any)                │
└──┴───────────────────────────────────────────────┘
```

### Top Navigation Bar

| Element | Description |
|---------|-------------|
| **MERIDIAN** logo | Brand + "OPEN SOURCE" badge |
| **Deck Switcher** | Dropdown to switch between 10 intelligence dashboard presets |
| **Layer Toggle** | Opens/closes the Layer Panel; shows active layer count |
| **Feed Health** | Live indicator — green/orange/red dot with "X/Y feeds" status |
| **Share View** | Copies current deck + layer state as a shareable URL |
| **UTC Clock** | Real-time UTC timestamp (HH:MM:SS), updates every second |
| **Notifications** | Bell icon with red unread count badge; opens Notification Center |
| **Settings** | Link to Settings page |

### Side Navigation

Emoji-based icon sidebar (48px wide) for quick page access:

| Icon | Page | Path |
|------|------|------|
| ◉ | Dashboard | `/` |
| ⊕ | Plan Mode | `/plan` |
| ◎ | Watch List | `/watch` |
| ◈ | Feed Health | `/feeds` |
| ⚑ | Alert Rules | `/alerts` |
| ≡ | Sitrep Builder | `/sitrep` |
| ⊙ | Settings | `/settings` |

### Panel Grid

- **Drag and resize** panels freely using react-grid-layout (12-column grid)
- **Minimize** a panel to a pill at the bottom of the screen
- **Maximize** a panel to a full-screen overlay (90% viewport)
- **Restore** minimized panels by clicking their pill

---

## 3. Interactive Map

### Map Engine

Built on **MapLibre GL JS** — a high-performance, GPU-accelerated vector map renderer.

### Base Map Styles

| Style | Source | Best For |
|-------|--------|----------|
| **Dark** (default) | CartoDB Dark Matter | Low-light operations, reduced eye strain |
| **Light** | CartoDB Voyager | Daytime use, print-friendly |
| **Streets** | OpenFreeMap | Street-level navigation |
| **Terrain** | OpenTopoMap | Elevation, terrain analysis |
| **Satellite** | ESRI World Imagery | Aerial/satellite reconnaissance |

### Event Markers

- **Severity-based sizing**: Critical (30px) → High (24px) → Medium (18px) → Low (14px) → Info (10px)
- **Source-based coloring**: Each data source has a distinct color
- **Pulse animation**: Critical events have a pulsing glow effect
- **Click** any marker to open the Context Drawer with full event details

### Marker Clustering

At low zoom levels, nearby markers automatically cluster into numbered circles. Click a cluster to zoom into its bounds and see individual events.

### Layer Panel (280px sidebar)

Toggle visibility of **60+ map layers** organized into 8 groups:

| Group | Example Layers |
|-------|---------------|
| **Environment** | Earthquakes, Wildfires, Hurricanes, Floods, Tsunami Warnings, Weather Radar |
| **Security** | Armed Conflicts, Airstrikes, Terrorism, Sanctions, Internet Censorship |
| **Aviation** | Civil Flights, Military Aircraft, Emergency Squawks, VIP Aircraft, Bomber/ISR |
| **Maritime** | Vessel Positions, Naval Ships, Piracy Incidents, Chokepoints |
| **Military** | Military Bases, Nuclear Sites, Missile Zones, Exercises |
| **Humanitarian** | Refugees, Disease Outbreaks, FEMA Disasters, Shelters |
| **Cyber/Space** | ISS, Satellites, Internet Outages, Submarine Cables |
| **Energy** | Nuclear Plants, Power Grid, LNG Terminals, Oil/Gas Infrastructure |

Each layer has:
- Toggle checkbox (on/off)
- Opacity slider (0–100%)
- Icon and description

### Map Search

Press `/` or click the search box to search for:
- **Places** — powered by Nominatim (OpenStreetMap geocoding)
- **Events** — search event titles from the live feed
- **Coordinates** — type `lat, lng` to jump directly to a location

### Right-Click Context Menu

Right-click anywhere on the map to:
- View **coordinates** at that point
- Find **nearby events** within a configurable radius
- **Add to Plan** — create an annotation in an active Plan Room
- **Measure** from that point

### Time Scrubber

Located at the bottom center of the map, the Time Scrubber allows historical event replay:

- **Preset windows**: 6h, 24h, 3d, 7d, 30d, 90d
- **Custom range**: Pick any start/end datetime (up to 180-day window)
- **Playback controls**: Play/Pause with speed multiplier (0.5×, 1×, 2×, 4×)
- **REPLAY MODE** badge appears when viewing historical data
- Click **LIVE** to return to real-time event streaming

### Context Drawer (Event Detail Panel)

When you click an event marker or row in any panel, a 360px slide-in drawer opens with:

| Section | Content |
|---------|---------|
| **Header** | Severity badge, data source badge, event title |
| **Description** | Full event body/description |
| **Location** | Latitude/longitude coordinates |
| **Metadata** | Source-specific fields (ICAO24, callsign, altitude, magnitude, CVSS score, etc.) |
| **Source** | Data source name, refresh rate, link to original |
| **AI Summary** | On-demand AI-generated 2-3 sentence summary |
| **Add to Plan** | Pin event to a Plan Room's tracked entities |
| **Nearby Events** | Cross-referenced events within a 2° radius |

### Annotation Layer

When in Plan Mode, annotations from the active room render on the map as interactive overlays:
- **POI markers** — clickable point annotations
- **Region polygons** — filled area boundaries
- **Route lines** — path/trajectory lines
- **Range circles** — radius-based areas
- **Arrows** — directional indicators
- **Text labels** — positioned text annotations
- **Freehand drawings** — hand-drawn paths

### Real-Time Collaboration Cursors

In Plan Mode, other connected users' cursors appear on the map as colored, named indicators. You can see where your teammates are looking in real time.

---

## 4. Intelligence Panels

Meridian includes **22 specialized panels** that aggregate, visualize, and present data from the platform's feeds. Each panel has:
- A **drag handle** for repositioning
- **Minimize** (collapse to pill) and **Maximize** (full-screen overlay) buttons
- A **PanelHeader** with title, source label, live indicator, and event count
- A **PanelSummaryCard** with contextual description

### Panel Directory

#### Conflict & Security

| Panel | Sources | Features |
|-------|---------|----------|
| **Conflict Monitor** | ACLED, GDELT | Armed conflicts, airstrikes, protests, geopolitical events. Severity-coded rows. |
| **Military Tracker** | OpenSky, AISHub | Tab switcher: AIR (military aircraft with squawk codes) and NAVAL (military vessels by MMSI). |
| **Force Posture** | OpenSky, AISHub, USNI | Carrier Strike Group status table (4 CSGs: deployed/underway/in-port). Military event list. |
| **Geopolitical Risk** | AI Risk Engine | Bar chart of top 10 countries by AI-computed risk score (0–100). Color-coded tiers: critical/high/medium/low/minimal. |

#### Environment & Natural Hazards

| Panel | Sources | Features |
|-------|---------|----------|
| **Weather & Seismic** | USGS, NOAA, GDACS | Earthquakes, severe weather, hurricanes, wildfires, floods. Severity badges with time-ago. |
| **Space & Launches** | NASA ISS, NOAA Space Weather | ISS live position (lat/lng/altitude), space weather Kp index, upcoming launch schedule. |
| **Nuclear & WMD** | IAEA, NRC, EURDEP | Reactors online count, radiation anomalies, NRC events. Weapons program monitor (Iran, DPRK). |

#### Aviation & Maritime

| Panel | Sources | Features |
|-------|---------|----------|
| **Air Traffic Radar** | OpenSky | Radius selector (25/50/100/250mi), emergency squawk detection (7700/7600/7500), KPI badges. |
| **Aviation Tracker** | OpenSky, adsb.lol | KPI grid (airborne/military/emergencies/countries), emergency highlight section. |
| **Naval Forces** | AISHub | KPI badges (AIS vessels/military count), vessel list with speed/destination, military flag. |
| **Supply Chain** | AISHub, BDI | Chokepoint status table (6 strategic straits), piracy incidents, Baltic Dry Index. |

#### Cyber & Infrastructure

| Panel | Sources | Features |
|-------|---------|----------|
| **Cyber Threat Monitor** | CISA KEV, NVD, Cloudflare, MalwareBazaar | **Recharts pie chart** of vulnerability severity distribution. CVE list with ransomware flags. |
| **Energy & Resources** | EIA, ENTSO-E, Baker Hughes | **Recharts bar chart** of grid load %. Color-coded status: CRITICAL (>85%), ELEVATED (>70%), NORMAL. |

#### Finance & Markets

| Panel | Sources | Features |
|-------|---------|----------|
| **Markets & Finance** | Alpha Vantage, Finnhub, CoinGecko | **Recharts bar chart** of asset % changes. Green/red gain/loss indicators. Price display. |

#### Humanitarian & Health

| Panel | Sources | Features |
|-------|---------|----------|
| **Humanitarian Alerts** | FEMA, GDACS, ReliefWeb | Severity-colored alert rows with incident type and time-ago. |

#### Intelligence & OSINT

| Panel | Sources | Features |
|-------|---------|----------|
| **Global News Feed** | Reuters, AP, BBC RSS, GDELT | Source badges, headline + body preview, time-ago stamps. |
| **Social Intel** | RSS, GDELT, WHO, ACLED, ProMED | Signal strength filter (15/30/55/80). Source type badges (MEDIA/WIRE/GOV/NGO/MED). |
| **Correlation Engine** | All feeds (cross-reference) | Detects multi-feed patterns: environment+humanitarian cascades, geopolitical+maritime, cyber clusters. |

#### AI-Powered Panels

| Panel | Sources | Features |
|-------|---------|----------|
| **AI Analyst** | `/ai/chat` endpoint | Streaming chat with 12 example queries. Auto-detects coordinates in responses with "Show on map" buttons. |
| **Daily Brief** | `/ai/brief/daily` | Dual tabs: **Daily** (executive summary + expandable category summaries) and **Personalized** (category/region filters). |
| **Sitrep Builder** | `/ai/report` endpoint | Topic input, 4-phase generation indicator, streaming section-by-section report display. |
| **Intel Board** | Plan Room API | Classified intelligence notes with UNCLASSIFIED/CONFIDENTIAL/SECRET/TOP SECRET levels. Pin/unpin notes. |

---

## 5. Deck Presets

Decks are themed dashboard configurations that bundle specific panels and map layers for different use cases.

| # | Deck | Icon | Panels | Pre-enabled Layers |
|---|------|------|--------|--------------------|
| 1 | **Command Center** | ◉ | Conflict, Weather, News, Markets, Military, Naval | Earthquakes, conflicts, weather, squawks, flights, wildfires, FEMA |
| 2 | **War & Conflict** | ⚔ | Conflict, Force Posture, Military, News, Naval | Armed conflicts, GDELT, squawks, flights, vessels |
| 3 | **Environment & Climate** | 🌍 | Weather, Humanitarian, News | Earthquakes, wildfires, weather, hurricanes, disasters |
| 4 | **Maritime & Trade** | ⚓ | Naval, Supply Chain, Markets, News | Vessels, conflicts, news |
| 5 | **Cyber & Infrastructure** | ⚡ | Cyber, News, Markets | CISA KEV, news |
| 6 | **Financial Intelligence** | ₿ | Markets, Energy, Geopolitical Risk, News | News, conflicts |
| 7 | **Aviation Tracker** | ✈ | Air Radar, Aviation, Military, Weather | Squawks, conflicts |
| 8 | **Humanitarian Response** | 🏥 | Humanitarian, Weather, News | Disasters, wildfires, weather |
| 9 | **AI Analyst** | 🤖 | AI Analyst, Sitrep, Correlation, Risk | Conflicts, earthquakes, weather |
| 10 | **Situational Awareness** | ◈ | Conflict, Weather, Risk, Military, Naval, Correlation, AI | Earthquakes, conflicts, weather, wildfires, vessels, squawks |

Switch decks via the **Deck Switcher** dropdown in the top navigation bar.

---

## 6. Data Sources & Feed Workers

Meridian ingests data from **69+ feed workers** spanning 12 categories. Each worker extends a common `FeedWorker` base class with a configurable refresh interval.

### Environment & Natural Hazards (9 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| USGS Earthquakes | USGS FDSN | 60s | Global earthquakes M2.5+ |
| NOAA Weather Alerts | NOAA NWS | 2min | Tornado, hurricane, severe weather warnings |
| NASA FIRMS Wildfires | NASA VIIRS | 3hr | Satellite-detected active fire hotspots |
| GDACS Disasters | GDACS | 30min | Multi-hazard global disaster alerts |
| USGS Streamflow | USGS Water Services | 15min | River gauges and flood stage monitoring |
| NASA EONET | NASA Earth Observatory | 10min | Natural events (storms, dust, volcanic ash) |
| Volcano Activity | VolcanoDiscovery | 30min | Active volcanic eruptions worldwide |
| NOAA Hurricanes | NOAA NHC | 30min | Atlantic/Pacific tropical cyclone tracking |
| Tsunami Warnings | PTWC/NTWC | 2min | Tsunami alerts and watches |

### Aviation (4 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| OpenSky Aircraft | OpenSky Network | 60s | Global ADS-B aircraft positions |
| Emergency Squawks | OpenSky (filtered) | 60s | 7500 (hijack), 7600 (comms), 7700 (emergency) |
| FAA NOTAMs | FAA API | 30min | Airspace notices and TFRs |
| adsb.lol | adsb.lol | 30s | Open ADS-B feed (including military) |

### Maritime (5 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| AISHub Vessels | AISHub | 10min | Global ship AIS positions |
| USCG Maritime | USCG Homeport | 1hr | Maritime incidents and rescues |
| Naval Vessels | AISHub (MMSI filter) | 30min | Tracked known warships by MMSI |
| IMB Piracy | ICC IMB | 6hr | Maritime piracy incident reports |
| Baker Hughes Rigs | Baker Hughes | Weekly | North American oil/gas rig counts |

### Cyber & Infrastructure (8 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| CISA KEV | CISA Catalog | 2hr | Known exploited vulnerabilities |
| NVD CVEs | NIST NVD | 2hr | HIGH/CRITICAL CVEs (3-day window) |
| Cloudflare Radar | Cloudflare API | 5min | Internet outages and latency anomalies |
| MalwareBazaar | abuse.ch | 1hr | Recent malware samples |
| OONI Censorship | OONI API | Daily | Internet censorship by country |
| RIPE BGP | RIPE NCC RIS | 5min | BGP routing anomalies |
| IODA Outages | Oracle IODA | 5min | Internet connectivity signal drops |
| CISA Advisories | CISA ICS-CERT | 30min | Industrial control system advisories |

### Finance (7 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| Alpha Vantage | Alpha Vantage | 5min | SPY, QQQ, GLD, USO, EUR/USD, BTC quotes |
| CoinGecko | CoinGecko | 60s | Top 10 cryptocurrencies + 24h changes |
| FRED Economics | St. Louis Fed | Daily | Fed Funds rate, unemployment, CPI, GDP |
| Finnhub Markets | Finnhub | 5min | Major indices + market news |
| Baker Hughes | Baker Hughes | Weekly | Oil/gas rig counts |
| Baltic Dry Index | TradingEconomics | Daily | Global shipping cost index |
| EIA Grid | EIA API | 1hr | US electric grid generation data |

### Geopolitical (6 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| ACLED Conflicts | ACLED API | 1hr | Battles, protests, violence events |
| GDELT Events | GDELT v2 | 15min | Global event extracts with Goldstein scoring |
| RSS News | Reuters, AP, BBC, Al Jazeera, DW | 5min | Multi-source wire service aggregation |
| OpenSanctions | OpenSanctions | Daily | OFAC, UN, EU sanctions listings |
| US Travel Advisory | State Department | 6hr | Country travel warning levels (1–4) |
| Telegram OSINT | Telegram Bot API | 15min | OSINT channels (@IntelSlava, @GeoConfirmed, etc.) |

### Humanitarian (10 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| FEMA Disasters | FEMA OpenFEMA | Daily | US disaster declarations (90-day window) |
| ReliefWeb | UN OCHA | 15min | Global disaster reports |
| WHO Outbreaks | WHO RSS | 30min | Disease outbreak alerts |
| ProMED Disease | ProMED RSS | 30min | ISID disease outbreak reports |
| ACAPS Crises | ACAPS API | 6hr | INFORM Severity Index ratings |
| FEWS NET Famine | FEWS NET | Daily | Food security crisis alerts |
| UNHCR Displacement | UNHCR API | Daily | Refugee displacement statistics |
| FEMA IPAWS | FEMA ATOM/CAP | 2min | Integrated public alert system |
| FEMA Shelters | FEMA API | 1hr | Active shelter counts |
| GTD Terrorism | GTD API | 24hr | Terrorism incidents database |

### Nuclear & CBRN (5 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| IAEA News | IAEA RSS | 1hr | Nuclear safeguards and reactor news |
| IAEA PRIS | IAEA PRIS DB | Daily | 50+ major nuclear reactor site statuses |
| NRC Events | NRC RSS | 1hr | US Nuclear Regulatory Commission alerts |
| Safecast Radiation | Safecast API | 1hr | Citizen science radiation measurements |
| EURDEP Radiation | European Commission | 1hr | EU radiation monitoring network |

### Space & Aerospace (6 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| NASA ISS | NASA Open Notify | 5s | ISS real-time position + crew count |
| NASA NEO | NASA CNEOS | Daily | Near-Earth object close approaches |
| NOAA Space Weather | NOAA SPC | 30min | Solar flares, geomagnetic storms |
| Space Launches | Space Devs LL2 | 1hr | Upcoming rocket launches |
| SpaceTrack Satellites | Space-Track.org | 12hr | Active satellites and orbital debris |
| CelesTrak TLE | CelesTrak | 12hr | ISS, Tiangong, weather satellite TLEs |

### Military (6 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| adsb.lol Military | adsb.lol | 30s | Military ADS-B aircraft tracking |
| Airstrikes (ACLED) | ACLED filtered | 1hr | Explosions and remote violence events |
| Naval MMSI | AISHub filtered | 30min | Known warship positions |
| VIP Aircraft | OpenSky filtered | 5min | Air Force One, Doomsday plane, govt jets |
| Bomber & ISR | OpenSky filtered | 5min | B-52, RC-135, AWACS, surveillance aircraft |
| GTD Terrorism | GTD API | 24hr | Terrorism incidents and militant groups |

### Social & OSINT (2 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| Reddit OSINT | Reddit API | 10min | r/worldnews, r/OSINT hot posts (≥1000 score) |
| OSINT RSS | Bellingcat, War Zone, RUSI, etc. | 10min | Open-source intelligence aggregation |

### Energy (2 workers)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| EIA Grid | EIA API | 1hr | US electric grid and RTO generation |
| ENTSO-E | ENTSO-E API | 1hr | EU electricity generation and cross-border flows |

### Weather Overlay (1 worker)

| Feed | Source | Refresh | Description |
|------|--------|---------|-------------|
| RainViewer Radar | RainViewer | 5min | Global weather radar tile overlay |

---

## 7. AI Intelligence Suite

Meridian integrates AI capabilities powered by LLM (default: GPT-4o-mini via LiteLLM).

### AI Analyst Chat

An interactive intelligence chat interface available as a dashboard panel and at the `/ai/chat` endpoint.

**Features:**
- **Streaming responses** via Server-Sent Events
- **Function calling** — the AI can query live event data, nearby events, feed health, and category counts
- **Coordinate detection** — auto-detects lat/lng in responses with "Show on map" buttons
- **12 example queries** including "Military aircraft near Kaliningrad," "Cyber threats to energy grid," "Conflict escalation in Sub-Saharan Africa"

### Daily Intelligence Brief

Automatically generated at **06:00 UTC** every day.

**Structure:**
- **Executive Summary** — 3-paragraph senior analyst perspective with 5 key watchpoints
- **Category Summaries** — 2-3 sentence summaries for: geopolitical, military, environment, cyber, humanitarian, aviation, maritime
- **Event Counts** — per-category event tallies

**Personalized Brief:**
- Select your **top categories** (up to 10)
- Choose a **region focus** (Global, Middle East, Eastern Europe, East Asia, etc.)
- Get a tailored 3-5 bullet point intelligence summary

### Anomaly Detection Engine

Runs every **30 minutes** and detects 6 types of anomalies:

| Type | Description | Severity |
|------|-------------|----------|
| **Volume Spike** | Z-score analysis vs. 30-day baseline per category | High/Critical |
| **Vessel Clustering** | 8+ vessels in a 1° grid cell | Medium/High |
| **Earthquake Near Nuclear** | M4.5+ quake within 250km of nuclear facility | Critical |
| **OSINT Post Cluster** | 3+ sources in same region within 30 minutes | Medium |
| **Commodity-Conflict Correlation** | Market events concurrent with 3+ conflict events | High |
| **BGP Hijack + Advisory** | BGP anomalies concurrent with CISA advisories | High |

Anomalies appear as **AI Insight cards** (purple accent) in the Notification Center.

### Geopolitical Risk Scoring

Updated every **6 hours**, scores the top 50 countries on a 0–100 scale.

**Scoring method:**
- Weighted by severity (critical: 10, high: 5, medium: 2, low: 0.5)
- Weighted by category (military: 3.0, geopolitical: 2.5, humanitarian: 2.0, cyber: 1.8)
- Normalized to 0–100 and assigned tier: Critical (80+), High (60–79), Medium (40–59), Low (20–39), Minimal (0–19)

### Escalation Prediction

Given a country and category, the AI produces a structured assessment:
1. Escalation Risk Level
2. Key indicators
3. Most likely scenario
4. Recommended monitoring actions

### Translation

Multilingual OSINT support — auto-detect source language and translate to English (or any target language).

---

## 8. Alert System

### Alert Rule Creation (6-Step Wizard)

Navigate to `/alerts` to create custom alert rules through a guided wizard:

**Step 1 — Name:** Set a rule name and optional description.

**Step 2 — Condition Type:** Choose from 6 condition types:

| Type | Icon | Description |
|------|------|-------------|
| **Severity Level** | ⚠ | Alert when events exceed a severity threshold |
| **Event Category** | ◈ | Alert on specific categories (military, cyber, etc.) |
| **Keyword Match** | 🔍 | Match keywords in event title/body |
| **Data Source** | ◉ | Alert on events from specific feeds |
| **Geographic Region** | ⬡ | Bounding box — draw on a mini-map with Shift+drag |
| **Composite Rule** | ⊕ | Combine conditions with AND/OR logic |

**Step 3 — Parameters:** Configure the condition specifics (severity level, category selection, keywords, region coordinates, etc.)

**Step 4 — Delivery:** Select notification channels:
- **In-App** (⚑) — Appears in the Notification Center
- **Email** (✉) — Sent via SendGrid
- **Webhook** (⟐) — POST JSON to any external URL (3-retry with exponential backoff)

**Step 5 — Configure:** Enter email address or webhook URL.

**Step 6 — Frequency:**
- **Real-time** (⚡) — Notification per event
- **Hourly Digest** (⏱) — Summary every hour
- **Daily Digest** (📅) — Summary at 06:00 UTC

**Step 7 — Review:** Summary of the rule before creation.

### Alert Rule Management

- **Toggle** rules on/off with one click
- View **trigger count** and **last triggered** timestamp
- **Delete** rules with confirmation

### Notification Center

Accessible via the bell icon in the top nav bar:
- **Alert Notifications** — rule-triggered alerts with severity color, rule name, event details
- **AI Anomaly Insights** — purple-accented cards from the anomaly detection engine
- **Mark all read** button
- **Unread count** badge on the bell icon
- Auto-refreshes AI anomalies every 60 seconds

### Alert Engine (Backend)

The alert engine subscribes to the Redis event stream and evaluates every incoming event against all active rules in real time. Matched events trigger notifications through the configured delivery channels.

---

## 9. Plan Mode — Collaborative Analysis

Plan Mode (`/plan`) is Meridian's real-time collaborative intelligence workspace. Multiple analysts can work together simultaneously with shared annotations, tasks, timelines, and map views.

### Plan Rooms

A **Plan Room** is a collaborative workspace. Each room has:
- **Name and description**
- **Area of Interest (AOI)** — bounding box and/or country list
- **Members** with roles (Owner, Briefer, Analyst)

### Collaboration Features

#### Real-Time Cursors
When connected to a Plan Room, you see other users' cursors on the map as colored, named indicators. This is powered by the Collab Server (Yjs + WebSocket).

#### Focus Following
Click a remote user's name in the online bar to **follow their viewport**. Your map will mirror their pan/zoom in real-time. A "Following [Name]" banner appears. Click again to detach.

#### Layer Sync Modes
- **Independent** — Each user controls their own layer visibility
- **Presenter Sync** — One user broadcasts their layer state; all followers' layers update automatically

#### Briefing Mode
A full-screen presentation overlay for briefing team members:
- Briefer/Audience role toggle
- Annotation spotlight (highlight and present individual annotations)
- Pointer broadcast (attention pulse visible to all participants)
- ESC to exit

### Tabs

#### Tasks (Kanban Board)
5-column kanban: **To Monitor → Assigned → Active Watch → Escalated → Completed**
- Create tasks with title and notes
- Change status via buttons
- **AI Suggestions** — pulls anomalies from the AI engine and suggests tasks to create

#### Timeline
Chronological event log for the room:
- Add manual entries
- **AI Summary** — streams an AI-generated summary of the timeline
- **Auto-populate AOI** — automatically ingests recent events within the room's area of interest
- **Export** timeline as JSON

#### Annotations (7 drawing tools)
Draw on the map and collaborate visually:

| Tool | Icon | Description |
|------|------|-------------|
| **POI** | 📍 | Point of Interest marker |
| **Region** | ⬡ | Area polygon |
| **Route** | ↗ | Path/trajectory line |
| **Range Circle** | ◎ | Radius-based area |
| **Arrow** | ➤ | Directional indicator |
| **Text Label** | T | Positioned text |
| **Freehand** | ✏ | Hand-drawn path |

Each annotation has:
- Custom **label** and **notes**
- **Color** selection (7 presets)
- **Lock/unlock** protection
- **Comment thread** for discussion

#### Intel Board
Classified intelligence notes with security markings:
- **UNCLASSIFIED** (gray)
- **CONFIDENTIAL** (blue)
- **SECRET** (orange)
- **TOP SECRET** (red)

Notes can be pinned to the top of the board.

#### Members
- Invite users by user ID
- Assign roles: **Owner**, **Briefer**, **Analyst**
- View member list with join timestamps

### Exports

| Format | Description |
|--------|-------------|
| **JSON** | Full data pack (annotations, timeline, tasks, watch list, intel notes) |
| **GeoJSON** | Annotations as GeoJSON FeatureCollection |
| **KML** | Google Earth compatible format |
| **PDF** | Printable text-based report |

### Shareable Links

Create **read-only shareable links** with configurable expiry (default: 7 days). Anyone with the link can view the room's data pack without authentication.

---

## 10. Watch List & Entity Tracking

### Watch List Page (`/watch`)

Monitor specific entities across the platform. Add entities with:

| Entity Type | Icon | Example |
|-------------|------|---------|
| **Vessel** | ⚓ | Track a ship by MMSI |
| **Aircraft** | ✈ | Track a plane by ICAO24 or callsign |
| **Location** | ◎ | Monitor a geographic point with radius |
| **Country** | ⊕ | Track all events in a country |
| **Keyword** | ◈ | Monitor for keyword mentions |
| **Cyber Asset** | ⚡ | Track a specific IP/domain |
| **Weather System** | ☁ | Monitor a named storm |
| **Satellite** | ★ | Track a satellite by NORAD ID |

### Tracked Entities (Plan Mode)

Pin live entities (aircraft, vessels, ISS) to a Plan Room for persistent tracking:
- **LIVE badge** for real-time feeds (ISS, OpenSky, AISHub)
- Coordinates with 4 decimal places
- Secondary info: altitude, velocity, speed, destination
- Source and room association
- Pinned timestamp

Tracked entities persist across sessions via localStorage.

---

## 11. Situation Reports

### Sitrep Builder (`/sitrep`)

Generate AI-powered situation reports on any topic:

1. Enter a **topic** (e.g., "active armed conflicts in Sub-Saharan Africa")
2. Optionally specify a **region**
3. Click **Generate Sitrep** or use quick templates:
   - Conflict Overview
   - Humanitarian Crisis
   - Cyber Threat Landscape
   - Natural Disasters
   - Maritime Security
   - Energy Security

**Report structure (5 sections):**
1. Executive Summary (2–3 sentences)
2. Situation Overview (current status, actors, timeline)
3. Threat Assessment (severity, trajectory, risk factors)
4. Indicators to Watch (3–5 items)
5. Recommended Actions

Reports stream in real-time with a 4-phase progress indicator:
Scanning → Drilling → Assembling → Complete

---

## 12. Authentication & Security

### Registration & Login

| Method | Description |
|--------|-------------|
| **Email/Password** | Standard registration with minimum 8-character password |
| **Google OAuth** | One-click Google sign-in (auto-creates account) |

### Two-Factor Authentication (2FA)

TOTP-based 2FA (RFC 6238):
1. Go to Settings → Enable 2FA
2. Scan QR code with an authenticator app (Google Authenticator, Authy, etc.)
3. Enter the 6-digit code to verify
4. Future logins require email + password + TOTP code

### Token Management

| Token Type | Expiry | Purpose |
|------------|--------|---------|
| Access Token | 60 minutes | API authentication (JWT HS256) |
| Refresh Token | 30 days | Renew access tokens |
| Password Reset | 1 hour | One-time password reset |
| Email Verification | 24 hours | Verify email address |

### API Tokens

Create API tokens for programmatic access:
- **Format:** `mid_<base64>` prefix
- **Scopes:** `read` (GET only) or `write` (all methods)
- **Optional expiry**
- Tokens are hashed (SHA256) — the raw token is shown only once at creation

### Password Reset

1. Request reset via email (always returns success to prevent enumeration)
2. Receive a 1-hour reset token
3. Set new password

### Email Verification

Verification emails are sent on registration. Verify within 24 hours.

### Rate Limiting

Redis-based per-minute rate limits by user tier:

| Tier | Limit |
|------|-------|
| Free | 60 requests/min |
| Pro | 300 requests/min |
| Team | 600 requests/min |
| Enterprise | 1000 requests/min |

Rate limit headers (`X-RateLimit-*`) are included in all responses.

### Audit Logging

All mutating API actions (POST, PUT, PATCH, DELETE) are automatically logged to the `audit_logs` table with:
- User ID, IP address
- Action type (create/update/delete)
- Resource type and ID
- Request details (JSONB)

---

## 13. Settings & Configuration

### Data Sources Tab

Browse and configure all 69+ data sources:
- **Category filter** — Aviation, Maritime, Security, Environment, etc.
- **FREE badge** — sources that need no API key
- **Status indicator** — green (active) / gray (unconfigured)
- **Expandable details:**
  - Full description
  - Available data fields
  - Refresh rate
  - API credential inputs (masked for sensitive keys)
  - "Save Credentials" button
  - "Get API Key" and "Docs" links

Credentials are stored securely in the database via the credential store (never exposed in responses).

### API Tokens Tab

Create, view, and revoke API tokens for programmatic access.

### Billing Tab

Three paid tiers with Stripe integration:

| Feature | Analyst ($9/mo) | Team Starter ($29/mo) | Team Pro ($79/mo) |
|---------|-----------------|----------------------|-------------------|
| All panels | ✓ | ✓ | ✓ |
| AI Analyst | ✓ | ✓ | ✓ |
| Email alerts | ✓ | ✓ | ✓ |
| API access | ✓ | ✓ | ✓ |
| Plan Rooms | — | 5 | Unlimited |
| Team members | — | 10 | 25 |
| Exports | — | ✓ | ✓ |
| Priority support | — | — | ✓ |

- **Upgrade** via Stripe checkout
- **Manage subscriptions/invoices** via Stripe customer portal

### Organization Tab

Create organizations with a name and slug. Manage members and team access.

---

## 14. Feed Health Monitoring

### Feed Health Page (`/feeds`)

Real-time dashboard showing the operational status of all 69+ feed workers:

**Summary Cards:**
- **Healthy** — feeds operating normally (green)
- **Degraded** — feeds with recent errors (orange)
- **Error** — feeds failing consistently (red)
- **Total** — total registered feeds

**Health Table Columns:**

| Column | Description |
|--------|-------------|
| Feed | Human-readable name + source ID |
| Status | Colored dot (green/orange/red/gray) |
| Last Success | Time since last successful fetch |
| Fetches | Total fetch count |
| Errors | Error count + error percentage |
| Avg Latency | Average fetch latency in milliseconds |

- Auto-refreshes every **30 seconds**
- Manual refresh button available

### Top Nav Health Indicator

A compact feed health indicator in the top navigation bar shows:
- Green dot + "X/Y feeds" when ≥70% are healthy
- Orange when degraded
- Red when critical

---

## 15. Organizations & Billing

### Organizations

- **Create** organizations with a unique name and slug
- **Invite members** by user ID
- **Roles:** Owner, Admin, Member
- Owner/Admin can invite and remove members

### Stripe Billing

- Checkout sessions for tier upgrades
- Customer portal for subscription management
- Webhook handler for subscription lifecycle events (created, updated, cancelled)

### Usage Metering

Per-user monthly limits enforced by tier:

| Resource | Free | Pro | Team | Enterprise |
|----------|------|-----|------|-----------|
| Alert Rules | 5 | 50 | 200 | Unlimited |
| AI Messages | 50 | 500 | 2,000 | Unlimited |
| Sitreps | 3 | 30 | 100 | Unlimited |

---

## 16. REST API Reference

The full REST API is available at `http://localhost:8000/api/v1/`.

### Authentication (`/auth`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Create account |
| `/auth/login` | POST | Login (email/password + optional TOTP) |
| `/auth/refresh` | POST | Refresh access token |
| `/auth/me` | GET | Current user profile |
| `/auth/google` | POST | Google OAuth exchange |
| `/auth/2fa/setup` | POST | Generate TOTP secret |
| `/auth/2fa/verify` | POST | Enable 2FA |
| `/auth/2fa/disable` | POST | Disable 2FA |
| `/auth/forgot-password` | POST | Request password reset |
| `/auth/reset-password` | POST | Reset password with token |
| `/auth/send-verification` | POST | Send email verification |
| `/auth/verify-email` | POST | Verify email |

### Events (`/events`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events/` | GET | List events (filterable by category, severity, source, time, bbox) |
| `/events/near` | GET | Events within radius (PostGIS) |
| `/events/replay` | GET | Historical event replay (180-day window) |
| `/events/csv` | GET | CSV export |

### Feeds (`/feeds`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/feeds/status` | GET | All feed worker statuses |
| `/feeds/health` | GET | Health metrics (fetch/error counts, latency) |

### Alerts (`/alerts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/alerts/rules` | GET/POST | List/create alert rules |
| `/alerts/rules/{id}/toggle` | PATCH | Enable/disable rule |
| `/alerts/rules/{id}` | DELETE | Delete rule |
| `/alerts/notifications` | GET | List notifications |
| `/alerts/notifications/unread-count` | GET | Unread count |
| `/alerts/notifications/{id}/read` | POST | Mark as read |
| `/alerts/notifications/read-all` | POST | Mark all as read |

### Plan Rooms (`/plan-rooms`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/plan-rooms` | GET/POST | List/create rooms |
| `/plan-rooms/{id}` | GET/DELETE | Get/delete room |
| `/plan-rooms/{id}/annotations` | GET/POST | Annotations CRUD |
| `/plan-rooms/{id}/annotations/{aid}/comments` | GET/POST/DELETE | Comment threads |
| `/plan-rooms/{id}/annotations/{aid}/lock` | POST | Lock annotation |
| `/plan-rooms/{id}/annotations/{aid}/unlock` | POST | Unlock annotation |
| `/plan-rooms/{id}/timeline` | GET/POST | Timeline entries |
| `/plan-rooms/{id}/timeline/auto-populate` | POST | Auto-populate from AOI |
| `/plan-rooms/{id}/timeline/summary` | GET | AI timeline summary (SSE) |
| `/plan-rooms/{id}/tasks` | GET/POST | Tasks CRUD |
| `/plan-rooms/{id}/tasks/{tid}` | PATCH/DELETE | Update/delete task |
| `/plan-rooms/{id}/watch-list` | GET/POST | Watch list entities |
| `/plan-rooms/{id}/watch-list/{eid}` | DELETE | Remove from watch list |
| `/plan-rooms/{id}/intel` | GET/POST | Intel notes |
| `/plan-rooms/{id}/intel/{nid}` | PATCH/DELETE | Update/delete note |
| `/plan-rooms/{id}/members` | GET | List members |
| `/plan-rooms/{id}/members/{uid}` | POST | Add member |
| `/plan-rooms/{id}/export/json` | GET | Export as JSON |
| `/plan-rooms/{id}/export/geojson` | GET | Export as GeoJSON |
| `/plan-rooms/{id}/export/kml` | GET | Export as KML |
| `/plan-rooms/{id}/export/pdf` | GET | Export as PDF |
| `/plan-rooms/{id}/share` | GET/POST | Shareable links |
| `/plan-rooms/{id}/share/{lid}` | DELETE | Revoke share link |
| `/plan-rooms/view/{token}` | GET | Public read-only view |

### AI Service (`/ai`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ai/chat` | POST | Streaming AI chat with function calling |
| `/ai/examples` | GET | 10 pre-defined intelligence queries |
| `/ai/brief/daily` | GET | Daily intelligence brief |
| `/ai/brief/daily/refresh` | POST | Regenerate daily brief |
| `/ai/brief/personalized` | POST | Category/region-filtered brief |
| `/ai/report` | POST | Situation report generation |
| `/ai/anomalies` | GET | Anomaly detection results |
| `/ai/risk-scores` | GET | Country risk scores (top 50) |
| `/ai/translate` | POST | Multilingual translation |
| `/ai/escalation` | POST | Conflict escalation prediction |
| `/ai/planroom/brief` | POST | Plan Room context brief (SSE) |

### Other Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/orgs` | GET/POST | Organizations |
| `/orgs/{id}/members` | GET/POST/DELETE | Org members |
| `/tokens` | GET/POST | API tokens |
| `/tokens/{id}` | DELETE | Revoke token |
| `/credentials` | GET/PUT | Feed credential management |
| `/chat/sessions` | GET/POST/DELETE | AI chat sessions |
| `/chat/sessions/{id}/messages` | GET/POST | Chat messages |
| `/chat/reading-history` | POST/GET | Reading history tracking |
| `/billing/checkout` | POST | Stripe checkout |
| `/billing/portal` | POST | Stripe customer portal |
| `/billing/webhook` | POST | Stripe webhook handler |
| `/ws/events` | WebSocket | Real-time event stream |
| `/health` | GET | Health check |

---

## 17. Keyboard Shortcuts

Global keyboard shortcuts available from any page (except when typing in an input field):

| Key | Action |
|-----|--------|
| `M` | Go to Dashboard |
| `P` | Go to Plan Mode |
| `A` | Go to Alert Rules |
| `N` | Toggle Notification Center |
| `L` | Toggle Layer Panel |
| `W` | Go to Watch List |
| `F` | Go to Feed Health |
| `/` | Focus map search input |
| `Esc` | Close drawer / exit maximize / cancel drawing (priority order) |

---

## 18. Architecture Overview

### Services

| Service | Stack | Port | Purpose |
|---------|-------|------|---------|
| **API** | FastAPI + SQLAlchemy (async) + APScheduler | 8000 | REST API, WebSocket, feed workers, alert engine |
| **Web** | React 18 + TypeScript + Vite + MapLibre GL | 5173 | SPA frontend |
| **AI** | FastAPI + LiteLLM | 8001 | AI chat, briefs, anomalies, risk scoring |
| **Collab** | Node.js + Yjs + WebSocket | 1234 | CRDT-based real-time collaboration |

### Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Database** | PostgreSQL 16 + PostGIS + TimescaleDB | Geospatial events, user data, plan rooms |
| **Cache/Pubsub** | Redis 7 | Event broadcasting, rate limiting, usage metering |
| **Container** | Docker Compose | Orchestration of all 6 services |

### Data Flow

```
Feed Workers (69+ sources)
    → fetch() every N seconds
    → GeoEvent list
    → INSERT into geo_events (TimescaleDB hypertable)
    → Publish to Redis (meridian:events channel)
    → ConnectionManager broadcasts to WebSocket clients
    → Frontend useSocket hook receives events
    → useEventStore (Zustand, 5000 event cap)
    → Map markers + Panel aggregations
```

### Frontend State Management

7 Zustand stores manage all application state:

| Store | Purpose |
|-------|---------|
| `useEventStore` | Real-time events, filters, selected event |
| `useLayoutStore` | Deck, grid layout, layers, panel states (persisted) |
| `useReplayStore` | Historical event replay |
| `useAlertStore` | Alert rules and notifications |
| `usePlanStore` | Plan rooms, annotations, timeline, tasks |
| `usePlanTrackingStore` | Persistent entity tracking (persisted) |
| `useCollabStore` | Real-time collaboration state (cursors, viewports) |

---

*This document covers the complete feature set of the Meridian platform as of March 2026. For developer documentation, see `CLAUDE.md`. For the platform design outline, see `MERIDIAN_PLATFORM_OUTLINE.md`.*
