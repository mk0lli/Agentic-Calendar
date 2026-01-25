import datetime
import os.path
import sqlite3
import json

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Sets the scope for the API request (full read/write access to calendars)
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Paths for various files
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(SCRIPT_DIR, "calendar.db")
TOKEN_PATH = os.path.join(SCRIPT_DIR, "../special/token.json")
CREDENTIALS_PATH = os.path.join(SCRIPT_DIR, "../special/credentials.json")


# ------------------------
# Database helpers
# ------------------------

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Create events table if it doesn't exist
    # ID: Google event ID
    # Reccurance: RRULES for recurring events
    # Recurrence ID: ID of the parent recurring event
    # Original start: original start time prior to change
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            summary TEXT,
            description TEXT,
            location TEXT,
            start TEXT,
            end TEXT,
            created TEXT,
            updated TEXT,
            attendees TEXT
        )
        """
    )

    # Add new recurrence columns if they don't exist
    columns = [row[1] for row in c.execute("PRAGMA table_info(events)").fetchall()] # Returns events metadata
    # Add reccurrance, reccuring ID, original start columns if missing
    if "recurrence" not in columns:
        c.execute("ALTER TABLE events ADD COLUMN recurrence TEXT")
    if "recurring_event_id" not in columns:
        c.execute("ALTER TABLE events ADD COLUMN recurring_event_id TEXT")
    if "original_start" not in columns:
        c.execute("ALTER TABLE events ADD COLUMN original_start TEXT")

    # Create sync_state table for incremental sync
    # Sync token tracks from last successful sync, helping to fetch changes since last sync
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            id INTEGER PRIMARY KEY,
            sync_token TEXT
        )
        """
    )

    conn.commit()
    conn.close()

def update_event_in_db(event):
    """
    Update an existing event in DB, including recurring and exception fields.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    attendees = json.dumps(event.get("attendees", []))
    recurrence = json.dumps(event.get("recurrence", []))
    recurring_event_id = event.get("recurringEventId")
    original_start = None
    if "originalStartTime" in event:
        # Fetch date and time if possible (some events may not have them)
        original_start = event["originalStartTime"].get("dateTime", event["originalStartTime"].get("date"))

    # If event does not exist yet, insert it
    c.execute("SELECT 1 FROM events WHERE id=?", (event["id"],))
    if c.fetchone() is None:
        c.execute(
            """
            INSERT INTO events
            (id, summary, description, location, start, end, created, updated, attendees,
             recurrence, recurring_event_id, original_start)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["id"],
                event.get("summary"),
                event.get("description"),
                event.get("location"),
                event["start"].get("dateTime", event["start"].get("date")),
                event["end"].get("dateTime", event["end"].get("date")),
                event.get("created"),
                event.get("updated"),
                attendees,
                recurrence,
                recurring_event_id,
                original_start,
            )
        )
    else:
        # Update existing event
        c.execute(
            """
            UPDATE events SET
                summary = ?,
                description = ?,
                location = ?,
                start = ?,
                end = ?,
                updated = ?,
                attendees = ?,
                recurrence = ?,
                recurring_event_id = ?,
                original_start = ?
            WHERE id = ?
            """,
            (
                event.get("summary"),
                event.get("description"),
                event.get("location"),
                event["start"].get("dateTime", event["start"].get("date")),
                event["end"].get("dateTime", event["end"].get("date")),
                event.get("updated"),
                attendees,
                recurrence,
                recurring_event_id,
                original_start,
                event.get("id"),
            )
        )

    conn.commit()
    conn.close()


# ------------------------
# Google Calendar helpers
# ------------------------

def get_calendar_service():
    # No credentials loaded yet
    creds = None

    # Load credentials from file if they exist
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    # If no valid credentials, go through OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_PATH, SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, "w") as token:
            token.write(creds.to_json())

    return build("calendar", "v3", credentials=creds)


def update_google_event(event_id, changes):
    """
    changes example:
    {
        "summary": "New title",
        "description": "Updated description",
        "location": "Room 101"
    }
    """
    service = get_calendar_service()

    # Get current event by id
    event = service.events().get(
        calendarId="primary",
        eventId=event_id
    ).execute()

    # Apply changes
    for key, value in changes.items():
        event[key] = value

    updated_event = service.events().update(
        calendarId="primary",
        eventId=event_id,
        body=event
    ).execute()

    return updated_event


# ------------------------
# Public function used by webserver
# ------------------------

def modify_event(event_id, changes):
    """
    1. Update event in Google Calendar
    2. Update authoritative result in SQLite
    """

    # Update event in Google Calendar
    updated_google_event = update_google_event(event_id, changes)
    # Update in db
    update_event_in_db(updated_google_event)

    return updated_google_event

def create_google_event(event_data):
    service = get_calendar_service()

    event = {
        "summary": event_data.get("summary", ""),
        "description": event_data.get("description", ""),
        "location": event_data.get("location", ""),
        "start": {"dateTime": event_data["start"]},
        "end": {"dateTime": event_data["end"]},
    }

    # Include recurrence rules if provided
    if "recurrence" in event_data:
        event["recurrence"] = event_data["recurrence"]  # should be a list of RRULE strings

    created_event = service.events().insert(
        calendarId="primary",
        body=event
    ).execute()

    return created_event


