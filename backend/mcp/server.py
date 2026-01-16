from mcp.server import Server
from mcp.types import Tool
from tools import (
    list_events_tool,
    create_event_tool,
    update_event_tool,
    delete_event_tool,
    sync_events_tool,
)

server = Server(
    name="calendar-mcp",
    version="0.1.0",
    tools=[
        list_events_tool,
        create_event_tool,
        update_event_tool,
        delete_event_tool,
        sync_events_tool,
    ],
)

if __name__ == "__main__":
    server.run()
