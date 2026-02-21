# Agentic Calendar

An AI-powered calendar management system that combines a local calendar database with Google Calendar synchronization, powered by an intelligent agent using Model Context Protocol (MCP) for natural language event management. The agent relies on credentials from OpenRouter, allowing the agent to be modified to user needs.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Technical Architecture](#technical-architecture)
- [API Reference](#api-reference)
- [Development](#development)

## Overview

Agentic Calendar is a full-stack application that enables users to manage their calendar events through a modern web interface and an intelligent AI agent. The system integrates with Google Calendar for synchronization while maintaining a local SQLite database for offline access and fast queries.

**Key Technologies:**
- **Frontend:** React with Vite, TypeScript, Material-UI, FullCalendar
- **Backend:** Python Flask with MCP (Model Context Protocol)
- **AI Agent:** OpenRouter-powered LLM with structured tool calling
- **Database:** SQLite for local event storage
- **Google Integration:** Google Calendar API for sync and management

## Features

- 📅 **Full Calendar Management** - Create, read, update, and delete calendar events
- 🤖 **AI Agent** - Natural language event scheduling through conversational interface
- 🔄 **Google Calendar Sync** - Two-way synchronization with Google Calendar
- 💾 **Local Database** - SQLite backend for offline access and fast queries
- 🔐 **OAuth2 Authentication** - Secure Google account integration via API
- ⏰ **Recurring Events** - Full support for recurring event management
- 🌐 **Responsive UI** - Modern React-based interface with real-time updates
- 🛠️ **MCP Integration** - Standard tool interface for AI agent operations

## Project Structure

```
Agentic-Calendar/
├── backend/                          # Python Flask backend
│   ├── webserver.py                 # Main Flask application
│   ├── mcp/                         # Model Context Protocol integration
│   │   ├── agent.py                 # MCP Agent class
│   │   ├── server.py                # MCP server setup
│   │   ├── tools.py                 # Tool definitions for the agent
│   │   └── openrouter_backend.py    # OpenRouter LLM integration
│   ├── Events/                      # Event management
│   │   ├── event_reader.py          # Read events from database
│   │   ├── event_updator.py         # Create/update/delete events, Google sync
│   │   └── calendar.db              # SQLite database
│   └── special/                     # Authentication
│       ├── auth.py                  # OAuth2 flow setup
│       ├── credentials.json         # Google OAuth credentials
│       └── token.json               # OAuth access token
├── vite-project/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── calendar/            # Calendar display & event dialogs
│   │   │   └── chat/                # AI chat interface
│   │   ├── api/                     # Frontend API client
│   │   ├── types/                   # TypeScript type definitions
│   │   └── App.tsx                  # Root component
│   └── package.json                 # Frontend dependencies
├── requirements.txt                 # Python dependencies
└── README.md                        # This file
```

## Getting Started

### Prerequisites

- **Python 3.8+** - For backend
- **Node.js 16+** - For frontend
- **Google Account** - For Calendar API integration
- **OpenRouter API Key** - For AI agent (https://openrouter.ai)

### Installation

#### 1. Backend Setup

```bash
# Navigate to project root
cd /Users/name/PycharmProjects/Agentic-Calendar

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### 2. Frontend Setup

```bash
cd vite-project

# Install dependencies
npm install
```

#### 3. Google OAuth Configuration

Follow these steps to set up Google Calendar API authentication:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing one)
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials:
   - Application type: Desktop application
   - Download credentials as JSON
5. Save the credentials file to `backend/special/credentials.json`

### Configuration

#### Environment Variables

Create a `.env` file in the project root:

```bash
# OpenRouter API Key (required for AI agent)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: Specify the LLM model (default: openrouter/meta-llama/llama-2-7b-chat)
LLM_MODEL=openrouter/meta-llama/llama-2-7b-chat
```

#### Initial Google OAuth Token

The first time you run the application, you need to authorize it with Google:

```bash
python backend/special/auth.py
```

This will start a local server and open Google's authorization page. After authorizing, a `token.json` file will be created automatically in `backend/special/`.

## Usage

### Starting the Application

#### 1. Start Backend Server

```bash
python -m backend.webserver
```

The backend will start on `http://localhost:5001`

#### 2. Start Frontend Development Server

In another terminal:

```bash
cd vite-project
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Using the Calendar

1. **View Events** - Calendar displays all events from the local database
2. **Create Events** - Click on calendar dates or use the event creation dialog
3. **AI Agent** - Use the chat interface to schedule events naturally (e.g., "Schedule a meeting tomorrow at 3pm")
4. **Sync with Google** - Events are automatically synced with your Google Calendar

## Technical Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React)                       │
│         Calendar.tsx | EventDialog.tsx | AIChat.tsx         │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Flask)                           │
│                   webserver.py (port 5001)                  │
└──────────────┬──────────────────────┬──────────────────────┘
               │                      │
        ┌──────▼──────┐       ┌──────▼──────┐
        │ MCP Agent   │       │  Event Mgmt │
        │ Framework   │       │  (DB CRUD)  │
        └──────┬──────┘       └──────┬──────┘
               │                      │
        ┌──────▼──────────┐  ┌──────▼──────────┐
        │  OpenRouter LLM  │  │   Google Calen  │
        │  (AI Agent)      │  │   dar API       │
        └─────────────────┘  └─────────────────┘
               │                      │
               └──────────────┬───────┘
                              │
                    ┌─────────▼────────┐
                    │  SQLite Database │
                    │  (calendar.db)   │
                    └──────────────────┘
```

### MCP (Model Context Protocol) Integration

The Model Context Protocol enables the AI agent to interact with calendar operations through a standardized tool interface.

#### MCP Components

**Agent (`backend/mcp/agent.py`)**
- Lightweight orchestrator that manages:
  - User messages and conversation history
  - Tool execution and validation
  - LLM backend integration
- Implements the MCP Agent specification with validation of tool requirements

**Tools (`backend/mcp/tools.py`)**
- Defines 6 primary tools for calendar operations:

| Tool Name | Purpose | Input |
|-----------|---------|-------|
| `list_events` | Fetch all events from database | None |
| `create_event` | Create a new calendar event | title, start, end, description, location, recurrence |
| `update_event` | Modify an existing event | event_id, changes object |
| `delete_event` | Remove an event | event_id |
| `sync_events` | Sync with Google Calendar | None |
| `resolve_relative_time` | Parse natural language times | text (e.g., "tomorrow at 3pm") |

**OpenRouter Backend (`backend/mcp/openrouter_backend.py`)**
- Manages LLM interactions through OpenRouter API
- Implements tool calling with structured output parsing
- Maintains conversation history for context
- Features:
  - Automatic XML-formatted tool call parsing
  - Error handling and retry logic
  - Support for multiple LLM models

### Local Database (SQLite)

#### Database Schema

**events table:**
```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,                -- Google event ID
    summary TEXT,                       -- Event title
    description TEXT,                   -- Event description
    location TEXT,                      -- Event location
    start TEXT,                         -- Start time (ISO format)
    end TEXT,                          -- End time (ISO format)
    created TEXT,                      -- Creation timestamp
    updated TEXT,                      -- Last update timestamp
    attendees TEXT,                    -- JSON array of attendees
    recurrence TEXT,                   -- JSON array of RRULE strings
    recurring_event_id TEXT,           -- ID of parent recurring event
    original_start TEXT                -- Original start time for exceptions
)
```

**sync_state table:**
```sql
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY,
    sync_token TEXT                    -- Token for incremental Google sync
)
```

#### Key Features

- **Offline Access** - All events cached locally for fast queries
- **Recurrence Support** - Full handling of recurring events and exceptions
- **Incremental Sync** - Sync token tracks last successful sync for efficiency
- **Atomic Operations** - Transaction support for data consistency

### Google Calendar API Integration

#### Authentication Flow

1. **OAuth 2.0 Authorization** (`backend/special/auth.py`)
   - Uses InstalledAppFlow for desktop applications
   - Requests calendar read/write scope
   - Stores refresh token locally for future API calls

2. **Credential Management** (`backend/Events/event_updator.py`)
   - Automatic token refresh on expiration
   - Fallback to re-authentication if needed

#### Sync Operations

**Bidirectional Sync (`sync_google_events`):**

```
Local Changes → Google Calendar
    ↓
Google Changes → Local Database
```

Process:
1. Fetch changes from Google Calendar using sync token
2. Update local database with remote changes
3. Handle conflict resolution (Google Calendar is authoritative)
4. Update sync token for next incremental sync

**Event Operations:**
- **Create** - New events in local DB are pushed to Google Calendar
- **Update** - Local modifications sync to Google Calendar
- **Delete** - Local deletions remove events from Google Calendar
- **Recurring Events** - Full support for RRULE parsing and exceptions

### Data Flow

#### Creating an Event via AI Agent

```
User: "Schedule meeting tomorrow at 3pm"
    ↓
Frontend sends to AI Chat API
    ↓
OpenRouter Backend processes with tools
    ↓
Tool: resolve_relative_time → converts to ISO timestamps
    ↓
Tool: create_event → saves to SQLite
    ↓
Tool: sync_events → pushes to Google Calendar
    ↓
Response returned to frontend
    ↓
Calendar updates display
```

#### Fetching Events

```
Frontend: GET /api/events
    ↓
Backend queries SQLite
    ↓
Rows converted to JSON objects
    ↓
Frontend receives and renders with FullCalendar
```

## API Reference

### Event Endpoints

#### GET /api/events
Retrieve all calendar events

**Response:**
```json
[
  {
    "id": "google-event-id",
    "title": "Meeting",
    "start": "2026-02-22T15:00:00",
    "end": "2026-02-22T16:00:00",
    "description": "Team sync",
    "location": "Conference Room A",
    "attendees": ["user@example.com"],
    "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
    "recurring_event_id": "parent-id",
    "original_start": null
  }
]
```

#### POST /api/events
Create a new event

**Request:**
```json
{
  "title": "Meeting",
  "start": "2026-02-22T15:00:00",
  "end": "2026-02-22T16:00:00",
  "description": "Team sync",
  "location": "Conference Room A",
  "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
}
```

**Response:** Returns created event object with Google ID

#### PUT /api/events/:id
Update an event

**Request:**
```json
{
  "title": "Updated Meeting",
  "description": "New description"
}
```

#### DELETE /api/events/:id
Delete an event

#### POST /api/sync
Synchronize with Google Calendar

**Response:**
```json
{
  "success": true,
  "message": "Sync completed",
  "events": [...]
}
```

### AI Agent Endpoints

#### POST /api/chat
Send message to AI agent

**Request:**
```json
{
  "message": "Schedule a meeting tomorrow at 3pm"
}
```

**Response:**
```json
{
  "response": "I've scheduled your meeting for tomorrow at 3pm",
  "events_affected": 1
}
```

## Development

### Running Tests

Currently, the project uses manual testing. Future versions will include automated test suites.

### Building for Production

Frontend build:
```bash
cd vite-project
npm run build
```

This generates optimized assets in `vite-project/dist/`

### Common Issues

**Issue:** `ModuleNotFoundError: No module named 'backend'`
- **Solution:** Ensure you're running Flask from the project root directory

**Issue:** `Google API error: 401 Unauthorized`
- **Solution:** Delete `backend/special/token.json` and re-run the OAuth flow with `python backend/special/auth.py`

**Issue:** Frontend can't connect to backend
- **Solution:** Ensure Flask is running on port 5001 and CORS is properly configured

### Adding New Tools

To add a new tool for the AI agent:

1. Define the tool in `backend/mcp/tools.py`:
```python
my_tool = Tool(
    name="my_tool",
    description="What it does",
    input_schema={
        "type": "object",
        "properties": {
            "param": {"type": "string"}
        },
        "required": ["param"]
    },
    handler=lambda args: my_handler(args["param"])
)
```

2. Add to tools list in `backend/webserver.py`
3. Register with MCP server in `backend/mcp/server.py`

## Dependencies

### Backend
- **Flask 3.1.2** - Web framework
- **Google Client Libraries** - Calendar API integration
- **OpenAI/OpenRouter** - LLM integration
- **python-dotenv** - Environment configuration
- **dateparser** - Natural language date parsing
- **SQLite3** - Local database

### Frontend
- **React 19.2.0** - UI framework
- **TypeScript** - Type safety
- **FullCalendar 6.1.20** - Calendar component
- **Material-UI 7.3.7** - UI components
- **Vite** - Build tool
---

**Last Updated:** February 2026
