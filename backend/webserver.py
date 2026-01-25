from backend.mcp.openrouter_backend import OpenRouterBackend
from flask_cors import CORS
import sqlite3
import json
from dotenv import load_dotenv
from Events.event_updator import (
    modify_event,
    create_event,
    delete_event,
    sync_google_events,
    init_db
)
# MCP imports
from mcp.agent import Agent
from mcp.tools import (
    list_events_tool,
    create_event_tool,
    update_event_tool,
    delete_event_tool,
    sync_events_tool,
    resolve_relative_time_tool
)
from flask import Flask, jsonify, request, session, redirect
import os

app = Flask(__name__)
CORS(app)
load_dotenv()

# Initialize database
init_db()

# Get the correct database path from event_updator
from Events import event_updator
DATABASE = event_updator.DB_FILE


def get_db():
    """Create and return a database connection.

    Establishes a connection to the SQLite database with Row factory
    enabled for dictionary-like row access.

    Returns:
        sqlite3.Connection: A connection object to the calendar database
        with row_factory set to sqlite3.Row.
    """
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


# ------------------------
# READ EVENTS
# ------------------------

# Return all events in database
@app.route('/api/events', methods=['GET'])
def get_events():
    """Retrieve all calendar events from the database.

    Fetches all events stored in the local database and formats them
    for the frontend, parsing JSON fields for attendees and recurrence.

    Returns:
        JSON response containing a list of event objects, each with:
        id, title, start, end, description, location, attendees,
        recurrence, recurring_event_id, original_start, created, and updated.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events")
    rows = cursor.fetchall()
    conn.close()

    events = []
    for row in rows:
        attendees = []
        if row['attendees']:
            try:
                attendees = json.loads(row['attendees'])
            except json.JSONDecodeError:
                pass

        recurrence = []
        if row['recurrence']:
            try:
                recurrence = json.loads(row['recurrence'])
            except json.JSONDecodeError:
                pass

        events.append({
            'id': row['id'],
            'title': row['summary'],
            'start': row['start'],
            'end': row['end'],
            'description': row['description'] or '',
            'location': row['location'] or '',
            'attendees': attendees,
            'recurrence': recurrence,
            'recurring_event_id': row['recurring_event_id'],
            'original_start': row['original_start'],
            'created': row['created'],
            'updated': row['updated'],
        })

    return jsonify(events)


# ------------------------
# CREATE EVENT
# ------------------------
@app.route('/api/events', methods=['POST'])
def create_event_api():
    """Create a new calendar event.

    Receives event data from the frontend, creates the event in
    Google Calendar, and returns the created event details.

    Returns:
        JSON response with status 201 containing the created event details:
        id, title, start, end, description, location, recurrence,
        recurring_event_id, original_start, attendees, created, and updated.

    Raises:
        500: If the event creation fails, returns error message.
    """
    data = request.json

    payload = {
        "summary": data.get("title", ""),
        "description": data.get("description", ""),
        "location": data.get("location", ""),
        "start": data["start"],
        "end": data["end"],
    }

    if "recurrence" in data and data["recurrence"]:
        payload["recurrence"] = data["recurrence"]

    try:
        event = create_event(payload)

        recurrence = event.get("recurrence", [])

        return jsonify({
            "id": event["id"],
            "title": event.get("summary", ""),
            "start": event["start"].get("dateTime", event["start"].get("date")),
            "end": event["end"].get("dateTime", event["end"].get("date")),
            "description": event.get("description", ""),
            "location": event.get("location", ""),
            "recurrence": recurrence,
            "recurring_event_id": event.get("recurringEventId"),
            "original_start": None,
            "attendees": event.get("attendees", []),
            "created": event.get("created"),
            "updated": event.get("updated"),
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------
# UPDATE EVENT
# ------------------------
@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event(event_id):
    """Update an existing calendar event.

    Receives changes from the frontend, updates Google Calendar,
    and syncs the database with the authoritative response.

    Args:
        event_id: The unique identifier of the event to update.

    Returns:
        JSON response containing the updated event details including
        id, title, start, end, description, location, recurrence,
        recurring_event_id, original_start, attendees, created, and updated.

    Raises:
        500: If the update operation fails, returns error message.
    """
    data = request.json

    changes = {}
    if 'title' in data:
        changes['summary'] = data['title']
    if 'description' in data:
        changes['description'] = data['description']
    if 'location' in data:
        changes['location'] = data['location']
    if 'start' in data:
        changes['start'] = {'dateTime': data['start']}
    if 'end' in data:
        changes['end'] = {'dateTime': data['end']}

    try:
        updated_event = modify_event(event_id, changes)
        recurrence = updated_event.get("recurrence", [])

        return jsonify({
            'id': updated_event['id'],
            'title': updated_event.get('summary', ''),
            'start': updated_event['start'].get('dateTime', updated_event['start'].get('date')),
            'end': updated_event['end'].get('dateTime', updated_event['end'].get('date')),
            'description': updated_event.get('description', ''),
            'location': updated_event.get('location', ''),
            'recurrence': recurrence,
            'recurring_event_id': updated_event.get('recurringEventId'),
            'original_start': updated_event.get('originalStartTime', {}).get('dateTime') or updated_event.get('originalStartTime', {}).get('date'),
            'attendees': updated_event.get('attendees', []),
            'created': updated_event.get('created'),
            'updated': updated_event.get('updated'),
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ------------------------
# DELETE EVENT
# ------------------------
@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event_api(event_id):
    """Delete a calendar event.

    Removes an event from Google Calendar and the local database.

    Args:
        event_id: The unique identifier of the event to delete.

    Returns:
        JSON response containing success status (True if deleted).

    Raises:
        500: If the deletion fails, returns error message.
    """
    try:
        delete_event(event_id)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ------------------------
# SYNC EVENTS
# ------------------------
@app.route('/api/sync', methods=['POST'])
def sync_events_api():
    """Trigger incremental sync with Google Calendar.

    Synchronizes the local database with Google Calendar and
    returns the updated events list after sync completion.

    Returns:
        JSON response containing:
        - success: Boolean indicating sync status.
        - events: List of all events after sync.
        - message: Status message describing the result.

    Raises:
        500: If the sync operation fails, returns error details.
    """
    try:
        sync_google_events()

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM events")
        rows = cursor.fetchall()
        conn.close()

        events = []
        for row in rows:
            attendees = []
            if row['attendees']:
                try:
                    attendees = json.loads(row['attendees'])
                except json.JSONDecodeError:
                    pass

            recurrence = []
            if row['recurrence']:
                try:
                    recurrence = json.loads(row['recurrence'])
                except json.JSONDecodeError:
                    pass

            events.append({
                'id': row['id'],
                'title': row['summary'],
                'start': row['start'],
                'end': row['end'],
                'description': row['description'] or '',
                'location': row['location'] or '',
                'attendees': attendees,
                'recurrence': recurrence,
                'recurring_event_id': row['recurring_event_id'],
                'original_start': row['original_start'],
                'created': row['created'],
                'updated': row['updated'],
            })

        return jsonify({
            "success": True,
            "events": events,
            "message": "Sync completed successfully"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "Sync failed"
        }), 500


# ------------------------
# MCP agent initialization
# ------------------------
tools = [
    list_events_tool,
    create_event_tool,
    update_event_tool,
    delete_event_tool,
    sync_events_tool,
    resolve_relative_time_tool
]

#gemini_key = os.getenv("GEMINI_API_KEY")
#
#backend = GeminiBackend(
#    api_key=gemini_key,
#    model_name="gemini-2.5-flash",
#    tools = tools
#)

# Pick Xiaomi MIMO free model
openrouter_model = "xiaomi/mimo-v2-flash:free"

backend = OpenRouterBackend(
    model_name=openrouter_model,
    tools=tools
)

# System prompt for MIMO to ensure tool usage
backend.conversation_history.append({
    "role": "system",
    "content": (
        "You are a smart calendar assistant. "
        "Whenever the user mentions a date or time in natural language (like 'tomorrow at 3pm'), "
        "always call the tool `resolve_relative_time` with the text exactly as the user provided. "
        "After executing any tool, respond to the user in a friendly and readable way describing what you did. "
        "Never leave your response empty."
    )
})

# Create the MCP agent
mcp_agent = Agent(
    name="CalendarAgent",
    description="An agent to manage Google Calendar events via MCP",
    backend=backend,
    tools=tools
)




# ------------------------
# MCP agent message handler
# ------------------------
@app.route('/api/mcp', methods=['POST'])
def handle_mcp_message():
    data = request.json
    user_message = data.get("message", "")
    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    try:
        response = mcp_agent.run(user_message)
        return jsonify({"response": response})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Starting MCP server on http://localhost:5001")
    app.run(debug=True, port=5001)
