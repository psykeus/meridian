/**
 * Client-side SGP4 satellite propagation using satellite.js.
 * Used for smooth real-time position updates between server refreshes
 * and for computing ground tracks for orbital trail lines.
 */
import {
  twoline2satrec,
  propagate,
  eciToGeodetic,
  gstime,
  degreesLong,
  degreesLat,
} from "satellite.js";

export interface SatPosition {
  lat: number;
  lng: number;
  alt: number; // km
}

/**
 * Propagate a satellite to a specific time using SGP4/SDP4.
 * Returns null if propagation fails (bad TLE, epoch too stale, etc.)
 */
export function propagateSatellite(
  tleLine1: string,
  tleLine2: string,
  date?: Date
): SatPosition | null {
  if (!tleLine1 || !tleLine2) return null;

  try {
    const satrec = twoline2satrec(tleLine1, tleLine2);
    const time = date ?? new Date();
    const posVel = propagate(satrec, time);

    if (!posVel || !posVel.position || typeof posVel.position === "boolean") {
      return null;
    }

    const pos = posVel.position as { x: number; y: number; z: number };
    const gmst = gstime(time);
    const geo = eciToGeodetic(pos, gmst);

    return {
      lat: degreesLat(geo.latitude),
      lng: degreesLong(geo.longitude),
      alt: geo.height, // km
    };
  } catch {
    return null;
  }
}

/**
 * Compute a ground track (array of [lat, lng] points) over a time range.
 * Splits segments at antimeridian crossings to avoid MapLibre rendering artifacts.
 */
export function computeGroundTrack(
  tleLine1: string,
  tleLine2: string,
  minutesBack: number = 45,
  minutesForward: number = 45,
  stepSec: number = 60,
  referenceTime?: Date
): [number, number][][] {
  if (!tleLine1 || !tleLine2) return [];

  let satrec;
  try {
    satrec = twoline2satrec(tleLine1, tleLine2);
  } catch {
    return [];
  }

  const ref = referenceTime ?? new Date();
  const startMs = ref.getTime() - minutesBack * 60_000;
  const endMs = ref.getTime() + minutesForward * 60_000;
  const stepMs = stepSec * 1000;

  const segments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];
  let prevLng: number | null = null;

  for (let ms = startMs; ms <= endMs; ms += stepMs) {
    const t = new Date(ms);
    const posVel = propagate(satrec, t);

    if (!posVel || !posVel.position || typeof posVel.position === "boolean") {
      continue;
    }

    const pos = posVel.position as { x: number; y: number; z: number };
    const gmst = gstime(t);
    const geo = eciToGeodetic(pos, gmst);
    const lat = degreesLat(geo.latitude);
    const lng = degreesLong(geo.longitude);

    // Detect antimeridian crossing (longitude jump > 180 degrees)
    if (prevLng !== null && Math.abs(lng - prevLng) > 180) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }

    currentSegment.push([lat, lng]);
    prevLng = lng;
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

/** Source IDs that represent satellite data */
export const SATELLITE_SOURCE_IDS = new Set([
  "nasa_iss",
  "celestrak_sats",    // legacy alias
  "celestrak_tle",
  "starlink_constellation",
  "starlink_tracker",
  "gps_constellation",
  "spacetrack_sats",          // legacy alias
  "spacetrack_satellites",    // actual worker source_id
]);

/** Per-source-id satellite marker colors */
export const SATELLITE_COLORS: Record<string, string> = {
  nasa_iss: "#FFD700",              // gold
  celestrak_sats: "#00E5FF",        // cyan
  celestrak_tle: "#00E5FF",         // cyan
  starlink_constellation: "#B388FF", // purple
  starlink_tracker: "#B388FF",       // purple
  gps_constellation: "#69F0AE",     // green
  spacetrack_sats: "#FF8A65",       // orange
  spacetrack_satellites: "#FF8A65",  // orange
};

export function isSatelliteEvent(sourceId: string): boolean {
  return SATELLITE_SOURCE_IDS.has(sourceId);
}
