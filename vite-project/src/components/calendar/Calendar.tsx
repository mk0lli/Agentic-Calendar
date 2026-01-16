import { useState, useEffect, useCallback, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  DateSelectArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  Box,
  CircularProgress,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Sync as SyncIcon, Repeat as RepeatIcon, Chat as ChatIcon } from "@mui/icons-material";
import type { CalendarEvent } from "../../types/calendar";
import { isRecurringEvent, isRecurringInstance } from "../../types/calendar";
import { EventDialog, type EventFormData } from "./EventDialog";
import { AIChat } from "../chat/AIChat";
import * as api from "../../api/calendarApi";

// Sync interval in milliseconds (30 seconds)
const SYNC_INTERVAL = 30000;

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "info" }>({
    open: false,
    message: "",
    severity: "info",
  });
  const [chatOpen, setChatOpen] = useState(true);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [defaultStart, setDefaultStart] = useState<string>("");
  const [defaultEnd, setDefaultEnd] = useState<string>("");

  // Track last sync time
  const lastSyncRef = useRef<Date>(new Date());

  // Fetch events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  // Set up periodic sync
  useEffect(() => {
    const interval = setInterval(() => {
      handleSync(true); // Silent sync
    }, SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchEvents();
      setEvents(data);
    } catch (err) {
      setError("Could not load events. Make sure the backend server is running on port 5001.");
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = useCallback(async (silent = false) => {
    if (syncing) return;

    try {
      if (!silent) {
        setSyncing(true);
      }

      const result = await api.syncEvents();

      if (result.success && result.events) {
        // Merge synced events without overwriting user's current changes
        setEvents(prevEvents => {
          const eventMap = new Map(prevEvents.map(e => [e.id, e]));

          // Update with synced events
          result.events!.forEach(syncedEvent => {
            const existing = eventMap.get(syncedEvent.id);
            // Only update if the synced event is newer
            if (!existing ||
                (syncedEvent.updated && existing.updated &&
                 new Date(syncedEvent.updated) > new Date(existing.updated))) {
              eventMap.set(syncedEvent.id, syncedEvent);
            }
          });

          // Remove events that were deleted during sync
          const syncedIds = new Set(result.events!.map(e => e.id));
          prevEvents.forEach(e => {
            if (!syncedIds.has(e.id)) {
              eventMap.delete(e.id);
            }
          });

          return Array.from(eventMap.values());
        });

        lastSyncRef.current = new Date();

        if (!silent) {
          setSnackbar({
            open: true,
            message: "Synced with Google Calendar",
            severity: "success",
          });
        }
      } else if (!silent) {
        setSnackbar({
          open: true,
          message: result.message || "Sync failed",
          severity: "error",
        });
      }
    } catch (err) {
      console.error("Sync error:", err);
      if (!silent) {
        setSnackbar({
          open: true,
          message: "Failed to sync with Google Calendar",
          severity: "error",
        });
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const handleSelect = (info: DateSelectArg) => {
    setSelectedEvent(null);
    // Use the Date objects directly and format for local time
    // info.start and info.end are already Date objects in local timezone
    const formatForInput = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setDefaultStart(formatForInput(info.start));
    setDefaultEnd(formatForInput(info.end));
    setDialogMode("create");
    setDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const event = events.find(e => e.id === info.event.id);
    if (event) {
      setSelectedEvent(event);
      setDialogMode("edit");
      setDialogOpen(true);
    }
  };

  const handleSaveEvent = async (formData: EventFormData) => {
    if (dialogMode === "create") {
      // Create new event
      const newEvent = await api.createEvent({
        title: formData.title,
        start: formData.start,
        end: formData.end,
        description: formData.description,
        location: formData.location,
        recurrence: formData.recurrence,
      });

      setEvents(prev => [...prev, newEvent]);
      setSnackbar({
        open: true,
        message: "Event created successfully",
        severity: "success",
      });
    } else if (selectedEvent) {
      // Update existing event
      const updatedEvent = await api.updateEvent(selectedEvent.id, {
        title: formData.title,
        start: formData.start,
        end: formData.end,
        description: formData.description,
        location: formData.location,
      });

      setEvents(prev =>
        prev.map(e => (e.id === selectedEvent.id ? updatedEvent : e))
      );
      setSnackbar({
        open: true,
        message: "Event updated successfully",
        severity: "success",
      });
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    await api.deleteEvent(selectedEvent.id);
    setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
    setSnackbar({
      open: true,
      message: "Event deleted successfully",
      severity: "success",
    });
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const eventId = info.event.id;

    try {
      const updatedEvent = await api.updateEvent(eventId, {
        title: info.event.title,
        start: info.event.startStr,
        end: info.event.endStr || info.event.startStr,
      });

      setEvents(prev =>
        prev.map(e => (e.id === eventId ? updatedEvent : e))
      );
    } catch (err) {
      console.error("Error updating event:", err);
      info.revert();
      setSnackbar({
        open: true,
        message: "Failed to update event",
        severity: "error",
      });
    }
  };

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const eventId = info.event.id;

    try {
      const updatedEvent = await api.updateEvent(eventId, {
        title: info.event.title,
        start: info.event.startStr,
        end: info.event.endStr || info.event.startStr,
      });

      setEvents(prev =>
        prev.map(e => (e.id === eventId ? updatedEvent : e))
      );
    } catch (err) {
      console.error("Error updating event:", err);
      info.revert();
      setSnackbar({
        open: true,
        message: "Failed to update event",
        severity: "error",
      });
    }
  };

  // Convert events to FullCalendar format with recurring event indicators
  const calendarEvents = events.map(event => {
    const isRecurring = isRecurringEvent(event) || isRecurringInstance(event);

    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      extendedProps: {
        description: event.description,
        location: event.location,
        recurrence: event.recurrence,
        recurring_event_id: event.recurring_event_id,
        original_start: event.original_start,
        attendees: event.attendees,
        isRecurring,
      },
      // Style recurring events differently
      classNames: isRecurring ? ['recurring-event'] : [],
    };
  });

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      display: "flex",
      minHeight: "100vh",
      bgcolor: "#f0f2f5",
      flexDirection: isMobile ? "column" : "row",
    }}>
      {/* Main Calendar Section */}
      <Box sx={{
        flex: 1,
        p: 3,
        overflow: "auto",
        transition: "all 0.3s ease",
      }}>
        {/* Header */}
        <Box sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}>
          <Box>
            <Typography
              variant="h4"
              component="h1"
              sx={{
                fontWeight: 700,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Agentic Calendar
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your schedule with AI assistance
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Tooltip title={`Last synced: ${lastSyncRef.current.toLocaleTimeString()}`}>
              <span>
                <IconButton
                  onClick={() => handleSync(false)}
                  disabled={syncing}
                  sx={{
                    bgcolor: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    "&:hover": { bgcolor: "#f5f5f5" },
                  }}
                >
                  <SyncIcon sx={{ animation: syncing ? "spin 1s linear infinite" : "none", color: "#667eea" }} />
                </IconButton>
              </span>
            </Tooltip>
            {!chatOpen && (
              <Tooltip title="Open AI Assistant">
                <IconButton
                  onClick={() => setChatOpen(true)}
                  sx={{
                    bgcolor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    color: "white",
                    boxShadow: "0 2px 8px rgba(102, 126, 234, 0.4)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #5a6fd6 0%, #684099 100%)",
                    },
                  }}
                >
                  <ChatIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {error && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {/* Calendar Container */}
        <Box sx={{
          bgcolor: "white",
          borderRadius: 3,
          p: 2,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            timeZone="local"
            height={isMobile ? "60vh" : "75vh"}
            selectable
            editable
            events={calendarEvents}
            select={handleSelect}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventResize={handleEventResize}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            eventContent={(eventInfo) => {
              const isRecurring = eventInfo.event.extendedProps.isRecurring;
              return (
                <Box sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  overflow: "hidden",
                  width: "100%",
                  px: 0.5,
                }}>
                  {isRecurring && (
                    <RepeatIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                  )}
                  <Typography
                    variant="body2"
                    sx={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: "inherit",
                    }}
                  >
                    {eventInfo.event.title}
                  </Typography>
                </Box>
              );
            }}
          />
        </Box>
      </Box>

      {/* AI Chat Panel */}
      {chatOpen && (
        <Box sx={{
          width: isMobile ? "100%" : 400,
          height: isMobile ? "50vh" : "100vh",
          flexShrink: 0,
          p: isMobile ? 2 : 3,
          pl: isMobile ? 2 : 0,
          display: "flex",
          flexDirection: "column",
        }}>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <AIChat
              onEventChange={() => handleSync(true)}
              onClose={() => setChatOpen(false)}
            />
          </Box>
        </Box>
      )}

      {/* Event Dialog */}
      <EventDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedEvent(null);
        }}
        onSave={handleSaveEvent}
        onDelete={dialogMode === "edit" ? handleDeleteEvent : undefined}
        event={selectedEvent}
        defaultStart={defaultStart}
        defaultEnd={defaultEnd}
        mode={dialogMode}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: "100%", borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <style>{`
        .recurring-event {
          border-left: 3px solid #667eea !important;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .fc {
          font-family: inherit;
        }
        .fc .fc-button {
          border-radius: 8px !important;
          font-weight: 500;
        }
        .fc .fc-button-primary {
          background-color: #667eea !important;
          border-color: #667eea !important;
          color: white !important;
        }
        .fc .fc-button-primary:hover {
          background-color: #5a6fd6 !important;
          border-color: #5a6fd6 !important;
          color: white !important;
        }
        .fc .fc-button-primary:not(:disabled).fc-button-active {
          background-color: #764ba2 !important;
          border-color: #764ba2 !important;
          color: white !important;
        }
        .fc .fc-toolbar-title {
          font-weight: 600;
          color: #1a1a2e;
        }
        .fc .fc-event {
          border-radius: 6px;
          border: none;
          padding: 2px 6px;
          color: white !important;
        }
        .fc .fc-daygrid-event {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white !important;
        }
        .fc .fc-timegrid-event {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white !important;
        }
        .fc .fc-event-title,
        .fc .fc-event-time {
          color: white !important;
        }
      `}</style>
    </Box>
  );
}
