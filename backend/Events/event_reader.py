import sqlite3
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(SCRIPT_DIR, "calendar.db")

def list_events_from_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM events")
    rows = c.fetchall()
    conn.close()

    events = []
    for row in rows:
        events.append({
            "id": row["id"],
            "title": row["summary"],
            "start": row["start"],
            "end": row["end"],
            "description": row["description"] or "",
            "location": row["location"] or "",
            "recurring_event_id": row["recurring_event_id"],
            "original_start": row["original_start"],
        })

    return events
