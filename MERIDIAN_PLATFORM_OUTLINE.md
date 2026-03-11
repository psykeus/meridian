# MERIDIAN — Global Situational Awareness & Collaborative Intelligence Platform
### Product Outline · Working Title · v1.0

> *"See everything. Plan together. Act decisively."*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Vision & Goals](#2-platform-vision--goals)
3. [Design Philosophy](#3-design-philosophy)
4. [Architecture Overview](#4-architecture-overview)
5. [Complete Data Source Catalog](#5-complete-data-source-catalog)
6. [Interactive Map System](#6-interactive-map-system)
7. [Widget & Panel System](#7-widget--panel-system)
8. [AI Intelligence Layer](#8-ai-intelligence-layer)
9. [Alert & Notification System](#9-alert--notification-system)
10. [Plan Mode — Collaborative Intelligence](#10-plan-mode--collaborative-intelligence)
11. [Multi-User Platform Architecture](#11-multi-user-platform-architecture)
12. [UI/UX Design System](#12-uiux-design-system)
13. [Pre-Built Intelligence Decks](#13-pre-built-intelligence-decks)
14. [Technology Stack](#14-technology-stack)
15. [Derived & Computed Data Points](#15-derived--computed-data-points)
16. [Development Phases & Roadmap](#16-development-phases--roadmap)

---

## 1. Executive Summary

**Meridian** is a real-time, multi-user global situational awareness platform built entirely on publicly available and open-source intelligence (OSINT) data. It aggregates, normalizes, and visualizes live data across environmental threats, military and conflict monitoring, aviation, maritime, cyber infrastructure, financial markets, humanitarian crises, space, and geopolitical intelligence — all in a single unified interface.

Unlike existing tools (including SitDeck, which confirmed 184 data providers and 76 map layers across 26 categories), Meridian is purpose-built for **teams**. The core differentiator is **Plan Mode** — a collaborative workspace where multiple users simultaneously view the same live data, annotate the map, build shared timelines, coordinate monitoring tasks, and produce collaborative intelligence reports in real time.

**Meridian diverges from SitDeck in three critical ways:**

1. **Cleaner, breathable interface** — Panels are larger, less dense, organized by cognitive workflow rather than raw data quantity. SitDeck's primary weakness is overwhelming density; Meridian solves this with progressive disclosure and a context-drawer paradigm.
2. **Native team collaboration** — Every feature treats multi-user interaction as first-class, not an afterthought.
3. **Plan Mode** — A purpose-built collaborative operations layer that converts passive monitoring into active team coordination. No equivalent exists in any free OSINT platform today.

All 150+ data sources are free, open, and publicly accessible. No private data contracts are required. SitDeck's confirmed open sources (USGS, NOAA, NASA FIRMS, ACLED, CISA, RIPE BGP, OpenSky, GDACS, GDELT, and more) are all replicated or improved upon in Meridian's catalog.

---

## 2. Platform Vision & Goals

### 2.1 Primary Use Cases

| Audience | Primary Use |
|---|---|
| Security Analysts | Conflict monitoring, threat assessment, cyber intelligence |
| Journalists & Media | Breaking event tracking, conflict mapping, ground truth verification |
| NGOs & Humanitarian Orgs | Disaster response, refugee tracking, crisis coordination |
| Emergency Management | Natural disaster tracking, resource planning, FEMA coordination |
| Business Intelligence Teams | Supply chain risk, financial monitoring, geopolitical risk scoring |
| Academic Researchers | OSINT data collection, conflict study, environmental research |
| Private Security / Risk | Client briefings, threat reporting, situation reports |

### 2.2 Key Platform Goals

- Aggregate **150+ live data feeds** from verified free and open sources
- Deliver **sub-60 second refresh** on critical feeds (earthquakes, conflicts, flights, markets)
- Enable **collaborative planning sessions** for 2–50 simultaneous users with Plan Mode
- Offer a UI that is **less visually dense** than SitDeck while **equally functional**
- Ship a **fully functional free tier**; monetize on team and professional tiers
- Build every feature to **scale for teams**, not just individual analysts

---

## 3. Design Philosophy

### 3.1 Core Principle: Signal Over Noise

SitDeck surfaces everything at once — every panel competes for attention simultaneously. Meridian inverts this: **present less, reveal more on demand.**

- **Default views are clean**: Panels show only critical KPIs by default; full data is one click away
- **Context Drawer paradigm**: Clicking any event opens a right-side drawer — the map *shifts left*, never gets covered by a modal
- **Breathing room**: 16px minimum gutter between panels; generous internal padding throughout
- **One dominant focal point**: Map occupies 60–70% of screen; panels are user-chosen secondaries
- **Severity drives visual weight**: Critical events are larger, more saturated, and animated; background data is muted

### 3.2 Cognitive Workflow Zones

Panels are grouped into logical zones reflecting how analysts actually think:

| Zone | Content |
|---|---|
| **Monitor** | Live feeds, alerts, news headlines, social signals |
| **Analyze** | AI analyst, situation reports, correlation engine |
| **Track** | Military, aviation, maritime, space tracking panels |
| **Assess** | Financial markets, supply chains, risk indicators |
| **Plan** | Plan Mode collaborative workspace (team tier) |

### 3.3 Visual Severity Palette

| Color | Meaning |
|---|---|
| Red / Orange | Active threat, critical event |
| Yellow / Amber | Watch status, elevated concern |
| Green | Nominal, operational, live |
| Blue | Informational, tracking, neutral |
| Purple | AI-generated insight or prediction |
| Gray / White | Historical or inactive data |

### 3.4 Key UX Improvements Over SitDeck

| SitDeck Pain Point | Meridian Solution |
|---|---|
| Too many panels cramped simultaneously | Optional panels, 16px+ gutters, default shows only 4–6 |
| Clicking events covers the map with a modal | Context Drawer slides in right; map shifts, never obscured |
| No team or collaborative features | Plan Mode: full real-time collaboration suite |
| Limited layout flexibility | Fully flexible drag-resize grid; unlimited named presets |
| No collaborative annotation | Shared canvas with real-time annotations and version history |
| AI is an isolated chat panel | AI embedded in every panel (auto-summary cards, anomaly alerts, risk scores) |
| Desktop-only | Responsive design with mobile-optimized view |

---

## 4. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                       MERIDIAN PLATFORM                        │
├────────────────────────────────────────────────────────────────┤
│  FRONTEND  (React 18 + TypeScript + MapLibre GL JS)            │
│  ┌──────────────┐  ┌────────────┐  ┌───────────┐  ┌────────┐  │
│  │  Dashboard   │  │    Map     │  │   Plan    │  │   AI   │  │
│  │  Grid/Panels │  │   Canvas  │  │   Mode    │  │  Chat  │  │
│  └──────────────┘  └────────────┘  └───────────┘  └────────┘  │
├────────────────────────────────────────────────────────────────┤
│  REAL-TIME LAYER  (Socket.io + Server-Sent Events)             │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Feed Push     │  │  Collab Sync │  │  Alert Engine    │   │
│  │  (Redis→WS)    │  │  (Yjs OT)    │  │  (Rule Eval)     │   │
│  └────────────────┘  └──────────────┘  └──────────────────┘   │
├────────────────────────────────────────────────────────────────┤
│  BACKEND API  (Node.js / Python FastAPI)                       │
│  ┌───────────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐  │
│  │ Data Ingestion│  │ Auth &    │  │   AI     │  │  Org/  │  │
│  │ & Normalize   │  │ Users     │  │ Orchestr.│  │ Rooms  │  │
│  └───────────────┘  └───────────┘  └──────────┘  └────────┘  │
├────────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                    │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  150+ Open     │  │  PostgreSQL       │  │  Redis        │  │
│  │  Data Feeds    │  │  + PostGIS        │  │  Cache/PubSub │  │
│  │  (Workers)     │  │  + TimescaleDB   │  │               │  │
│  └────────────────┘  └──────────────────┘  └───────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 4.1 Data Flow

1. **Ingestion Workers** (BullMQ) poll or receive webhooks from all sources on defined intervals (10s–24h depending on source)
2. **Normalization Layer** converts all events into a unified `GeoEvent` schema: `{ id, category, subcategory, lat, lng, severity, timestamp, source, title, body, metadata, url }`
3. **PostGIS + TimescaleDB** stores geospatial time-series events with spatial indexing for fast proximity queries
4. **Redis Pub/Sub** broadcasts new events to all connected WebSocket clients in real time
5. **Plan Mode** uses a dedicated Yjs-based WebSocket channel with CRDT operational transformation to sync collaborative actions without conflicts

---

## 5. Complete Data Source Catalog

All sources below are **free, open, and publicly accessible**. API credentials are managed server-side — users need zero third-party accounts.

### 5.1 Environment & Natural Hazards

| Feed | Source | Endpoint / Method | Refresh |
|---|---|---|---|
| Earthquakes (global, M1.0+) | USGS Earthquake Catalog | `earthquake.usgs.gov/fdsnws/event/1/` GeoJSON | 30s |
| Earthquakes (significant M4.5+) | USGS FDSN | GeoJSON feed | 60s |
| Active Volcanoes | Smithsonian GVP + USGS | RSS + web | 15 min |
| Wildfires (satellite NRT) | NASA FIRMS (MODIS + VIIRS) | `firms.modaps.eosdis.nasa.gov/api/` | 3 hrs |
| Tsunami Warnings | PTWC / NTWC | IANA RSS + CAP alerts | Real-time |
| Hurricanes / Cyclones | NOAA NHC | GeoJSON + RSS | 30 min |
| Tornadoes / Severe Weather | NOAA NWS | `api.weather.gov/alerts` | 5 min |
| Global Weather Alerts | NOAA NWS CAP + GDACS | REST + RSS | 5 min |
| Weather Radar (global) | RainViewer | Free tile API | 10 min |
| Floods | GDACS + Dartmouth Flood Observatory | RSS + GeoJSON | 30 min |
| Landslides | NASA Global Landslide Database | GeoJSON | Daily |
| Dust Storms | NOAA + Copernicus satellite composites | Derived tiles | 6 hrs |
| Avalanche Advisories | USFS NRCS / EAWS (EU) | RSS + JSON | Daily |
| Global Disaster Composite | GDACS API | `gdacs.org/gdacsapi/` | 30 min |
| Atmospheric Methane | NOAA GML open datasets | Download | Daily |
| River Gauges / Water Alerts | USGS Water Services | REST API | 15 min |
| Coral Reef Bleaching | NOAA CoralWatch | Open API | Weekly |

### 5.2 Military & Defense (OSINT-Derived)

> All data is open-source: ADS-B squawks, AIS broadcasts, official DoD/NATO press releases, academic conflict databases, and verified OSINT communities. Zero classified sources.

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Conflict Events (global) | ACLED API | REST API | Daily |
| Airstrikes & Armed Events | ACLED + GDELT cross-reference | Derived/computed | Daily |
| Military Aircraft (ICAO hex) | OpenSky Network | REST API — hex range filter | 15s |
| Military Aircraft (MLAT) | ADSBexchange public feed | MLAT endpoint | 15s |
| Strategic Bomber / ISR Tracking | OpenSky + community callsign list | Callsign pattern match | 15s |
| Carrier Strike Groups | USNI News + OSINT aggregation | Curated + AIS verification | Daily |
| Naval Vessels (AIS) | AISHub (naval MMSI filter) | Free exchange API | 10 min |
| Military Exercises (announced) | NATO + DoD press | RSS feeds | Daily |
| Missile Tests | NTI + GDELT event correlation | Open reports + event matching | As reported |
| Military Bases (static) | OpenStreetMap military tag | Overpass API | Weekly |
| Active Sanctions | US Treasury OFAC + UN Security Council | Open JSON/XML downloads | Daily |
| Defense Procurement | SAM.gov (US) + NATO procurement | RSS | Daily |

### 5.3 Aviation & Airspace

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Live Flights (civil + some military) | OpenSky Network | REST API (free, rate-limited) | 15s |
| Live Flights (comprehensive) | adsb.lol | Open unfiltered JSON feed | 10s |
| Emergency Squawks (7700/7600/7500) | OpenSky filtered | State vector filter | Real-time |
| VIP / Executive Aircraft | ADSBexchange known callsign list | OSINT-maintained list | Real-time |
| US TFRs / NOTAMs | FAA NOTAM system | GeoJSON feed | 30 min |
| Aviation Weather (METAR) | NOAA Aviation Weather Center | `aviationweather.gov/api/` | 10 min |
| Global Airports (static) | OurAirports | Open CSV | Weekly |
| Piracy / ASAM Maritime Notices | IMO ASAM | Open downloads | Weekly |
| Flight Volume Anomalies | OpenSky baseline comparison | Derived — Z-score from rolling mean | Hourly |
| Helicopter Tracking | OpenSky aircraft category filter | Derived | Real-time |

### 5.4 Maritime & Trade

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Vessel Positions (global AIS) | AISHub free data exchange | `aishub.net/api` | 5–15 min |
| Vessel Positions (US coastal) | Marine Cadastre / USCG | `marinecadastre.gov/ais/` | Hourly |
| Naval Vessels | AISHub + public naval MMSI list | MMSI-filtered AIS | 15 min |
| Piracy Incidents | ICC IMB / UKMTO / IMO | Open reports + RSS | Daily |
| Submarine Cables (static) | TeleGeography free map | GeoJSON | Monthly |
| Major Chokepoints (static) | EIA + open GIS | GeoJSON static layer | Static |
| Global Ports | HDX / UN LOCODE | Open GeoJSON | Weekly |
| USCG Maritime Incidents | USCG Homeport | RSS | Daily |
| Container Ship Delays | Port authority feeds | Scrape + RSS | Daily |
| Oil Tanker Routing | AIS + route analysis | Derived | Daily |

### 5.5 Cyber & Infrastructure

| Feed | Source | Endpoint | Refresh |
|---|---|---|---|
| Known Exploited Vulnerabilities | CISA KEV Catalog | `cisa.gov/…/known_exploited_vulnerabilities.json` | Daily |
| CVE / NVD Database | NIST NVD | `services.nvd.nist.gov/rest/json/cves/2.0` | 2 hrs |
| CISA Advisories & Alerts | CISA | RSS feed | As published |
| BGP Routing Anomalies | RIPE NCC RIS | `stat.ripe.net/data/` | 15 min |
| Internet Outages | Cloudflare Radar | `api.cloudflare.com/…/radar/` | 5 min |
| Internet Outage Map | Oracle IODA (free API) | REST API | 15 min |
| ICS/SCADA Advisories | CISA ICS-CERT | RSS | As published |
| Malware / Threat Intel | MalwareBazaar (Abuse.ch) | Open API | Hourly |
| Internet Censorship Coverage | OONI Network | Open API | Daily |
| US Power Grid Status | EIA Grid Monitor | `eia.gov/opendata/` | Hourly |
| EU Energy Balance | ENTSO-E Transparency Platform | Free API (registration) | Hourly |
| Internet Exchange Health | PeeringDB | Open API | Daily |

### 5.6 Financial Markets & Economics

| Feed | Source | Endpoint | Refresh |
|---|---|---|---|
| Major Indices (S&P, FTSE, Nikkei, DAX) | Alpha Vantage (free tier) | REST API | 5 min (delayed) |
| Forex (major pairs: USD, EUR, GBP, JPY) | Alpha Vantage / Finnhub free | REST API | 5 min |
| Commodities (Oil, Gold, Gas, Wheat) | Alpha Vantage + EIA | REST APIs | 15 min |
| Cryptocurrencies (top 10) | CoinGecko free API | `api.coingecko.com/api/v3/` | 60s |
| US Federal Reserve Data | FRED (St. Louis Fed) | `fred.stlouisfed.org/docs/api/` | Daily/Weekly |
| US Treasury Yields | FRED + TreasuryDirect | Open API | Daily |
| WTI / Brent Crude | EIA + Alpha Vantage | REST APIs | 15 min |
| Baltic Dry Index (shipping cost proxy) | World Bank / Quandl open | Dataset | Daily |
| Active Sanctions (comprehensive) | OpenSanctions.org | `opensanctions.org/api/` | Daily |

### 5.7 Geopolitical & Security Intelligence

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Conflict + Protest Events | ACLED REST API | Authenticated REST | Daily |
| Global News Events (coded) | GDELT Project 2.0 | BigQuery / 15-min CSV | 15 min |
| Terrorism Incidents | GTD (Global Terrorism Database) | Open download | Daily |
| US Travel Advisories | US State Dept | JSON feed | As updated |
| UK Travel Advisories | UK FCDO | RSS + GeoJSON | As updated |
| Active Sanctions (all jurisdictions) | OpenSanctions.org | Open API | Daily |
| Press Freedom Index | RSF | Open dataset | Annual |
| Global Election Calendar | IDEA / structured open data | Dataset | Weekly |
| Arms Embargoes | SIPRI open datasets | Download | Monthly |

### 5.8 Humanitarian & Crisis

| Feed | Source | Endpoint | Refresh |
|---|---|---|---|
| Refugee & IDP Displacement | UNHCR Operational Data Portal | Open downloads | Weekly |
| Active Humanitarian Crises | UN OCHA ReliefWeb | `api.reliefweb.int/v1/` | Daily |
| Food Insecurity (IPC) | IPC / WFP GeoJSON | Open GeoJSON | Monthly |
| Disease Outbreaks | WHO Disease Outbreak News | RSS + open API | As published |
| Epidemic Intelligence | ProMED / ISID | RSS | As reported |
| Famine & Food Crisis Alerts | FEWS NET | Open data downloads | Weekly |
| US Disasters | FEMA OpenFEMA | `fema.gov/api/open/v2/` | Daily |
| US Active Shelters | FEMA OpenFEMA | REST API | Hourly |
| FEMA IPAWS Alerts | FEMA CAP feed | Real-time CAP | Real-time |

### 5.9 Nuclear, CBRN & WMD

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Nuclear Reactors (global, operational) | IAEA PRIS database | Open download | Monthly |
| US Nuclear Plant Events | NRC Event Notification | Daily report | Daily |
| Radiation Monitoring (Europe) | EURDEP | Open XML feed | Hourly |
| Radiation Monitoring (global crowd) | Safecast | Open API | Real-time |
| Nuclear Test History | CTBTO / NTI | Open datasets | Historical |
| Chemical / HAZMAT Incidents | NOAA CAMEO / EPA RMP | Open reports | As reported |

### 5.10 Space & Aerospace

| Feed | Source | Endpoint | Refresh |
|---|---|---|---|
| ISS Position (live) | NASA Open API | `api.nasa.gov/` | 5s |
| Satellite Catalog (active) | Space-Track.org (free registration) | REST API | Daily |
| Active Satellites + TLE Data | Celestrak | Free TLE files | Daily |
| Rocket Launches (global) | The Space Devs Launch Library 2 | `ll.thespacedevs.com/2.2.0/` | Real-time |
| Near-Earth Objects | NASA CNEOS | `cneos.jpl.nasa.gov/api/` | Daily |
| Space Weather / Solar Activity | NOAA SWPC | Open feeds | 15 min |

### 5.11 Social Media & OSINT Feeds

| Feed | Source | Method | Refresh |
|---|---|---|---|
| Curated OSINT Accounts (X/Twitter) | X API (official) — vetted account list | Official API only; no scraping | 15 min |
| Government & Military X Accounts | X API — verified government list | Official API | 15 min |
| Wire Services (Reuters, AP, AFP) | RSS feeds | RSS | 5 min |
| Global News (BBC, Al Jazeera, DW) | RSS feeds | RSS | 15 min |
| OSINT Community (Bellingcat, H I Sutton) | RSS + social | RSS | 30 min |
| Reddit OSINT (r/worldnews, r/geopolitics) | Reddit API (free) | REST API | 30 min |
| Select Public Telegram OSINT Channels | Telegram Bot API | Bot API | 15 min |

### 5.12 Energy & Infrastructure

| Feed | Source | Method | Refresh |
|---|---|---|---|
| US Electric Grid Status | EIA Grid Monitor | Open API | Hourly |
| EU Energy Balance | ENTSO-E Transparency Platform | Free API | Hourly |
| Oil Rig Count (North America) | Baker Hughes | Weekly public CSV | Weekly |
| LNG Terminal Status | GIE / GIIGNL | Open reports | Weekly |
| Electricity Spot Prices | EIA + ENTSO-E | Open APIs | Hourly |
| Solar & Wind Generation Share | EIA + ENTSO-E | Open APIs | Hourly |

---

## 6. Interactive Map System

The map is the **centerpiece** of Meridian — it occupies 60–70% of the screen at all times and is never dismissed. All panels are secondary elements that orbit it.

### 6.1 Map Engine

| Component | Technology | Notes |
|---|---|---|
| Primary library | **MapLibre GL JS** | Open-source, no Mapbox billing, full feature parity |
| 3D globe mode | **Globe.GL + Three.js** | WebGL-accelerated, night-Earth texture, atmosphere glow |
| Geospatial backend | **PostGIS** | Spatial indexing, proximity queries, clustering |
| Tile server (self-hosted) | **Martin** (Rust) | Serves vector tiles from PostGIS with zero cost |
| Base tiles (external free) | **OpenFreeMap / CARTO** | CDN-hosted free vector tiles |

### 6.2 Base Map Styles

| Style | Provider | Mode |
|---|---|---|
| Dark Matter (default) | CARTO | Dark vector — best for data overlays |
| Positron | CARTO | Light vector |
| Gray Canvas | Esri | Subtle muted dark |
| Satellite | Esri / Maxar | High-res imagery |
| Terrain | OpenTopoMap | Elevation contours |
| Liberty / Bright / Positron | OpenFreeMap | Free vector styles |
| Equal Earth | Natural Earth | Equal-area projection |
| Robinson | Natural Earth | Compromise projection |
| 3D Night Globe | Globe.GL + Three.js | Interactive 3D globe |

### 6.3 Map Layer Groups (64 Layers Total)

**Environment (14):**
Earthquakes (USGS, sized by magnitude) · Active Fires (NASA FIRMS VIIRS) · Volcanoes (GVP alert levels) · Hurricane / Cyclone Tracks (NHC cones) · Tornado / Storm Warnings (NWS) · Floods (GDACS + DFO) · Tsunami Warning Zones · Landslide Risk (NASA GLD) · Dust Storm Coverage · Weather Radar Overlay (RainViewer) · Heat Index Extremes · Wildfire Perimeters · Coral Reef Bleaching Status · Global Disaster Events (GDACS composite)

**Security & Geopolitical (10):**
Armed Conflicts (ACLED events — last 30/90/180 days) · Airstrikes & Kinetic Events · Active Protests & Civil Unrest · Terrorism Incidents (GTD) · Travel Advisory Heat Map (State Dept) · Internet Censorship (OONI) · Press Freedom Choropleth (RSF) · Active Sanctions (OpenSanctions country outlines) · UN Peace Operations (DPPA deployments) · Political Violence Index (AI-derived choropleth)

**Aviation & Airspace (12):**
Live Civil Flights · Military Aircraft (ICAO hex-filtered) · Emergency Squawks (7700/7600/7500 — animated red) · VIP / Executive Aircraft · Helicopters · TFRs / NOTAMs (FAA) · Global Airports · Flight Trails (15-min path history) · Flight Volume Density Heatmap · Flight Volume Anomaly Highlights · Bomber / ISR Aircraft (OSINT-filtered callsigns) · Active Space Launch Corridors

**Maritime & Trade (10):**
Live Vessel Positions (AISHub — all types) · Naval Vessels (MMSI-filtered) · Carrier Strike Groups (OSINT-verified positions) · Submarine Cable Routes (TeleGeography) · Global Shipping Chokepoints (Hormuz, Suez, Malacca, Bab-el-Mandeb, Panama — static) · Piracy / ASAM Incidents (IMO) · Global Port Locations (HDX) · USCG Maritime Incidents · Oil Tanker Routes (AIS-derived) · Container Ship Density Heatmap

**Military & Defense (8):**
Military Bases (OSM military tag + curated) · Naval Homeports (static curated) · Nuclear Weapons Sites (NTI open data) · Military HQ Locations · Active Military Exercises (announced) · Missile Test Zones (NTI) · Arms Embargo Countries (SIPRI) · Defense Procurement Activity Clusters (SAM.gov)

**Humanitarian & Crisis (10):**
Refugee & IDP Movements (UNHCR) · Active Humanitarian Operations (OCHA) · Food Insecurity Zones (IPC severity levels) · Active Disease Outbreaks (WHO) · FEMA Disaster Declarations (US) · FEMA Open Shelters · Nuclear Reactors (IAEA PRIS — operational) · Radiation Monitoring Points (EURDEP) · Famine Warning Areas (FEWS NET) · COVID-19 Legacy Tracker (OWID)

**Space & Cyber (5):**
ISS Current Position (live) · Active Satellite Positions (Celestrak TLE-derived) · SatNOGS Ground Station Network · Global Internet Outage Overlay (Cloudflare Radar heatmap) · Submarine Communications Cables

**Energy & Infrastructure (5):**
Nuclear Power Plants (IAEA PRIS) · Power Grid Infrastructure (EIA / static) · LNG Terminals (static curated) · Oil & Gas Infrastructure (EIA) · Internet Exchange Points (PeeringDB)

### 6.4 Map Interactions

- **Click any event** → Opens **Context Drawer** (right side, 420px — map shifts left, never covered)
- **Right-click any location** → Coordinates, nearest events, current weather, elevation, "Add to Plan"
- **Draw mode** (Plan Mode only) → Freehand annotations, shapes, markers
- **Region select** → Box or lasso to select multiple events for bulk analysis
- **Jump To** → Search field accepts city name, country, coordinates (decimal or DMS), or event ID
- **Time Scrubber** → Replay historical events for any layer up to 180 days back
- **Measure tool** → Click-to-click distance measurement in nm / km / mi
- **Layer opacity** → Per-layer transparency slider in the layers panel
- **Cluster toggle** → Switch any dense point layer between clustered and individual markers

---

## 7. Widget & Panel System

### 7.1 Panel Architecture

Panels use a **flexible responsive grid** (react-grid-layout) — not fixed quadrants. Users can:
- Add / remove panels from a searchable panel library
- Resize panels: compact / standard / large / full-width
- Minimize panels to a collapsible pill header
- Stack panels into tabbed groups (multiple panels in one grid slot)
- Pin any KPI value to a persistent top status bar
- Save unlimited named layout presets per user

### 7.2 Panel Header (Universal Design)

Every panel header contains:
- Icon + panel name (left)
- Source badge(s) — click to see source URL and last-updated timestamp (center)
- Live indicator dot: green (live) / amber (stale >5 min) / red (feed down) (right)
- Share button — copies a URL with current panel state and active filters
- Expand button — full-screen focus mode
- Pin button — pins the panel's headline KPI to the top status bar
- Close button

### 7.3 Context Drawer (Universal Event Detail)

Clicking any map event or panel row opens a **Context Drawer** sliding in from the right at 420px. The map shifts left to accommodate — it is never obscured.

Contents:
- Event header: title, timestamp, severity, coordinates, source badge with URL
- **AI summary**: "What's happening here?" — 2–3 sentence AI-generated context
- **Cross-referenced events**: nearby events in last 24h, same-actor events, related category events
- **Historical context**: prior events at this location (last 180 days) as a mini-timeline
- **Social context**: OSINT posts that mention this event (X, Reddit, wire services)
- **Plan Mode actions**: "Add to Watch List" / "Add to Timeline" / "Annotate on Map"
- **Map button**: center map on this event and auto-select relevant layers

### 7.4 Panel Library — Full Catalog

#### MONITOR PANELS

**Conflict Monitor** *(Source: ACLED + GDELT)*
Displays active strike events, conflict type classification, KPI badges (Strikes, Terror Events, Sieges, Embargo). Filterable by region, event type, actor, and time window (24h/7d/30d). Each event row is clickable to open Context Drawer.

**Global News Feed** *(Source: Reuters/AP/AFP RSS + GDELT)*
Geotagged headlines with source attribution, category tags, and timestamps. AI deduplication: the same story from multiple sources is collapsed into a single entry with source count shown. Filter by region or category.

**Social Intel Feed** *(Source: X API curated + Telegram public channels)*
OSINT posts with account source-type labels: GOV / MIL / JOURNALIST / ANALYST / MEDIA. Each post has an AI signal score (0–100) filtering out noise. High-signal posts are promoted to the top.

**Cyber Threat Monitor** *(Source: CISA KEV + NIST NVD + Cloudflare Radar + RIPE BGP)*
New CVEs by severity, CISA advisories, internet outage events, BGP anomalies. KPI badges: Critical CVEs (CVSS 9+), Active Outages, BGP Hijacks.

**Humanitarian Alerts** *(Source: OCHA ReliefWeb + FEMA + WHO)*
Active crises ranked by severity score (# people affected × intensity). Funding gap indicators. Active disease outbreak banners. New displacement alerts.

**Weather & Seismic Alerts** *(Source: NOAA NWS + USGS + GDACS)*
Active severe weather warnings by region. Latest significant earthquakes. Tropical storm tracker with next 24h projected path.

#### TRACK PANELS

**Military Tracker** *(Source: OpenSky filtered + AISHub naval MMSI filter)*
Live military aircraft: callsign, type classification, altitude, speed, heading, country. Live naval vessels: ship name, type, speed, last position. Sub-tabs: AIR / NAVAL. Special flags for bombers, ISR aircraft, emergency squawks.

**Force Posture** *(Source: USNI News + DoD press releases — OSINT curated)*
Carrier Strike Groups with operational status badges: IN-PORT / UNDERWAY / DEPLOYED / ELEVATED. NATO force posture level. Major active exercises. Click any entry to see ship complement and news context.

**Naval Forces** *(Source: AISHub — naval MMSI filter)*
Aggregate counts by navy: total ships, AIS-trackable ships, breakdown by category (carrier, destroyer, submarine, etc.). Click any navy to see individual ship list.

**Air Traffic Radar** *(Source: OpenSky + adsb.lol)*
Regional radar scope centered on a user-selected location. Configurable radius: 25 / 50 / 100 / 250 mi. Aircraft type filter. Emergency squawk events (7700/7600/7500) highlighted in red with optional audio alert. Live aircraft count KPI.

**Aviation Tracker** *(Source: OpenSky + FAA TFRs)*
Global totals: airborne aircraft, military aircraft count, active emergency squawks, active TFRs. VIP aircraft list (known callsigns). Top 5 busiest airspace regions.

#### ASSESS PANELS

**Markets & Finance** *(Source: Alpha Vantage + Finnhub + CoinGecko + FRED)*
Major indices, key commodity prices (WTI, Brent, Gold, Nat Gas, Wheat), major forex pairs, top 3 crypto by market cap. Crisis flag: any asset moving ±3% highlighted in orange; ±5% in red. Baltic Dry Index as a supply chain proxy.

**Energy & Resources** *(Source: EIA + ENTSO-E)*
US and EU grid load (% of capacity), spot electricity prices, weekly oil rig count, LNG terminal status count. Grid stress alert when load exceeds 90%.

**Geopolitical Risk Index** *(Source: AI-derived composite — see §15)*
Per-country risk scores (0–100) displayed as a choropleth world map. Top 10 highest-risk countries listed with week-over-week change. Score breakdown on hover: conflict / economic / cyber / humanitarian components.

**Supply Chain Monitor** *(Source: AIS + ASAM + chokepoint transit data + Baltic Dry Index)*
Active disruptions by trade route. Piracy incident count (last 30 days). Chokepoint status (normal / degraded / critical). Vessels reported rerouted. Insurance risk level per route.

#### INTELLIGENCE PANELS

**Daily Brief** *(Source: AI-synthesized from all feeds, 06:00 UTC)*
Structured morning brief with expandable sections: Security / Markets / Environmental / Humanitarian / Cyber / Space. Each bullet point has a source citation. Personalized by user's configured topic weights and focus regions.

**Situation Report Builder** *(Source: AI multi-pass against all feeds)*
Request queue with status (queued / scanning / drilling / assembling / complete). Report history with download and share buttons. Three-phase AI process: scan → drill-down → assemble. Output includes executive summary, key findings, source list, risk assessment, and recommended watch points.

**Correlation Engine** *(Source: AI cross-referencing all active feeds)*
Auto-detected event clusters surfaced as insight cards: e.g., *"3 events detected near Iranian nuclear sites in last 6h — earthquake, military aircraft, OSINT post."* Users can request: *"Find connections between [Event A] and [Event B]."*

#### SPACE & CBRN PANELS

**Space & Launches** *(Source: NASA + The Space Devs LL2 + NOAA SWPC + Celestrak)*
ISS current position with ground track. Next 5 upcoming launches with T-minus countdown. Space weather: Kp index, solar wind speed, aurora visibility forecast. Active satellite count.

**Nuclear & WMD Watch** *(Source: NTI + IAEA PRIS + EURDEP + Safecast)*
Operational reactor count globally. Radiation monitoring anomalies (readings above background threshold). NRC event notifications. Weapons program status indicators from NTI open data.

---

## 8. AI Intelligence Layer

### 8.1 AI Analyst Chat

Natural language queries answered in real time against all 150+ live feeds.

**Capability**: The AI has function-calling access to every data source. When a query is received, it: (1) identifies the relevant feeds, (2) queries them live, (3) cross-references results across sources, (4) synthesizes an answer with **source citations** linking to original data. Every response includes a "Show on map" button that opens the relevant layers.

**Example prompts pre-loaded in the interface:**
- "What's happening near the Strait of Hormuz right now?"
- "Summarize all military activity in Eastern Europe in the last 48 hours"
- "Are there any earthquakes near nuclear facilities right now?"
- "What is the current threat level for maritime shipping in the Red Sea?"
- "Cross-reference today's oil price spike with any geopolitical events"
- "Show me current nuclear threat indicators"
- "What are the latest military aircraft movements?"
- "Summarize ongoing humanitarian crises"
- "Are there any active cyber threats or internet outages?"
- "What is the state of global shipping and supply chains?"

**Team behavior (Plan Mode)**: AI Analyst chat is **shared** within a Plan Room. All members see the conversation history and can ask follow-up questions. The AI maintains context across the full conversation thread.

### 8.2 Auto-Summary Cards

Each panel has an optional AI header card (collapsed by default, expanded with one click):
- 1–3 sentence plain-language summary of the current panel data state
- Single headline finding: the most significant event in this feed right now
- Trend indicator arrow: **improving ↑** / **stable →** / **deteriorating ↓**
- Last-updated timestamp for the AI summary itself

### 8.3 Daily Intelligence Brief

Generated daily at **06:00 UTC** and available in-app. Delivered to email for all tiers.

Structure:
1. **Global Security** — Overnight conflict events, notable military movements, strike activity
2. **Markets & Economics** — Significant market moves, commodity changes, central bank actions
3. **Environmental** — Significant natural disasters, extreme weather, wildfire escalations
4. **Humanitarian** — New crises, displacement events, aid funding updates
5. **Cyber & Infrastructure** — Critical CVEs, active outages, BGP anomalies
6. **Space & Science** — Upcoming launches, solar weather, ISS status

Each section: 3–5 bullet points, source citations with clickable links. Brief is viewable in-app as a panel or full-page.

**Personalization**: Users set topic weights ("Prioritize Middle East + maritime + cyber") and the brief re-ranks accordingly.

### 8.4 Situation Reports (On-Demand, Multi-Pass)

Three-phase AI intelligence report generation:

| Phase | What Happens |
|---|---|
| **1 — Scan** | AI reviews all 150+ feeds for relevance to the requested topic |
| **2 — Drill-Down** | AI interrogates the 5–10 most relevant feeds in depth |
| **3 — Assemble** | Structured report written with analysis, risk assessment, and recommendations |

Report output structure:
- Executive Summary (2–3 paragraphs)
- Key Findings (bulleted, sourced)
- Cross-Reference Analysis (event correlations identified)
- Risk Assessment: Low / Medium / High / Critical with justification
- Recommended Watch Points (what to monitor next and at what frequency)
- Data Sources Used (full provenance list)

Reports are shareable via unique URL and downloadable as PDF.

### 8.5 Anomaly Detection Engine

Background process continuously running statistical models against all feeds:

| Anomaly Type | Detection Method |
|---|---|
| Flight volume spike | Z-score vs. 30-day rolling mean per region |
| Vessel clustering | PostGIS ST_ClusterKMeans, compared to historical patterns |
| Earthquake near nuclear facility | PostGIS ST_DWithin spatial join, triggers above M4.5 |
| OSINT post cluster | Same location + same entity mentioned by 3+ sources within 30 min |
| Commodity + conflict correlation | Temporal correlation within ±6h event window |
| BGP hijack + advisory | Concurrent RIPE anomaly and CISA/ICS advisory |

When detected, a **Smart Alert card** appears in the notification center with: anomaly type, severity, AI narrative explanation, and a "Show on map" action.

### 8.6 Geopolitical Risk Score (AI-Derived Composite)

A per-country risk score (0–100) recalculated daily from:

| Component | Weight | Source |
|---|---|---|
| Armed conflict events (last 30 days) | 30% | ACLED |
| News event intensity | 20% | GDELT |
| Travel advisory level (1–4) | 15% | US State Dept |
| Active sanctions count | 10% | OpenSanctions |
| Internet outage / censorship | 10% | OONI + Cloudflare |
| Humanitarian aid requirement flag | 10% | OCHA |
| Economic volatility | 5% | Alpha Vantage / FRED |

Displayed as: choropleth map layer, top-10 list in the Geopolitical Risk Index panel, and per-country detail in the Context Drawer.

---

## 9. Alert & Notification System

### 9.1 Alert Engine

Users configure alerts in plain English or via a structured 6-step wizard. The engine parses each rule into a structured query, registers a real-time subscription against the relevant data streams, and triggers delivery when conditions are met.

**Example alert rules:**
- "Earthquake magnitude > 6.0 within 250km of a nuclear power plant"
- "Military aircraft with BOMBER callsign detected in Middle East airspace"
- "CISA ICS/SCADA advisory published"
- "Oil price moves more than 3% in 1 hour"
- "New conflict event in Sudan involving civilian casualties"
- "Internet outage detected in a country with active elections"
- "Carrier strike group transits through Strait of Hormuz"

### 9.2 Alert Creation Wizard (6 Steps)

1. **Select Source(s)** — Searchable, categorized list of all 150+ feeds (same categories as §5)
2. **Define Condition** — Threshold value / keyword match / geographic filter / severity level / new-item trigger
3. **Set Geography** — Global / Country / Region / Radius around a point (user draws on map)
4. **Set Delivery** — In-app / Email / Webhook / Slack / Discord / Team Alert
5. **Set Frequency** — Real-time / Hourly digest / Daily digest
6. **Name & Activate** — Review rule summary, name it, toggle active

### 9.3 Alert Delivery Methods

| Method | Available Tier |
|---|---|
| In-app notification (notification center) | All tiers |
| Email (immediate) | All tiers |
| Email digest (hourly or daily) | All tiers |
| Webhook (custom URL POST) | Analyst+ |
| Slack channel integration | Team+ |
| Discord channel integration | Team+ |
| Team Alert (all Plan Room members notified) | Team+ |

### 9.4 Team Alerts (Plan Mode Integration)

When a Team Alert fires in a Plan Room context:
- All active Plan Room members receive an in-app notification with a banner
- The alert event is automatically appended to the Shared Event Timeline with a 🔔 badge
- If a Watch List entity triggered it, that entity is promoted to the top of the Watch List with a pulse animation
- A new AI Smart Alert card is generated with context about why this alert fired

### 9.5 Notification Center

A unified notification center (bell icon, top nav) shows:
- All fired alerts in chronological order
- Smart Alerts (AI anomaly detection — §8.5)
- Feed health warnings (when a data source goes stale or offline)
- Plan Room activity notifications (new annotations, timeline entries, member joins)
- Unread count badge on the bell icon

---

## 10. Plan Mode — Collaborative Intelligence

Plan Mode is Meridian's **signature differentiator**. It transforms the platform from a passive monitoring tool into an active, real-time team coordination workspace. No equivalent feature exists in any free OSINT platform today.

### 10.1 Concept

A **Plan Room** is a persistent shared workspace where 2–50 users simultaneously:
- View the same map with synchronized or independent layer states
- See each other's live cursors and active focus areas
- Annotate the map in real time with shared, versioned drawings
- Build and maintain a shared event timeline (auto-populated + manual)
- Assign and track monitoring tasks via a Kanban task board
- Collaborate on a shared AI Analyst chat session
- Maintain a shared Watch List of tracked entities (vessels, aircraft, locations, keywords)
- Produce and export collaborative intelligence reports

The analogy is **Google Docs meets a military operations center** — all the real-time collaboration of document editing, applied to a live global intelligence canvas.

### 10.2 Plan Room Structure

Each Plan Room contains five interconnected views, accessible via a tab bar on the left:

| Tab | Icon | Content |
|---|---|---|
| **Map** | Globe | The shared collaborative map canvas |
| **Timeline** | Clock | Shared event timeline (auto + manual) |
| **Tasks** | Checklist | Kanban task board for monitoring assignments |
| **Watch List** | Eye | Shared tracked entities |
| **Intel Board** | Pin | Shared documents, reports, and exported data |

### 10.3 Collaborative Map Canvas

**Live Presence**: All connected members have a color-coded, named cursor visible on the map. Cursors include the user's display name in a label tooltip. Member avatars appear in a row in the top-right of the map panel showing who is currently in the room.

**Focus Following**: Any member can click another member's avatar to enter "Follow" mode — their viewport mirrors that member's map view in real time. Used for briefings and guided analysis. A banner shows: *"Following [Name] — click anywhere to detach."*

**Pointer Broadcast**: Any user can press and hold a hotkey to broadcast a pulsing "attention here" marker visible to all members for 5 seconds. Used to direct team attention without taking over viewports.

**Layer Sync Modes** (toggled by room admin):
- *Independent*: Each member controls their own active layers (default)
- *Presenter Sync*: All members mirror the admin/presenter's layer state exactly

**Viewport Broadcast**: A "Share my view" button sends your current map viewport bounding box to the team chat as a clickable link: *"[Name] is viewing: Central Europe at zoom 6 — click to jump."*

### 10.4 Shared Annotation Tools

All drawing actions are transmitted to all members in real time via Yjs CRDT — no conflicts, full version history.

| Tool | Description |
|---|---|
| **Point of Interest** | Named pin marker with optional notes, color, and linked URL |
| **Region Outline** | Polygon or circle defining an area of interest |
| **Route / Line** | Polyline with label (supply route, patrol path, flight corridor, evacuation route) |
| **Range Circle** | Circle of defined radius from a point (e.g., "25nm exclusion zone", "50km blast radius") |
| **Arrow / Vector** | Directional arrow with label (advance direction, wind direction, convoy route) |
| **Text Label** | Free-form text placed anywhere on the map |
| **Freehand Draw** | Freehand ink for quick callouts (auto-simplifies on release) |

**Annotation metadata**: Each annotation records creator, creation timestamp, and full edit history. Hover any annotation to see "Created by [Name] at [time]". Creators and room admins can lock annotations to prevent further edits.

**Comments**: Team members can attach comment threads to any annotation — a small comment icon appears on the annotation. Clicking it opens a side-thread panel.

### 10.5 Shared Event Timeline

The Timeline tab shows a chronological log of everything relevant to the Plan Room's defined **Area of Interest (AOI)** — a polygon or set of countries defined by the room admin.

**Auto-populated events** (from active map layers within the AOI):
- Armed conflict events (ACLED)
- Significant weather / seismic events (NOAA / USGS)
- Military aircraft transits (OpenSky)
- Naval vessel movements (AISHub)
- Cyber incidents (CISA / Cloudflare)
- News headlines (GDELT / Reuters)

**Manual entries** added by team members:
- Intelligence observations
- Key decisions made during the session
- Source-linked notes
- Links to external documents or URLs

**Timeline UI**: Vertical swimlane. Each event has a colored dot (type), title, source badge, and timestamp. Hovering expands a summary. Clicking opens the Context Drawer for that event. A "Jump to map" button centers the map on the event.

**Time filtering**: Slider at top — zoom to last 1h / 6h / 24h / 7d / custom range.

**AI Summary button**: Generates a narrative paragraph summarizing all timeline events in the selected time range. Output is inserted as a purple AI note entry in the timeline.

**Export**: Full timeline as PDF (formatted intelligence chronology) or structured JSON.

### 10.6 Task Board

A Kanban-style board for distributing monitoring responsibilities across the team.

**Columns**: `To Monitor` → `Assigned` → `Active Watch` → `Escalated` → `Completed`

Each **Task Card** contains:
- Task description (what to monitor)
- Assigned team member (or unassigned)
- Priority: 🔴 High / 🟡 Medium / 🟢 Low
- Data source(s) to watch
- Linked timeline event or map annotation
- Review time (when to check in)
- Notes thread

**AI Task Suggestion**: The Correlation Engine (§8.5) can generate suggested tasks based on the current threat picture. Example: *"Unusual military callsigns detected over Eastern Mediterranean — suggest assigning monitoring to a team member."* These appear as greyed-out suggestion cards that can be accepted or dismissed.

**Task Alerts**: When a task's linked Watch List entity triggers an alert, the task card moves to `Escalated` automatically and the assigned member is notified.

### 10.7 Shared Watch List

A live collaborative tracking list of named entities. Any member can add/remove entities; all changes are instantly visible to everyone.

| Entity Type | Examples | How Tracked |
|---|---|---|
| Vessel | USS Abraham Lincoln (CVN-72) | MMSI lookup — live AIS position |
| Aircraft | FENIX47, SKULL51 | ICAO hex or callsign — live ADS-B |
| Location / Zone | Strait of Hormuz, Zaporizhzhia | Geofence — any feed event within radius triggers |
| Country | Iran, Ukraine, Taiwan | Aggregates all feed events for the country |
| Keyword / Actor | Specific group or individual | ACLED + GDELT + OSINT keyword match |
| Cyber Asset | CVE-2024-XXXX, specific domain | NVD + threat feed match |
| Weather System | Hurricane Delta (2025-AL14) | NOAA NHC storm ID tracking |
| Satellite | ISS, FENGYUN-1C debris | TLE-based position tracking |

When a Watch List entity generates a new event, it: (1) pulses at the top of the list, (2) fires a Team Alert, (3) auto-appends to the Shared Event Timeline.

### 10.8 Intel Board

A pinboard-style shared repository of intelligence artifacts:
- Exported Situation Reports (PDF or link)
- Exported Timeline snapshots
- Shared external URLs (news articles, official statements, source documents)
- Data export files (CSV, GeoJSON, KML)
- AI chat transcript excerpts (pinned from the AI chat history)
- Custom notes and rich-text documents (collaborative editing via Yjs)

Items can be tagged, sorted by date, and searched. The Intel Board persists after a Plan Room session ends, building a running intelligence archive for the workspace.

### 10.9 Briefing Mode

A special state for presenting the Plan Room's content to an audience:

- One member is designated **Briefer** — their map view and actions are broadcast to all
- All other members enter **Audience mode** — their viewports mirror the Briefer's navigation
- Briefer can: navigate the map, open panels, expand Context Drawers, run AI queries, spotlight annotations — all visible to audience
- **Annotation Spotlight**: Briefer clicks "spotlight" on any annotation — it pulses and zooms for all viewers
- **AI narration**: Briefer can trigger an AI summary of any region or event; the response appears in a shared overlay
- Exit Briefing Mode: all members return to independent navigation

### 10.10 Plan Room Export Options

| Export Format | Contents |
|---|---|
| **PDF Situation Report** | Map screenshot at current zoom + timeline (formatted) + annotations list + AI summaries |
| **KML / GeoJSON** | All annotations and Watch List entities as standard geographic data files |
| **JSON Data Pack** | Structured export of all GeoEvents in the AOI for the selected time window |
| **CSV Data Export** | Tabular format of timeline events for spreadsheet analysis (Analyst+ tier) |
| **Shareable Read-Only Link** | Full Plan Room snapshot accessible without a Meridian account — for external stakeholders |

---

## 11. Multi-User Platform Architecture

### 11.1 Organizational Structure

```
Organization (billing root)
  └── Workspace (team environment)
        ├── Members  (Admin / Analyst / Contributor / Observer)
        ├── Plan Rooms  (collaborative sessions — persistent)
        ├── Shared Alert Rules  (fire for all workspace members)
        ├── Shared Saved Layouts  (deck templates shared across team)
        └── Intel Board  (shared document and report repository)
```

- One **Organization** can have multiple **Workspaces** (e.g., by division, project, or client)
- Each Workspace has its own member list, Plan Rooms, and alert rules
- Members can belong to multiple Workspaces with different roles in each

### 11.2 Role-Based Access Control (RBAC)

**Workspace-level roles:**

| Role | Capabilities |
|---|---|
| **Admin** | Full control — member management, billing, workspace config, all features |
| **Analyst** | Full dashboard, Plan Rooms, AI, alerts, data export, situation reports |
| **Contributor** | Dashboard, Plan Rooms (limited), alerts (view only), no data export |
| **Observer** | View-only dashboard and Plan Rooms; no edit rights anywhere |

**Plan Room–level roles** (override workspace role within a specific room):

| Role | Capabilities |
|---|---|
| **Room Owner** | Full control, member management, room config, Briefing Mode |
| **Analyst** | Full map interaction, annotations, AI, alerts, timeline |
| **Contributor** | Annotations, timeline entries, chat, Watch List additions |
| **Observer** | View-only — sees all content, no write access |
| **AI Briefer** | Can trigger AI reports and briefings; read-only map |

### 11.3 Subscription Tiers

| Tier | Price | Seats | Plan Rooms | AI Messages/mo | Alerts | Situation Reports/mo |
|---|---|---|---|---|---|---|
| **Free** | $0 | 1 | — | 10 | 5 | — |
| **Analyst** | $15/mo | 1 | — | 100 | 50 | 5 |
| **Team Starter** | $49/mo | 5 | 3 active | 500 pooled | 200 | 20 |
| **Team Pro** | $129/mo | 15 | 10 active | 2,000 pooled | Unlimited | Unlimited |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

All tiers include: full dashboard, all panels, all data sources, all map layers, unlimited saved layouts, and the daily intelligence brief.

### 11.4 Authentication & Security

- Email/password registration with email verification
- Optional SSO: Google OAuth 2.0, Microsoft Azure AD
- Two-factor authentication (TOTP via authenticator app) — required for Team Pro and Enterprise
- API tokens for programmatic access (Analyst+ tiers) — scoped to read-only or read-write
- Full audit log: all user actions in Plan Rooms timestamped with actor, action, and affected resource
- Data at rest: AES-256 encryption for all stored events and user data
- Data in transit: TLS 1.3 enforced on all connections

### 11.5 Real-Time Infrastructure Detail

| Component | Technology | Role |
|---|---|---|
| WebSocket server | Socket.io + Node.js | Live data push to all connected clients; Plan Mode event relay |
| CRDT collaboration | **Yjs** | Conflict-free concurrent editing of annotations, timeline, Intel Board |
| Cache + Pub/Sub | **Redis** | Sub-millisecond event fan-out from ingestion workers to WS clients |
| Geospatial DB | **PostgreSQL + PostGIS** | All GeoEvents stored with spatial indexing; proximity queries |
| Time-series data | **TimescaleDB** (PG extension) | Efficient storage + range queries on high-frequency feed data |
| Task queue | **BullMQ + Redis** | Scheduled ingestion workers; alert rule evaluation workers |

---

## 12. UI/UX Design System

### 12.1 Color System

**Background Scale** (darkest → lightest):

| Token | Hex | Use |
|---|---|---|
| `--bg-app` | `#090d09` | Application background |
| `--bg-panel` | `#0f140f` | Panel / card background |
| `--bg-card` | `#151c15` | Inner card, list item background |
| `--bg-hover` | `#1c261c` | Hover and active states |
| `--border` | `#2a3a2a` | All borders and dividers |

**Accent Colors**:

| Token | Hex | Use |
|---|---|---|
| `--green-primary` | `#00e676` | Primary action, live indicator, success |
| `--cyan-info` | `#00bcd4` | Secondary / informational |
| `--red-critical` | `#ff5252` | Critical alert, error, threat |
| `--orange-warning` | `#ff9800` | Warning, elevated status |
| `--yellow-caution` | `#ffeb3b` | Caution, watch |
| `--purple-ai` | `#7c4dff` | AI-generated content, predictions |
| `--blue-track` | `#448aff` | Tracking, aviation, maritime |

### 12.2 Typography

- **Primary**: Inter (variable 14..32 optical size range, 100–900 weight) — same choice as SitDeck but applied with more generous sizing
- **Monospace**: JetBrains Mono — used for coordinates, callsigns, ICAO/MMSI codes, CVE IDs, IP addresses
- **Base panel text**: 13px / line-height 1.5
- **Compact KPI badges**: 11px bold
- **Section headers**: 11px uppercase + letter-spacing 0.08em (label style)
- **Headlines / Alert text**: 14px medium

### 12.3 Panel Layout Rules

- **Gutter**: 12px between all panels (SitDeck uses ~4px — Meridian doubles it minimum)
- **Internal padding**: 16px on all sides for panel content
- **Panel header height**: 40px — icon + title left, controls right
- **Data rows**: 36px minimum height; hover state: `--bg-hover` background
- **KPI badges**: Pill shape (4px radius), colored by severity palette, 11px bold text
- **Timestamps**: Always UTC; hover shows local time in a tooltip
- **Source attribution**: Every data row shows source name in a muted badge; clicking opens the source URL in a new tab
- **Empty states**: Illustrated empty state with descriptive message — never a blank white space

### 12.4 Responsive Breakpoints

| Breakpoint | Layout Behavior |
|---|---|
| ≥ 1920px | Full multi-panel grid; map at ~65% width; 3-column panel grid |
| 1440–1919px | Default target layout; map ~60%; 3-column panels |
| 1280–1439px | 2-column panel grid; map slightly compressed |
| 1024–1279px | Map full-width top; panels in horizontal scroll tabs below |
| 768–1023px | Tabbed navigation between Map and Panels; no simultaneous view |
| < 768px | Mobile: map full screen with floating panel drawer; bottom sheet for panels |

### 12.5 Navigation Structure

**Top Navigation Bar** (always visible, 48px height):
- Left: Meridian logo + workspace name dropdown
- Center: Status bar — UTC clock, active feed count (e.g., "142 / 150 feeds live"), alert bell with unread count
- Right: Plan Mode button, layout presets dropdown, settings, user avatar

**Left Sidebar** (collapsible, 48px icon rail):
- Dashboard (home)
- Map (full-screen map mode)
- Plan Mode (Plan Room list)
- AI Analyst
- Alerts
- Reports
- Settings

**Context Drawer** (right side, 420px, slide-in on event click — does not use the sidebar space)

### 12.6 Key UX Patterns

**Progressive Disclosure**: Every complex data row has a ▶ expand indicator. Default state shows headline KPIs; expanded state shows full data including sub-events, metadata, and AI context.

**Top Status Bar (pinned KPIs)**: Users can pin any panel's headline metric to a persistent row at the top of the screen. Example pins: "🔴 Strikes: 256 · 🟡 Earthquakes 24h: 12 · 🟢 Oil: $74.22 · 🔵 Flights: 18,442"

**Deck Switcher**: Top-right dropdown shows all saved layouts. Switching takes < 300ms. Current layout is always auto-saved.

**Feed Health Monitor** (accessible from top bar): Shows all 150+ feed statuses as a grid — green (live), amber (stale), red (down). Hover any dot for last-fetched time and next scheduled poll.

**Keyboard Shortcuts**:
- `M` — Toggle map full-screen
- `P` — Open Plan Mode / active Plan Room
- `A` — Open AI Analyst chat
- `N` — Open notification center
- `/` — Global search (events, entities, locations)
- `L` — Open map layers panel
- `Esc` — Close Context Drawer / Briefing Mode

---

## 13. Pre-Built Intelligence Decks

One-click deployable dashboard templates. Each deck is a curated combination of panels and map layers optimized for a specific use case. Users can load a deck and then customize from there.

---

### Command Center *(Default)*
*Full-spectrum operational overview for general situational awareness.*

**Panels**: Conflict Monitor · Military Tracker · Air Traffic Radar · Global News Feed · Weather & Seismic Alerts · Cyber Threat Monitor · Markets & Finance · Humanitarian Alerts · Space & Launches

**Map Layers active**: Armed Conflicts · Military Air · Naval Vessels · Earthquakes · Active Fires · Live Flights · Travel Advisories

---

### War & Conflict
*Active conflict monitoring and military movement tracking.*

**Panels**: Conflict Monitor (expanded) · Military Tracker · Force Posture · Naval Forces · Social Intel Feed · AI Analyst · Situation Report Builder

**Map Layers active**: Armed Conflicts · Airstrikes & Kinetic Events · Military Air · Naval Vessels · Carrier Strike Groups · Military Bases · Protests/Unrest · Travel Advisories

---

### Maritime & Trade
*Shipping, naval intelligence, and global supply chain monitoring.*

**Panels**: Naval Forces · Aviation Tracker (maritime focus) · Supply Chain Monitor · Markets (Commodities tab) · Social Intel Feed · Humanitarian Alerts (displacement)

**Map Layers active**: Live Vessels · Naval Vessels · Submarine Cables · Shipping Chokepoints · Piracy/ASAM Incidents · Global Ports · Carrier Strike Groups · USCG Incidents

---

### Cyber & Infrastructure
*Threat intelligence, vulnerabilities, internet health, and critical infrastructure.*

**Panels**: Cyber Threat Monitor (expanded) · Energy & Resources · Global News Feed (cyber filtered) · AI Analyst · Daily Brief (cyber focus)

**Map Layers active**: Internet Outage Overlay · Internet Exchange Points · Nuclear Power Plants · Power Grid Infrastructure · Internet Censorship (OONI)

---

### Environment & Climate
*Natural hazard monitoring, environmental intelligence, and climate indicators.*

**Panels**: Weather & Seismic Alerts (expanded) · Humanitarian Alerts (disaster focus) · Markets (Commodities — agricultural) · Daily Brief (environmental focus) · Correlation Engine

**Map Layers active**: Earthquakes · Active Fires · Hurricanes · Volcanoes · Floods · Tsunami Warnings · Landslides · Dust Storms · Coral Reef Status · Heat Index Extremes

---

### Humanitarian Response
*Crisis monitoring, disaster response coordination, and aid intelligence.*

**Panels**: Humanitarian Alerts (expanded) · Global News Feed · Social Intel Feed · Supply Chain Monitor · FEMA (US) · Daily Brief (humanitarian focus)

**Map Layers active**: Refugee/IDP Movements · Active Humanitarian Ops · Food Insecurity Zones · Disease Outbreaks · FEMA Disasters · Famine Warning Areas · FEMA Open Shelters

---

### Markets & Finance
*Financial monitoring with geopolitical and supply chain risk overlay.*

**Panels**: Markets & Finance (expanded) · Energy & Resources · Geopolitical Risk Index · Conflict Monitor · AI Analyst · Daily Brief (markets focus)

**Map Layers active**: Active Sanctions · Travel Advisories · Political Violence Index · Shipping Chokepoints · Oil & Gas Infrastructure · Armed Conflicts

---

### OSINT & Social
*Open-source intelligence aggregation and social signal monitoring.*

**Panels**: Social Intel Feed (expanded) · Global News Feed · Conflict Monitor · AI Analyst · Correlation Engine

**Map Layers active**: X Posts layer · Armed Conflicts · Protests/Unrest · Press Freedom Choropleth · Terrorism Incidents · Travel Advisories

---

### Nuclear & WMD Watch
*Nuclear facility monitoring, radiation, CBRN threats, and weapons programs.*

**Panels**: Nuclear & WMD Watch (expanded) · Military Tracker (bomber/missile filter) · Cyber Threat Monitor (ICS focus) · AI Analyst · Daily Brief (nuclear focus)

**Map Layers active**: Nuclear Reactors · Radiation Monitoring Points · Nuclear Weapons Sites · Missile Test Zones · Military Bases · Armed Conflicts

---

### Aviation & Space
*Flight tracking, airspace intelligence, and space situational awareness.*

**Panels**: Air Traffic Radar · Aviation Tracker · Space & Launches (expanded) · Military Tracker (AIR tab) · AI Analyst

**Map Layers active**: Live Flights · Military Air · Emergency Squawks · VIP/Executive Aircraft · TFRs/NOTAMs · ISS Position · Active Satellites · SatNOGS Ground Stations · Launch Corridors

---

## 14. Technology Stack

### 14.1 Frontend

| Layer | Technology | Rationale |
|---|---|---|
| Framework | React 18 + TypeScript | Industry standard, strong ecosystem, team scalability |
| Map engine | **MapLibre GL JS** | Open-source Mapbox fork — no billing, full WebGL feature parity |
| 3D globe | **Globe.GL + Three.js** | Free WebGL globe with night-Earth texture and data overlays |
| State management | **Zustand** | Lightweight, reactive, minimal boilerplate |
| UI components | **Radix UI** (headless) + custom | Accessible primitives; we own the visual design |
| Styling | **Tailwind CSS** + CSS custom properties | Rapid iteration; design token system via CSS vars |
| Icons | **Lucide React** | Clean, consistent, MIT-licensed icon set |
| Real-time client | **Socket.io client** | WebSocket with automatic fallback transport |
| Charts | **Recharts + D3.js** | Declarative SVG charts; D3 for custom geospatial vis |
| Grid layout | **react-grid-layout** | Drag-resize panel system with serializable layouts |
| Collaboration | **Yjs** (y-websocket provider) | CRDT for Plan Mode annotation and document sync |
| Forms | **React Hook Form + Zod** | Type-safe form validation; used in alert wizard |
| Routing | **React Router v6** | Standard SPA routing |
| Date/time | **date-fns** | UTC-first date handling; no moment.js bloat |

### 14.2 Backend

| Layer | Technology | Rationale |
|---|---|---|
| API server | **Node.js + Express** | Async I/O ideal for feed polling and proxying |
| Real-time server | **Socket.io** | WebSocket + fallback; Plan Mode channel management |
| Collaboration server | **y-websocket** (Node.js) | Yjs sync server for CRDT Plan Mode documents |
| Feed workers | **BullMQ** (Bull v4) | Reliable queue for scheduled ingestion workers |
| Auth | **Passport.js + JWT + bcrypt** | Proven, modular auth stack |
| Email delivery | **Nodemailer + SendGrid** | Transactional email for alerts and daily briefs |
| Webhook dispatch | Custom HTTP dispatcher | Outbound alert delivery with retry logic |
| Data export | **json2csv + pdfkit** | CSV and PDF export for reports and timelines |
| Validation | **Zod** (shared with frontend) | Schema validation on API inputs |

### 14.3 AI Layer

| Component | Technology | Notes |
|---|---|---|
| LLM provider | **OpenAI GPT-4o** (or Anthropic Claude 3.5) | Function-calling / tool-use for live data retrieval |
| Embeddings | **text-embedding-3-small** (OpenAI) | Semantic similarity for event correlation |
| Vector store | **pgvector** (PostgreSQL extension) | Stores embeddings alongside GeoEvents in same DB |
| Anomaly detection | **Python + scikit-learn / PyOD** | Statistical baseline models per feed; runs as a sidecar service |
| Risk scoring | **Python custom model** | Weighted composite scorer; outputs per-country risk scores |
| Report generation | LLM with structured system prompts | Daily brief + situation reports via multi-pass chain |
| AI orchestration | **LangChain** (or custom) | Tool registration, function dispatch, chain management |

### 14.4 Data Layer

| Layer | Technology | Rationale |
|---|---|---|
| Primary database | **PostgreSQL 16** | Full relational support, ACID, excellent JSON support |
| Geospatial extension | **PostGIS 3.4** | ST_DWithin, ST_Within, ST_ClusterKMeans — all proximity/spatial queries |
| Time-series extension | **TimescaleDB** | Hypertables for efficient storage of high-frequency feed data with auto-compression |
| Vector extension | **pgvector** | Embedding storage for AI semantic search |
| Cache + Pub/Sub | **Redis 7** | Sub-millisecond event cache; Pub/Sub fan-out to WebSocket clients |
| Search | **PostgreSQL FTS** + **Meilisearch** | Full-text search on events and entities; Meilisearch for fast typeahead |
| Object storage | **S3-compatible** (MinIO self-hosted or AWS S3) | PDFs, GeoJSON exports, map tile cache, report storage |

### 14.5 Map Tile Infrastructure

MapLibre GL JS supports any vector tile source. Meridian uses a layered approach for tiles:

| Source | Provider | Cost |
|---|---|---|
| Base vector tiles | **OpenFreeMap** CDN | Free, no key required |
| CARTO Dark Matter / Positron | **CARTO** (public CDN) | Free, no key required |
| Satellite imagery | **Esri ArcGIS Online** (open basemap) | Free tier |
| Self-hosted custom tiles | **Martin** (Rust tile server) | Serves PostGIS data as vector tiles; zero cost |
| 3D terrain | **OpenTopoMap** tiles | Free |

### 14.6 Infrastructure & DevOps

| Layer | Technology |
|---|---|
| Containerization | Docker + Docker Compose (dev) |
| Orchestration | Kubernetes (k3s or GKE for prod) |
| Reverse proxy + TLS | Nginx + Let's Encrypt (Certbot) |
| CDN | Cloudflare (free tier covers DDoS protection + caching) |
| Monitoring | Prometheus + Grafana (feed health, API latency, WebSocket connections) |
| Error tracking | Sentry (frontend + backend) |
| CI/CD | GitHub Actions |
| Secrets management | HashiCorp Vault (or AWS Secrets Manager) |
| Infrastructure-as-code | Terraform |

### 14.7 Third-Party Integrations Required

The following API keys/registrations must be obtained and managed server-side. Users never see or configure these:

| Service | Purpose | Cost |
|---|---|---|
| OpenAI API | AI Analyst, situation reports, daily brief | Pay-per-token |
| ACLED API key | Conflict event data | Free (research registration) |
| Alpha Vantage API key | Financial market data | Free tier (500 req/day) |
| Finnhub API key | Financial data (supplement) | Free tier |
| Space-Track.org login | Satellite TLE catalog | Free (registration) |
| X (Twitter) API | OSINT social feed | Basic tier ($100/mo) or elevated academic |
| FRED API key | Federal Reserve economic data | Free |
| CoinGecko API | Crypto market data | Free tier |
| Reddit API | Reddit OSINT feed | Free tier |
| SendGrid | Email delivery | Free tier (100 emails/day) |
| NASA API key | ISS, NEO, space data | Free (rate-limited without key) |

---

## 15. Derived & Computed Data Points

A critical insight: many of the most valuable data points in Meridian are **not directly fetched from a single source** — they are **computed** from combinations of primary sources. This is what makes the platform's intelligence layer deeper than raw aggregation.

| Derived Dataset | Primary Sources | Computation Method |
|---|---|---|
| **Geopolitical Risk Score** (per country, 0–100) | ACLED + GDELT + State Dept advisories + OpenSanctions + OONI + OCHA + Alpha Vantage | Weighted composite index; normalized to 0–100; recalculated daily |
| **Military Aircraft Identification** | OpenSky ADS-B hex codes + community-maintained ICAO military hex database | Hex range filter against known military blocks; callsign pattern matching (e.g., RCH, JAKE, SKULL) |
| **Carrier Strike Group Positions** | AISHub AIS (carrier MMSI) + USNI News OSINT + naval MMSI list | AIS position cross-verified against OSINT reporting; carrier + escort cluster detection |
| **Flight Volume Anomaly Score** | OpenSky live counts per 1°×1° grid cell + 30-day rolling baseline | Z-score: `(live_count - mean) / stdev` per cell; cells above threshold flagged |
| **Supply Chain Disruption Index** | AIS vessel routing + ASAM incidents + chokepoint transit counts + Baltic Dry Index | Rule-based + statistical model: incident proximity, vessel rerouting detection, BDI deviation |
| **Nuclear Proximity Alert** | USGS earthquake events + IAEA PRIS reactor locations | PostGIS: `ST_DWithin(earthquake.geom, reactor.geom, 250000)` — triggers for M > 4.5 |
| **Conflict-Market Correlation** | ACLED events + Alpha Vantage commodity prices + GDELT | Temporal correlation: events and price moves within ±6h window; flagged when r > 0.7 |
| **Internet Censorship Signal** | OONI probe reports + Cloudflare Radar + RIPE BGP + internet outage reports | Multi-source consensus: 2+ sources reporting degradation in same country = elevated signal |
| **Humanitarian Crisis Severity Score** | OCHA data + IPC food insecurity + UNHCR displacement + WHO outbreaks + FEWS NET | Severity-weighted composite: `(displacement × 0.3) + (food_insecurity × 0.25) + (outbreak × 0.25) + (funding_gap × 0.2)` |
| **Naval Force Concentration** | AISHub naval vessels | PostGIS ST_ClusterKMeans on naval vessel positions; cluster centroids with vessel counts |
| **OSINT Post Cluster Alert** | X API OSINT feed + Reddit + Telegram + RSS | Entity + location extraction (NLP); 3+ sources mentioning same entity/location within 30 min = cluster alert |
| **Airspace Threat Indicator** | OpenSky military aircraft + ACLED airstrikes + FAA TFRs | Correlation of military aircraft presence with active conflict events and TFR issuance in same region |
| **Sanctions Economic Pressure Index** | OpenSanctions + Alpha Vantage forex + World Bank trade data | Active sanctions count per country × trade exposure × currency volatility |
| **Disease Outbreak Trajectory** | WHO outbreak news + ProMED RSS + GDELT health events | Multi-source confirmation count; trajectory calculated as 7-day moving average of new reports |

---

## 16. Development Phases & Roadmap

Development is split into four phases. Each phase produces a shippable product. The free tier is functional from Phase 1.

---

### Phase 1 — Core Platform (Months 1–3)

**Goal**: A working single-user dashboard with live data and an interactive map. Free-tier MVP.

**Backend & Data:**
- [x] Project scaffolding: monorepo (FastAPI + React frontend + Python AI service)
- [x] PostgreSQL + PostGIS setup with Docker Compose (schema.sql + docker-compose)
- [x] Redis setup (cache + Pub/Sub)
- [x] Unified `GeoEvent` schema and ingestion pipeline
- [x] APScheduler worker framework for scheduled feed polling (FeedWorker base class + AsyncIOScheduler)
- [x] Ingestion workers for 25 feeds (Phase 1 set + expanded):
  - USGS Earthquakes · NOAA NWS Alerts · NASA FIRMS · GDACS · ACLED
  - OpenSky Network · AISHub · CISA KEV · GDELT · Alpha Vantage
  - Reuters/AP RSS · NASA ISS · NOAA NHC · USGS Water · FEMA OpenFEMA
  - ReliefWeb · NASA EONET · WHO Outbreaks · EMSC Earthquakes · Volcano Discovery
  - ProMED RSS · IAEA News · OpenAQ · NOAA Space Weather · ACAPS
- [x] WebSocket server (Socket.io) with Redis Pub/Sub bridge for real-time feed push
- [x] User auth: register / login / JWT / email verification / user profiles
- [x] REST API: events (paginated, filtered by category/region/time), user settings, layouts

**Frontend & Map:**
- [x] MapLibre GL JS integration with CARTO Dark Matter and OpenFreeMap tile styles
- [x] Map layer system with toggle UI — 20+ layers from Phase 1 feeds
- [x] Context Drawer component (slides from right, never covers map)
- [x] Core panel grid (react-grid-layout) with 6 panels:
  - Conflict Monitor · Weather & Seismic Alerts · Global News Feed · Markets & Finance
  - Military Tracker (AIR tab) · Naval Forces
- [x] Panel header design (source badge, live indicator, share, expand, close)
- [x] Saved layouts: save / load / rename (1 layout per free user)
- [x] Top nav: UTC clock, feed health indicator, alert bell, user menu
- [x] Left sidebar with navigation icons
- [x] Pre-built deck: Command Center (default) + War & Conflict

**Milestone**: Free-tier MVP with 20 live data feeds, 20 map layers, 6 panels. Demonstrably better UX than SitDeck in terms of breathing room and Context Drawer interaction.

---

### Phase 2 — Intelligence Layer (Months 4–5)

**Goal**: AI Analyst, alerting system, and full panel library live. Analyst tier feature-complete.

**AI & Intelligence:**
- [x] AI Analyst Chat: GPT-4o with streaming responses against all live feeds
- [x] Shared prompt library (10 pre-loaded example queries)
- [x] Auto-Summary Cards on all panels (collapsed by default)
- [x] Daily Intelligence Brief: generation pipeline + in-app display + email delivery
- [x] Situation Reports: AI-powered sitrep builder (SitrepPage + /ai/report streaming endpoint)
- [x] Anomaly Detection Engine (Python sidecar service, 6 anomaly types from §8.5)
- [x] Geopolitical Risk Score model: computation pipeline + choropleth layer

**Alerts:**
- [x] Alert rule creation (AlertRule ORM + /api/v1/alerts router)
- [x] Alert rule engine: subscription evaluation against Redis event stream
- [x] In-app notification center (AlertsPage + AlertNotification model)
- [x] Email alert delivery (SendGrid via services/alert_engine.py)
- [x] Webhook delivery (Analyst+ tier, with 3-retry logic)

**Data & Panels:**
- [x] Expanded to 25 data feeds across 10 categories (Phase 2 workers added; 80+ target is Phase 4)
- [x] Expand map to 50+ layers across all 8 groups (§6.3) — 64 layers
- [x] Full panel library: all panels in §7.4 (22 panels total)
- [x] Correlation Engine panel with AI cross-source insight cards
- [x] Supply Chain Monitor panel (derived from AIS + ASAM + BDI)
- [x] Geopolitical Risk Index panel with AI-derived scores
- [x] All pre-built decks from §13 (10 decks)
- [x] Feed Health Monitor page (FeedHealthPage + /api/v1/feeds/health endpoint)
- [ ] User personalization: topic weights for daily brief, focus regions

**Milestone**: Analyst tier fully differentiated from SitDeck by AI intelligence layer. Platform has clear value proposition for individual researchers and analysts.

---

### Phase 3 — Plan Mode & Multi-User (Months 6–8)

**Goal**: Full team collaboration suite. Team Starter and Team Pro tiers launch.

**Infrastructure:**
- [ ] Yjs CRDT server (y-websocket) for Plan Mode document sync
- [ ] Organization + Workspace data model
- [ ] RBAC: workspace roles + Plan Room roles
- [ ] SSO integration: Google OAuth 2.0
- [x] 2FA: TOTP via authenticator app (pyotp integrated in auth service)
- [ ] API tokens (scoped read-only and read-write)
- [ ] Full audit log for Plan Room actions
- [ ] Stripe billing integration (Team Starter, Team Pro, Analyst tiers)

**Plan Mode — Map Canvas:**
- [x] Plan Room creation, naming, AOI definition (PlanRoom ORM + /api/v1/plan-rooms + PlanModePage)
- [ ] Real-time cursor sync: live colored named cursors on shared map
- [ ] Focus Following mode ("Follow [User]" — viewport mirroring)
- [ ] Pointer Broadcast hotkey (attention pulse visible to all)
- [ ] Layer Sync Modes: Independent and Presenter Sync
- [x] Annotation data model (Annotation ORM with type, label, notes, geom_json, is_locked fields)
- [ ] Annotation drawing tools UI (7 types: POI, Region, Route, Range Circle, Arrow, Text, Freehand)
- [ ] Annotation comment threads
- [x] Annotation lock/unlock (is_locked field + lock/unlock endpoints)

**Plan Mode — Other Views:**
- [x] Shared Event Timeline: auto-populated from AOI feeds + manual entries (TimelineEntry ORM + router)
- [ ] Timeline AI Summary button
- [ ] Timeline export: PDF + JSON
- [x] Task Board: Kanban with 5 columns (Task ORM + /tasks router)
- [x] Shared Watch List: all 8 entity types (WatchListEntity ORM + router + WatchListPage)
- [x] Intel Board: pinned notes with classification tagging (IntelNote ORM + router + IntelBoardPanel)
- [x] Plan Room member management and role assignment (PlanRoomMember ORM + members endpoint)

**Plan Mode — Briefing Mode:**
- [ ] Briefer designation and Audience mode
- [ ] Viewport broadcast
- [ ] Annotation Spotlight feature
- [ ] Exit Briefing Mode

**Plan Room Exports:**
- [ ] PDF Situation Report export
- [ ] KML / GeoJSON export
- [ ] JSON Data Pack export
- [ ] Shareable read-only link (no account required for viewer)

**Team Alerts:**
- [ ] Team Alert configuration (fires for all Plan Room members)
- [ ] Watch List entity → Team Alert → Timeline auto-append pipeline
- [ ] Slack and Discord webhook integrations

**Milestone**: Plan Mode v1 live. First paying team customers. Unique in the market — no equivalent free OSINT platform has real-time collaborative operations capability.

---

### Phase 4 — Scale, Polish & Enterprise (Months 9–12)

**Goal**: Enterprise readiness, mobile, advanced data, and platform maturity.

**Data & Feeds:**
- [ ] Expand to 150+ feeds — fill all remaining sources in §5
- [ ] Expand map to 64 layers — complete all groups in §6.3
- [ ] Telegram OSINT channel integration
- [ ] ENTSO-E EU energy data integration
- [ ] Complete radiation monitoring network (EURDEP full coverage)
- [ ] BGP routing anomaly enhanced visualization
- [ ] Historical event replay up to 180 days for all layers
- [ ] Time scrubber UI on the map

**AI Enhancements:**
- [ ] AI Analyst context persistence across sessions (memory)
- [ ] Personalized daily brief adaptation based on user reading history
- [ ] AI-generated Plan Room briefing summaries
- [ ] Predictive threat escalation indicators (ML model on ACLED trajectory data)
- [ ] Auto-translated OSINT posts (multilingual signal extraction via LLM)

**Platform & Infrastructure:**
- [ ] Full mobile responsive implementation (§12.4)
- [ ] Progressive Web App (PWA) — installable on mobile devices
- [ ] 3D Globe mode (Globe.GL) with all data overlays
- [ ] Map tile self-hosting with Martin Rust tile server
- [ ] CSV data export (Analyst+ tier)
- [ ] API access for programmatic data retrieval (Analyst+ tier)
- [ ] Enterprise SSO (Azure AD / SAML)
- [ ] Dedicated support tier and custom deck design service
- [ ] System status page (public, shows feed health and incidents)
- [ ] Pricing page, marketing site, and onboarding flow

**Milestone**: Enterprise-ready platform. All 16 sections of this outline fully implemented. Platform positioned for press launch and growth.

---

## Appendix: Competitive Differentiation Summary

| Feature | SitDeck | Meridian |
|---|---|---|
| Data sources | 184 feeds, 26 categories | 150+ feeds, 12 categories (quality > quantity) |
| Map layers | 76 layers | 64 layers (cleaner organization) |
| AI Analyst | Chat panel, isolated | Embedded in every panel + shared in Plan Mode |
| Multi-user | No | Native — org/workspace/role architecture |
| Collaborative map | No | Plan Mode: live cursors, shared annotations, CRDT |
| Shared timeline | No | Auto-populated + manual entries + AI summary |
| Task board | No | Kanban with AI task suggestions |
| Watch list | No | Shared, multi-entity-type, auto-alerting |
| Briefing Mode | No | Full presenter/audience map sync |
| Plan Room export | No | PDF, KML, GeoJSON, JSON, read-only link |
| UI density | Very high (dense) | Breathable — 12px+ gutters, progressive disclosure |
| Context Drawer | Modal (covers map) | Slide-in drawer (map shifts left, never covered) |
| Mobile support | No | Responsive + PWA |
| Team alerts | No | Full team notification pipeline |
| Open-source stack | Unknown | MapLibre, Yjs, PostGIS, Redis, OpenFreeMap — all free |

---

*Document version: 1.1 · Last updated: March 2026 · Working title: Meridian*
*All data sources listed are free and publicly accessible. No classified or proprietary sources are required for any feature in this outline.*
