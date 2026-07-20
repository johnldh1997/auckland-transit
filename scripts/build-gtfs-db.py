#!/usr/bin/env python3
"""
One-time build step (not part of the app runtime): reads AT's static GTFS zip and
produces a compact, indexed SQLite database bundled into the app as assets/gtfs.db.

AT's REST API has no stop_times/shapes endpoints (confirmed 404 live), so this is the
only way to get scheduled departure times and route path geometry — both come from the
static GTFS feed instead. Run manually whenever a fresh gtfs.zip is downloaded from AT's
developer portal; the app itself never downloads or parses GTFS, only queries this
pre-built database via expo-sqlite.

Route short names, headsigns, and service_ids repeat across hundreds of thousands of
stop_times rows, so they're stored once each in small lookup tables and referenced by
integer id — this is most of the size difference vs. a naive one-table-per-CSV dump.
Times are packed as seconds-since-midnight and shape coordinates as micro-degree
integers (1e6 scale, ~11cm precision) rather than text/floats, for the same reason.

Usage: python scripts/build-gtfs-db.py <path-to-gtfs.zip> [output-db-path]
"""
import csv
import io
import sqlite3
import sys
import zipfile
from pathlib import Path

DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "gtfs.db"


def read_csv(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig")
        yield from csv.DictReader(text)


def time_to_seconds(value: str) -> int:
    # GTFS times can exceed 24:00:00 for trips that run past midnight — kept as-is
    # (not modded), so a stop_times query can compare directly against "now + 24h"
    # for yesterday's still-running services.
    h, m, s = value.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def build(zip_path: Path, output_path: Path):
    if output_path.exists():
        output_path.unlink()

    conn = sqlite3.connect(str(output_path))
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE trips (
            id INTEGER PRIMARY KEY,
            trip_id TEXT UNIQUE NOT NULL
        );
        CREATE TABLE routes (
            id INTEGER PRIMARY KEY,
            short_name TEXT,
            route_type INTEGER
        );
        CREATE TABLE headsigns (
            id INTEGER PRIMARY KEY,
            text TEXT UNIQUE NOT NULL
        );
        CREATE TABLE services (
            id INTEGER PRIMARY KEY,
            service_id TEXT UNIQUE NOT NULL,
            monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER,
            friday INTEGER, saturday INTEGER, sunday INTEGER,
            start_date TEXT, end_date TEXT
        );
        CREATE TABLE calendar_dates (
            service_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            exception_type INTEGER NOT NULL
        );
        CREATE TABLE stops (
            id INTEGER PRIMARY KEY,
            stop_id TEXT UNIQUE NOT NULL
        );
        CREATE TABLE departures (
            stop_id INTEGER NOT NULL,
            trip_id INTEGER NOT NULL,
            route_id INTEGER,
            headsign_id INTEGER,
            departure_seconds INTEGER NOT NULL,
            service_id INTEGER NOT NULL
        );
        CREATE TABLE trip_shapes (
            trip_id INTEGER PRIMARY KEY,
            shape_id INTEGER NOT NULL
        );
        CREATE TABLE feed_info (
            feed_start_date TEXT,
            feed_end_date TEXT,
            feed_version TEXT
        );
        CREATE TABLE shapes (
            shape_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            lat INTEGER NOT NULL,
            lon INTEGER NOT NULL
        );
        """
    )

    with zipfile.ZipFile(zip_path) as zf:
        print("Reading feed_info.txt...")
        feed_info = next(iter(read_csv(zf, "feed_info.txt")), None)
        if feed_info:
            cur.execute(
                "INSERT INTO feed_info VALUES (?, ?, ?)",
                (feed_info.get("feed_start_date", ""), feed_info.get("feed_end_date", ""), feed_info.get("feed_version", "")),
            )
            print(f"  feed valid {feed_info.get('feed_start_date')} - {feed_info.get('feed_end_date')}")

        print("Reading routes.txt...")
        route_ids: dict[str, int] = {}
        for r in read_csv(zf, "routes.txt"):
            route_ids[r["route_id"]] = len(route_ids) + 1
        cur.executemany(
            "INSERT INTO routes VALUES (?, ?, ?)",
            [
                (route_ids[r["route_id"]], r["route_short_name"], int(r["route_type"]))
                for r in read_csv(zf, "routes.txt")
            ],
        )

        print("Reading calendar.txt / calendar_dates.txt...")
        service_ids: dict[str, int] = {}
        calendar_rows = []
        for c in read_csv(zf, "calendar.txt"):
            service_ids[c["service_id"]] = len(service_ids) + 1
            calendar_rows.append(
                (
                    service_ids[c["service_id"]],
                    c["service_id"],
                    int(c["monday"]), int(c["tuesday"]), int(c["wednesday"]), int(c["thursday"]),
                    int(c["friday"]), int(c["saturday"]), int(c["sunday"]),
                    c["start_date"], c["end_date"],
                )
            )
        cur.executemany("INSERT INTO services VALUES (?,?,?,?,?,?,?,?,?,?,?)", calendar_rows)

        cal_date_rows = []
        for d in read_csv(zf, "calendar_dates.txt"):
            if d["service_id"] not in service_ids:
                service_ids[d["service_id"]] = len(service_ids) + 1
                cur.execute(
                    "INSERT INTO services (id, service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date) VALUES (?,?,0,0,0,0,0,0,0,'','')",
                    (service_ids[d["service_id"]], d["service_id"]),
                )
            cal_date_rows.append((service_ids[d["service_id"]], d["date"], int(d["exception_type"])))
        cur.executemany("INSERT INTO calendar_dates VALUES (?, ?, ?)", cal_date_rows)
        print(f"  {len(calendar_rows)} services, {len(cal_date_rows)} calendar_dates rows")

        print("Reading trips.txt...")
        trip_ids: dict[str, int] = {}
        trip_route: dict[str, str] = {}
        trip_service: dict[str, str] = {}
        trip_headsign: dict[str, str] = {}
        trip_shape_rows = []
        headsign_ids: dict[str, int] = {}
        for t in read_csv(zf, "trips.txt"):
            trip_ids[t["trip_id"]] = len(trip_ids) + 1
            trip_route[t["trip_id"]] = t["route_id"]
            trip_service[t["trip_id"]] = t["service_id"]
            trip_headsign[t["trip_id"]] = t.get("trip_headsign", "")
            if t.get("shape_id"):
                trip_shape_rows.append((t["trip_id"], t["shape_id"]))
        cur.executemany("INSERT INTO trips VALUES (?, ?)", [(v, k) for k, v in trip_ids.items()])
        print(f"  {len(trip_ids)} trips")

        print("Reading shapes.txt...")
        shape_ids: dict[str, int] = {}
        batch = []
        total = 0
        for row in read_csv(zf, "shapes.txt"):
            sid = row["shape_id"]
            if sid not in shape_ids:
                shape_ids[sid] = len(shape_ids) + 1
            batch.append(
                (
                    shape_ids[sid],
                    int(row["shape_pt_sequence"]),
                    round(float(row["shape_pt_lat"]) * 1_000_000),
                    round(float(row["shape_pt_lon"]) * 1_000_000),
                )
            )
            total += 1
            if len(batch) >= 50_000:
                cur.executemany("INSERT INTO shapes VALUES (?,?,?,?)", batch)
                batch.clear()
        if batch:
            cur.executemany("INSERT INTO shapes VALUES (?,?,?,?)", batch)
        print(f"  {total} shape points, {len(shape_ids)} distinct shapes")

        cur.executemany(
            "INSERT INTO trip_shapes VALUES (?, ?)",
            [(trip_ids[trip_id], shape_ids[shape_id]) for trip_id, shape_id in trip_shape_rows if shape_id in shape_ids],
        )

        print("Reading stop_times.txt (this is the big one)...")
        stop_ids: dict[str, int] = {}
        batch = []
        total = 0
        missing_trip = 0
        for row in read_csv(zf, "stop_times.txt"):
            trip_id = row["trip_id"]
            if trip_id not in trip_ids:
                missing_trip += 1
                continue
            stop_id = row["stop_id"]
            if stop_id not in stop_ids:
                stop_ids[stop_id] = len(stop_ids) + 1
            route_id = route_ids.get(trip_route.get(trip_id, ""))
            service_id = service_ids.get(trip_service.get(trip_id, ""))
            headsign_text = row.get("stop_headsign") or trip_headsign.get(trip_id, "")
            headsign_id = None
            if headsign_text:
                headsign_id = headsign_ids.get(headsign_text)
                if headsign_id is None:
                    headsign_id = len(headsign_ids) + 1
                    headsign_ids[headsign_text] = headsign_id
            batch.append(
                (
                    stop_ids[stop_id],
                    trip_ids[trip_id],
                    route_id,
                    headsign_id,
                    time_to_seconds(row["departure_time"]),
                    service_id,
                )
            )
            total += 1
            if len(batch) >= 50_000:
                cur.executemany("INSERT INTO departures VALUES (?,?,?,?,?,?)", batch)
                batch.clear()
                print(f"  {total} rows...")
        if batch:
            cur.executemany("INSERT INTO departures VALUES (?,?,?,?,?,?)", batch)
        cur.executemany("INSERT INTO headsigns VALUES (?, ?)", [(v, k) for k, v in headsign_ids.items()])
        cur.executemany("INSERT INTO stops VALUES (?, ?)", [(v, k) for k, v in stop_ids.items()])
        print(f"  {total} stop_times rows inserted ({missing_trip} skipped, no matching trip)")
        print(f"  {len(headsign_ids)} distinct headsigns, {len(stop_ids)} distinct stops")

    print("Building indices...")
    cur.executescript(
        """
        CREATE INDEX idx_departures_stop ON departures(stop_id);
        CREATE INDEX idx_calendar_dates_lookup ON calendar_dates(date, service_id);
        CREATE INDEX idx_shapes_shape ON shapes(shape_id, seq);
        CREATE INDEX idx_trip_shapes ON trip_shapes(trip_id);
        """
    )
    conn.commit()
    print("Vacuuming...")
    conn.execute("VACUUM")
    conn.close()

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Done: {output_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python build-gtfs-db.py <path-to-gtfs.zip> [output-db-path]")
        sys.exit(1)
    zip_arg = Path(sys.argv[1]).expanduser()
    out_arg = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else DEFAULT_OUTPUT
    out_arg.parent.mkdir(parents=True, exist_ok=True)
    build(zip_arg, out_arg)
