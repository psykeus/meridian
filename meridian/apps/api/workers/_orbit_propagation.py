"""SGP4/SDP4 orbit propagation utilities for satellite workers.

Uses the sgp4 library to compute accurate sub-satellite positions from
Two-Line Element (TLE) data, replacing crude approximations.
"""

import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sgp4.api import Satrec, WGS72
from sgp4.earth_gravity import wgs72

logger = logging.getLogger(__name__)

# Earth radius in km (WGS-72 value used by SGP4)
_EARTH_RADIUS_KM = 6378.135


def tle_from_gp_json(gp: dict) -> tuple[str, str]:
    """Convert a CelesTrak GP JSON record to two TLE lines.

    CelesTrak GP JSON contains the same orbital elements as TLE but in a
    machine-readable format.  We reconstruct standard TLE lines so that
    the sgp4 library can ingest them.

    Returns (tle_line1, tle_line2).
    """
    norad_id = int(gp.get("NORAD_CAT_ID", 0))
    classification = gp.get("CLASSIFICATION_TYPE", "U")[0]
    intl_designator = gp.get("OBJECT_ID", "00000A").replace("-", "").strip()
    # Pad intl designator to 8 chars
    intl_designator = intl_designator.ljust(8)

    epoch_str = gp.get("EPOCH", "")
    # Parse epoch into TLE epoch format (YYddd.dddddddd)
    try:
        epoch_dt = datetime.fromisoformat(epoch_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        epoch_dt = datetime.now(timezone.utc)

    year_short = epoch_dt.year % 100
    jan1 = datetime(epoch_dt.year, 1, 1, tzinfo=timezone.utc)
    if epoch_dt.tzinfo is None:
        epoch_dt = epoch_dt.replace(tzinfo=timezone.utc)
    day_of_year = (epoch_dt - jan1).total_seconds() / 86400.0 + 1.0
    epoch_tle = f"{year_short:02d}{day_of_year:012.8f}"

    mean_motion_dot = float(gp.get("MEAN_MOTION_DOT", 0))
    mean_motion_ddot = float(gp.get("MEAN_MOTION_DDOT", 0))
    bstar = float(gp.get("BSTAR", 0))
    ephemeris_type = int(gp.get("EPHEMERIS_TYPE", 0))
    element_set_no = int(gp.get("ELEMENT_SET_NO", 999))
    rev_at_epoch = int(gp.get("REV_AT_EPOCH", 0))

    inclination = float(gp.get("INCLINATION", 0))
    raan = float(gp.get("RA_OF_ASC_NODE", 0))
    eccentricity = float(gp.get("ECCENTRICITY", 0))
    arg_of_pericenter = float(gp.get("ARG_OF_PERICENTER", 0))
    mean_anomaly = float(gp.get("MEAN_ANOMALY", 0))
    mean_motion = float(gp.get("MEAN_MOTION", 0))

    def _format_exp(value: float) -> str:
        """Format a float in TLE exponential notation: ±NNNNN±N"""
        if value == 0:
            return " 00000-0"
        sign = "-" if value < 0 else " "
        val = abs(value)
        exp = 0
        if val >= 1:
            while val >= 10:
                val /= 10
                exp += 1
        else:
            while val < 1:
                val *= 10
                exp -= 1
        mantissa = int(round(val * 10000))
        exp_sign = "+" if exp >= 0 else "-"
        return f"{sign}{mantissa:05d}{exp_sign}{abs(exp)}"

    # Line 1
    mm_dot_str = f"{mean_motion_dot:10.8f}".replace("0.", " .")
    if mean_motion_dot < 0:
        mm_dot_str = f"{mean_motion_dot:10.8f}".replace("-0.", "-.")
    mm_ddot_str = _format_exp(mean_motion_ddot)
    bstar_str = _format_exp(bstar)

    line1 = (
        f"1 {norad_id:05d}{classification} {intl_designator} {epoch_tle} "
        f"{mm_dot_str} {mm_ddot_str} {bstar_str} {ephemeris_type} {element_set_no:4d}"
    )
    # Pad/truncate to 68 chars (before checksum)
    line1 = line1[:68].ljust(68)
    cksum1 = _tle_checksum(line1)
    line1 = line1 + str(cksum1)

    # Line 2
    ecc_str = f"{eccentricity:.7f}"[2:]  # Remove "0." prefix
    line2 = (
        f"2 {norad_id:05d} {inclination:8.4f} {raan:8.4f} {ecc_str} "
        f"{arg_of_pericenter:8.4f} {mean_anomaly:8.4f} {mean_motion:11.8f}{rev_at_epoch:5d}"
    )
    line2 = line2[:68].ljust(68)
    cksum2 = _tle_checksum(line2)
    line2 = line2 + str(cksum2)

    return line1, line2


def _tle_checksum(line: str) -> int:
    """Compute the TLE mod-10 checksum for a line (first 68 chars)."""
    s = 0
    for ch in line[:68]:
        if ch.isdigit():
            s += int(ch)
        elif ch == "-":
            s += 1
    return s % 10


def propagate_tle(
    tle_line1: str,
    tle_line2: str,
    time: Optional[datetime] = None,
) -> Optional[tuple[float, float, float]]:
    """Propagate a TLE to a specific time using SGP4.

    Returns (lat, lng, alt_km) or None if propagation fails.
    """
    if time is None:
        time = datetime.now(timezone.utc)

    try:
        satellite = Satrec.twoline2rv(tle_line1, tle_line2)
    except Exception as e:
        logger.debug("Failed to parse TLE: %s", e)
        return None

    # Convert datetime to Julian date components
    jd, fr = _datetime_to_jd(time)

    e, r, v = satellite.sgp4(jd, fr)
    if e != 0:
        logger.debug("SGP4 propagation error code: %d", e)
        return None

    # Convert ECI position to geodetic (lat, lng, alt)
    return _eci_to_geodetic(r, time)


def compute_ground_track(
    tle_line1: str,
    tle_line2: str,
    minutes_back: int = 45,
    minutes_forward: int = 45,
    step_sec: int = 60,
    reference_time: Optional[datetime] = None,
) -> list[tuple[float, float]]:
    """Compute a ground track (list of lat/lng points) for a satellite.

    Returns a list of (lat, lng) tuples spanning from minutes_back before
    reference_time to minutes_forward after it.
    """
    if reference_time is None:
        reference_time = datetime.now(timezone.utc)

    try:
        satellite = Satrec.twoline2rv(tle_line1, tle_line2)
    except Exception:
        return []

    start = reference_time - timedelta(minutes=minutes_back)
    end = reference_time + timedelta(minutes=minutes_forward)

    track: list[tuple[float, float]] = []
    current = start
    step = timedelta(seconds=step_sec)

    while current <= end:
        jd, fr = _datetime_to_jd(current)
        e, r, v = satellite.sgp4(jd, fr)
        if e == 0:
            result = _eci_to_geodetic(r, current)
            if result:
                track.append((result[0], result[1]))
        current += step

    return track


def _datetime_to_jd(dt: datetime) -> tuple[float, float]:
    """Convert a datetime to Julian date (jd, fr) for sgp4."""
    year = dt.year
    month = dt.month
    day = dt.day
    hour = dt.hour
    minute = dt.minute
    second = dt.second + dt.microsecond / 1e6

    # Julian date calculation
    jd = (
        367.0 * year
        - int(7.0 * (year + int((month + 9.0) / 12.0)) / 4.0)
        + int(275.0 * month / 9.0)
        + day
        + 1721013.5
    )
    fr = (hour + minute / 60.0 + second / 3600.0) / 24.0

    return jd, fr


def _eci_to_geodetic(
    r: tuple[float, float, float],
    time: datetime,
) -> Optional[tuple[float, float, float]]:
    """Convert ECI (Earth-Centered Inertial) position to geodetic (lat, lng, alt_km).

    Uses the current GMST to rotate from ECI to ECEF frame.
    """
    x, y, z = r  # km in ECI frame

    # Compute GMST (Greenwich Mean Sidereal Time) in radians
    gmst = _compute_gmst(time)

    # Rotate ECI to ECEF
    cos_gmst = math.cos(gmst)
    sin_gmst = math.sin(gmst)
    x_ecef = x * cos_gmst + y * sin_gmst
    y_ecef = -x * sin_gmst + y * cos_gmst
    z_ecef = z

    # Geodetic conversion (simple spherical approximation, good enough for visualization)
    r_xy = math.sqrt(x_ecef**2 + y_ecef**2)
    if r_xy == 0 and z_ecef == 0:
        return None

    lat = math.degrees(math.atan2(z_ecef, r_xy))
    lng = math.degrees(math.atan2(y_ecef, x_ecef))
    alt_km = math.sqrt(x_ecef**2 + y_ecef**2 + z_ecef**2) - _EARTH_RADIUS_KM

    return lat, lng, alt_km


def _compute_gmst(dt: datetime) -> float:
    """Compute Greenwich Mean Sidereal Time in radians."""
    # Julian centuries from J2000.0
    jd, fr = _datetime_to_jd(dt)
    jd_total = jd + fr
    t_ut1 = (jd_total - 2451545.0) / 36525.0

    # GMST in seconds
    gmst_sec = (
        67310.54841
        + (876600 * 3600 + 8640184.812866) * t_ut1
        + 0.093104 * t_ut1**2
        - 6.2e-6 * t_ut1**3
    )

    # Convert to radians (mod 2pi)
    gmst_rad = (gmst_sec % 86400.0) / 86400.0 * 2.0 * math.pi
    if gmst_rad < 0:
        gmst_rad += 2.0 * math.pi

    return gmst_rad
