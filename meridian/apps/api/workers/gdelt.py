import httpx
import csv
import io
from datetime import datetime, timezone
from typing import List
from .base import FeedWorker
from models.geo_event import GeoEvent, FeedCategory, SeverityLevel

_GOLDSTEIN_SEVERITY = [
    (7.0, SeverityLevel.critical),
    (4.0, SeverityLevel.high),
    (1.0, SeverityLevel.medium),
    (-10.0, SeverityLevel.low),
    (-100.0, SeverityLevel.info),
]

_QUAD_CLASS_LABEL = {
    "1": "Verbal Cooperation",
    "2": "Material Cooperation",
    "3": "Verbal Conflict",
    "4": "Material Conflict",
}


def _goldstein_to_severity(score: float) -> SeverityLevel:
    for threshold, sev in _GOLDSTEIN_SEVERITY:
        if score >= threshold:
            return sev
    return SeverityLevel.info


class GDELTWorker(FeedWorker):
    """GDELT Project 2.0 — 15-minute event CSV feed."""

    source_id = "gdelt"
    display_name = "GDELT Global Events"
    category = FeedCategory.geopolitical
    refresh_interval = 900  # 15 minutes

    _LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"

    async def fetch(self) -> List[GeoEvent]:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            try:
                meta = await client.get(self._LASTUPDATE_URL)
                meta.raise_for_status()
                lines = meta.text.strip().splitlines()
                csv_url = None
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 3 and parts[2].endswith(".export.CSV.zip"):
                        csv_url = parts[2]
                        break
                if not csv_url:
                    return []

                import zipfile

                resp = await client.get(csv_url)
                resp.raise_for_status()
                zf = zipfile.ZipFile(io.BytesIO(resp.content))
                csv_bytes = zf.read(zf.namelist()[0])
                csv_text = csv_bytes.decode("utf-8", errors="replace")
            except Exception:
                return []

        events: List[GeoEvent] = []
        reader = csv.reader(io.StringIO(csv_text), delimiter="\t")
        for i, row in enumerate(reader):
            if i >= 300:
                break
            try:
                if len(row) < 58:
                    continue
                global_event_id = row[0]
                date_str = row[1]  # YYYYMMDD
                actor1 = row[6] or row[7] or ""
                actor2 = row[16] or row[17] or ""
                event_code = row[26] or ""
                quad_class = row[29] or "1"
                goldstein = float(row[30]) if row[30] else 0.0
                lat_str, lng_str = row[53], row[54]
                if not lat_str or not lng_str or lat_str == "0" or lng_str == "0":
                    continue
                lat, lng = float(lat_str), float(lng_str)
                country = row[51] or ""
                source_url = row[57] if len(row) > 57 else ""

                event_time = datetime.strptime(date_str, "%Y%m%d").replace(tzinfo=timezone.utc)
                severity = _goldstein_to_severity(goldstein)

                quad_label = _QUAD_CLASS_LABEL.get(str(quad_class), "Event")
                actors = " ↔ ".join(filter(None, [actor1[:30], actor2[:30]]))
                title = f"GDELT {quad_label}" + (f": {actors}" if actors else "")

                events.append(GeoEvent(
                    id=f"gdelt_{global_event_id}",
                    source_id=self.source_id,
                    category=self.category,
                    severity=severity,
                    title=title,
                    body=None,
                    lat=lat,
                    lng=lng,
                    event_time=event_time,
                    url=source_url or None,
                    metadata={
                        "goldstein_scale": goldstein,
                        "quad_class": quad_class,
                        "event_code": event_code,
                        "country": country,
                    },
                ))
            except Exception:
                continue

        return events