def save_new_event_to_db(event):
    """
    Insert a new event into DB, handling recurring series and exceptions.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    attendees = json.dumps(event.get("attendees", []))
    recurrence = json.dumps(event.get("recurrence", []))  # list of RRULEs
    recurring_event_id = event.get("recurringEventId")    # parent series ID
    original_start = None
    if "originalStartTime" in event:
        original_start = event["originalStartTime"].get("dateTime", event["originalStartTime"].get("date"))

    c.execute(
        """
        INSERT OR REPLACE INTO events
        (id, summary, description, location, start, end, created, updated, attendees,
         recurrence, recurring_event_id, original_start)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event["id"],
            event.get("summary"),
            event.get("description"),
            event.get("location"),
            event["start"].get("dateTime", event["start"].get("date")),
            event["end"].get("dateTime", event["end"].get("date")),
            event.get("created"),
            event.get("updated"),
            attendees,
            recurrence,
            recurring_event_id,
            original_start,
        )
    )

    conn.commit()
    conn.close()



def create_event(event_data):
    """
    Create event in Google Calendar,
    then persist authoritative result to DB
    """
    google_event = create_google_event(event_data)
    save_new_event_to_db(google_event)
    return google_event


def delete_google_event(event_id):
    service = get_calendar_service()
    try:
        service.events().delete(
            calendarId="primary",
            eventId=event_id
        ).execute()
    except HttpError as error:
        # 410 means the event was already deleted in Google Calendar
        # 404 means the event doesn't exist
        # In both cases, we should still remove it from local DB
        if error.resp.status in (410, 404):
            print(f"Event {event_id} already deleted or not found in Google Calendar")
        else:
            raise


def delete_event(event_id):
    """
    Delete event from Google Calendar,
    then delete locally.
    Handles cases where event is already deleted in Google Calendar.
    """
    delete_google_event(event_id)

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()

def sync_google_events():
    """
    Synchronize events from Google Calendar to the local database.

    Performs incremental sync using nextSyncToken when available,
    or a full sync for initial synchronization. Handles recurring
    events, exceptions, and cancelled events correctly.

    Returns:
        None

    Raises:
        HttpError: If the Google Calendar API returns an error other
            than 410 GONE (expired sync token).
    """
    service = get_calendar_service()
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Get last sync token
    c.execute("SELECT sync_token FROM sync_state WHERE id=1")
    row = c.fetchone()
    sync_token = row[0] if row else None

    try:
        if sync_token:
            events_result = service.events().list(
                calendarId="primary",
                singleEvents=True,
                orderBy="startTime",
                syncToken=sync_token
            ).execute()
        else:
            # Full initial sync - get all events from now onwards
            now = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
            events_result = service.events().list(
                calendarId="primary",
                singleEvents=True,
                orderBy="startTime",
                timeMin=now
            ).execute()

            # For a full sync, we should also verify local events still exist in Google
            # Get all local event IDs
            c.execute("SELECT id FROM events")
            local_event_ids = set(row[0] for row in c.fetchall())

            # Get all Google event IDs from the response
            google_event_ids = set(event["id"] for event in events_result.get("items", []))

            # Events in local DB but not in Google (deleted remotely)
            orphaned_ids = local_event_ids - google_event_ids
            for orphan_id in orphaned_ids:
                # Verify the event is truly deleted by checking Google Calendar
                try:
                    service.events().get(calendarId="primary", eventId=orphan_id).execute()
                except HttpError as e:
                    if e.resp.status in (404, 410):
                        # Event doesn't exist in Google, delete locally
                        print(f"Removing orphaned event {orphan_id} from local DB")
                        c.execute("DELETE FROM events WHERE id=?", (orphan_id,))

        # Retrieve list of events from API response
        events = events_result.get("items", [])

        for event in events:
            event_id = event["id"]

            # If event is cancelled, delete it from DB
            if event.get("status") == "cancelled":
                c.execute("DELETE FROM events WHERE id=?", (event_id,))
            # Insert event if it doesn't exist yet
            else:
                update_event_in_db(event)

        # Save new sync token
        next_sync_token = events_result.get("nextSyncToken")
        if next_sync_token:
            c.execute(
                "INSERT OR REPLACE INTO sync_state (id, sync_token) VALUES (1, ?)",
                (next_sync_token,)
            )
            conn.commit()

    # API returns 410 GONE if sync token expired
    except HttpError as error:
        if error.resp.status == 410:
            # Sync token expired, must do full sync
            print("Sync token expired, doing full sync...")
            c.execute("DELETE FROM sync_state WHERE id=1")
            conn.commit()
            conn.close()
            sync_google_events()  # Retry full sync
            return
        else:
            raise
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
    sync_google_events()
    print("Sync complete")

