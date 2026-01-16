export interface Attendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  self?: boolean;
  organizer?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: Attendee[];
  // Recurrence fields
  recurrence?: string[];  // RRULE strings like ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
  recurring_event_id?: string | null;  // Parent series ID for instances
  original_start?: string | null;  // Original start time for exception instances
  // Metadata
  created?: string;
  updated?: string;
}

// For creating new events
export interface CreateEventPayload {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  recurrence?: string[];
}

// For updating events
export interface UpdateEventPayload {
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
}

// Recurrence options for UI
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  interval?: number;
  count?: number;
  until?: string;
  byDay?: string[];  // For weekly: ['MO', 'TU', 'WE', 'TH', 'FR']
}

// Helper to check if event is recurring
export function isRecurringEvent(event: CalendarEvent): boolean {
  return !!(event.recurrence && event.recurrence.length > 0);
}

// Helper to check if event is an instance of a recurring series
export function isRecurringInstance(event: CalendarEvent): boolean {
  return !!event.recurring_event_id;
}

// Helper to check if event is an exception (modified instance)
export function isRecurrenceException(event: CalendarEvent): boolean {
  return !!event.recurring_event_id && !!event.original_start;
}

// Generate RRULE string from config
export function generateRRule(config: RecurrenceConfig): string[] {
  if (config.frequency === 'none') return [];

  let rule = `RRULE:FREQ=${config.frequency.toUpperCase()}`;

  if (config.interval && config.interval > 1) {
    rule += `;INTERVAL=${config.interval}`;
  }

  if (config.byDay && config.byDay.length > 0 && config.frequency === 'weekly') {
    rule += `;BYDAY=${config.byDay.join(',')}`;
  }

  if (config.count) {
    rule += `;COUNT=${config.count}`;
  } else if (config.until) {
    // Format: YYYYMMDD
    const untilDate = config.until.replace(/-/g, '');
    rule += `;UNTIL=${untilDate}`;
  }

  return [rule];
}

export function parseRRuleToText(rrule: string): string {
  if (!rrule) return '';

  const freqMatch = rrule.match(/FREQ=(\w+)/);
  const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
  const countMatch = rrule.match(/COUNT=(\d+)/);
  const untilMatch = rrule.match(/UNTIL=(\d+)/);
  const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);

  if (!freqMatch) return rrule;

  const freq = freqMatch[1].toLowerCase();
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;

  let text = '';

  if (interval === 1) {
    text = freq === 'daily' ? 'Daily' :
           freq === 'weekly' ? 'Weekly' :
           freq === 'monthly' ? 'Monthly' :
           freq === 'yearly' ? 'Yearly' : freq;
  } else {
    text = `Every ${interval} ${freq === 'daily' ? 'days' :
                                freq === 'weekly' ? 'weeks' :
                                freq === 'monthly' ? 'months' :
                                freq === 'yearly' ? 'years' : freq}`;
  }

  if (byDayMatch) {
    const days = byDayMatch[1].split(',').map(d => {
      const dayMap: Record<string, string> = {
        'MO': 'Mon', 'TU': 'Tue', 'WE': 'Wed', 'TH': 'Thu',
        'FR': 'Fri', 'SA': 'Sat', 'SU': 'Sun'
      };
      return dayMap[d] || d;
    });
    text += ` on ${days.join(', ')}`;
  }

  if (countMatch) {
    text += `, ${countMatch[1]} times`;
  } else if (untilMatch) {
    const until = untilMatch[1];
    const formatted = `${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}`;
    text += `, until ${formatted}`;
  }

  return text;
}
