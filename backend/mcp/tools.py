import sys
import os
from dataclasses import dataclass
from typing import Dict, Any, Callable
from datetime import datetime, timedelta
import dateparser
from tzlocal import get_localzone

# Add the backend directory to path for proper imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@dataclass
class Tool:
    """A simple Tool class for MCP-style tools with handlers."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable[[Dict[str, Any]], Any]


# Read helpers
from Events.event_reader import list_events_from_db

# Write helpers
from Events.event_updator import create_event, modify_event, delete_event, sync_google_events

list_events_tool = Tool(
    name="list_events",
    description="List all calendar events from the local database",
    input_schema={
        "type": "object",
        "properties": {}
    },
    handler=lambda _: list_events_from_db()
)
create_event_tool = Tool(
    name="create_event",
    description="Create a new calendar event",
    input_schema={
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "description": {"type": "string"},
            "location": {"type": "string"},
            "start": {"type": "string"},
            "end": {"type": "string"},
            "recurrence": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["title", "start", "end"]
    },
    handler=lambda args: create_event({
        "summary": args.get("title", ""),
        "description": args.get("description", ""),
        "location": args.get("location", ""),
        "start": args["start"],
        "end": args["end"],
        "recurrence": args.get("recurrence")
    })
)
update_event_tool = Tool(
    name="update_event",
    description="Update an existing calendar event by ID",
    input_schema={
        "type": "object",
        "properties": {
            "event_id": {"type": "string"},
            "changes": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "location": {"type": "string"},
                    "start": {"type": "string"},
                    "end": {"type": "string"}
                }
            }
        },
        "required": ["event_id", "changes"]
    },
    handler=lambda args: modify_event(
        args["event_id"],
        {
            **({"summary": args["changes"]["title"]} if "title" in args["changes"] else {}),
            **({"description": args["changes"]["description"]} if "description" in args["changes"] else {}),
            **({"location": args["changes"]["location"]} if "location" in args["changes"] else {}),
            **({"start": {"dateTime": args["changes"]["start"]}} if "start" in args["changes"] else {}),
            **({"end": {"dateTime": args["changes"]["end"]}} if "end" in args["changes"] else {}),
        }
    )
)
delete_event_tool = Tool(
    name="delete_event",
    description="Delete a calendar event by ID",
    input_schema={
        "type": "object",
        "properties": {
            "event_id": {"type": "string"}
        },
        "required": ["event_id"]
    },
    handler=lambda args: {"success": delete_event(args["event_id"])}
)
sync_events_tool = Tool(
    name="sync_events",
    description="Synchronize local database with Google Calendar",
    input_schema={
        "type": "object",
        "properties": {}
    },
    handler=lambda _: {"success": sync_google_events()}
)

from datetime import datetime, timedelta
from tzlocal import get_localzone
import dateparser

def resolve_relative_time_handler(args):
    """
    Resolves natural language expressions like:
      - "tomorrow at 3pm"
      - "next Monday 10am"
    into ISO start and end timestamps.

    Automatically uses the current date/time as reference.
    """
    text = args.get("text", "")
    local_tz = get_localzone()

    # Use current datetime as reference for "today"/"tomorrow"
    now = datetime.now(local_tz)

    dt = dateparser.parse(
        text,
        settings={
            "RELATIVE_BASE": now,   # <-- important!
            "TIMEZONE": str(local_tz),
            "RETURN_AS_TIMEZONE_AWARE": True,
            "PREFER_DATES_FROM": "future"
        }
    )
    if not dt:
        return {"error": f"Could not parse datetime from '{text}'"}

    start_iso = dt.isoformat()
    end_iso = (dt + timedelta(hours=1)).isoformat()  # default 1-hour meeting
    return {"start": start_iso, "end": end_iso}

resolve_relative_time_tool = Tool(
    name="resolve_relative_time",
    description="Given a natural language time expression, return start and end timestamps in ISO format (assumes 1 hour duration) so the agent an schedule events.",
    input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
    handler=resolve_relative_time_handler
)
