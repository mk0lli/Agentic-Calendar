import type { CalendarEvent, CreateEventPayload, UpdateEventPayload } from '../types/calendar';

const API_BASE = 'http://localhost:5001/api';

export interface ApiError {
  error: string;
  message?: string;
}

export interface SyncResponse {
  success: boolean;
  events?: CalendarEvent[];
  message: string;
  error?: string;
}

/**
 * Fetch all events from the backend
 */
export async function fetchEvents(): Promise<CalendarEvent[]> {
  const response = await fetch(`${API_BASE}/events`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch events' }));
    throw new Error(error.error || 'Failed to fetch events');
  }

  return response.json();
}

/**
 * Create a new event
 */
export async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent> {
  const response = await fetch(`${API_BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create event' }));
    throw new Error(error.error || 'Failed to create event');
  }

  return response.json();
}

/**
 * Update an existing event
 */
export async function updateEvent(eventId: string, changes: UpdateEventPayload): Promise<CalendarEvent> {
  const response = await fetch(`${API_BASE}/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update event' }));
    throw new Error(error.error || 'Failed to update event');
  }

  return response.json();
}

/**
 * Delete an event
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/events/${eventId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete event' }));
    throw new Error(error.error || 'Failed to delete event');
  }
}

export async function syncEvents(): Promise<SyncResponse> {
  const response = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      message: data.message || 'Sync failed',
      error: data.error,
    };
  }

  return data;
}

/**
 * Response from the MCP agent
 */
export interface McpResponse {
  response?: string;
  error?: string;
}

/**
 * Send a message to the MCP AI agent
 */
export async function sendAgentMessage(message: string): Promise<McpResponse> {
  const response = await fetch(`${API_BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      error: data.error || 'Failed to get response from AI agent',
    };
  }

  return data;
}
