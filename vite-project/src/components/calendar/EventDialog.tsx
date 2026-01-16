import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Chip,
  Alert,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  Repeat as RepeatIcon,
  LocationOn as LocationIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import type { CalendarEvent, RecurrenceFrequency, RecurrenceConfig } from '../../types/calendar';
import {
  generateRRule,
  parseRRuleToText,
  isRecurringInstance,
} from '../../types/calendar';

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (eventData: EventFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  event?: CalendarEvent | null;
  defaultStart?: string;
  defaultEnd?: string;
  mode: 'create' | 'edit';
}

export interface EventFormData {
  title: string;
  start: string;
  end: string;
  description: string;
  location: string;
  recurrence?: string[];
  editMode?: 'single' | 'all';  // For recurring events: edit just this instance or all
}

const DAYS_OF_WEEK = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
];

export function EventDialog({
  open,
  onClose,
  onSave,
  onDelete,
  event,
  defaultStart = '',
  defaultEnd = '',
  mode,
}: EventDialogProps) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recurrence state
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('none');
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [endType, setEndType] = useState<'never' | 'count' | 'until'>('never');
  const [repeatCount, setRepeatCount] = useState(10);
  const [repeatUntil, setRepeatUntil] = useState('');

  // For editing recurring instances
  const [editMode, setEditMode] = useState<'single' | 'all'>('single');

  const isInstance = event ? isRecurringInstance(event) : false;

  useEffect(() => {
    if (open) {
      if (event) {
        setTitle(event.title || '');
        setStart(formatDateTimeForInput(event.start));
        setEnd(formatDateTimeForInput(event.end || event.start));
        setDescription(event.description || '');
        setLocation(event.location || '');

        // Parse existing recurrence
        if (event.recurrence && event.recurrence.length > 0) {
          parseExistingRecurrence(event.recurrence[0]);
        } else {
          resetRecurrence();
        }
      } else {
        setTitle('');
        setStart(formatDateTimeForInput(defaultStart));
        setEnd(formatDateTimeForInput(defaultEnd || defaultStart));
        setDescription('');
        setLocation('');
        resetRecurrence();
      }
      setError(null);
      setEditMode('single');
    }
  }, [open, event, defaultStart, defaultEnd]);

  const resetRecurrence = () => {
    setFrequency('none');
    setInterval(1);
    setSelectedDays([]);
    setEndType('never');
    setRepeatCount(10);
    setRepeatUntil('');
  };

  const parseExistingRecurrence = (rrule: string) => {
    const freqMatch = rrule.match(/FREQ=(\w+)/);
    const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
    const countMatch = rrule.match(/COUNT=(\d+)/);
    const untilMatch = rrule.match(/UNTIL=(\d+)/);
    const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);

    if (freqMatch) {
      setFrequency(freqMatch[1].toLowerCase() as RecurrenceFrequency);
    }
    if (intervalMatch) {
      setInterval(parseInt(intervalMatch[1]));
    }
    if (byDayMatch) {
      setSelectedDays(byDayMatch[1].split(','));
    }
    if (countMatch) {
      setEndType('count');
      setRepeatCount(parseInt(countMatch[1]));
    } else if (untilMatch) {
      setEndType('until');
      const until = untilMatch[1];
      setRepeatUntil(`${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}`);
    } else {
      setEndType('never');
    }
  };

  const formatDateTimeForInput = (dateStr: string): string => {
    if (!dateStr) return '';

    // If already in YYYY-MM-DDTHH:mm format (from calendar selection), return as-is
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Convert ISO string or other formats to local datetime-local format (YYYY-MM-DDTHH:mm)
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    // Use local time components, not UTC
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Convert local datetime-local value to ISO string with timezone
  const formatDateTimeForApi = (localDateTimeStr: string): string => {
    if (!localDateTimeStr) return '';
    // The datetime-local input gives us a string like "2026-01-15T14:30"
    // This is interpreted as local time, so we create a Date and convert to ISO
    const date = new Date(localDateTimeStr);
    if (isNaN(date.getTime())) return localDateTimeStr;
    return date.toISOString();
  };

  const handleDayToggle = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!start) {
      setError('Start time is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const recurrenceConfig: RecurrenceConfig = {
        frequency,
        interval: interval > 1 ? interval : undefined,
        byDay: frequency === 'weekly' && selectedDays.length > 0 ? selectedDays : undefined,
        count: endType === 'count' ? repeatCount : undefined,
        until: endType === 'until' ? repeatUntil : undefined,
      };

      const formData: EventFormData = {
        title: title.trim(),
        start: formatDateTimeForApi(start),
        end: formatDateTimeForApi(end || start),
        description,
        location,
        recurrence: mode === 'create' ? generateRRule(recurrenceConfig) : undefined,
        editMode: isInstance ? editMode : undefined,
      };

      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    const confirmMessage = isInstance
      ? 'Delete this occurrence or the entire series?'
      : 'Are you sure you want to delete this event?';

    if (!window.confirm(confirmMessage)) return;

    setLoading(true);
    setError(null);

    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {mode === 'create' ? 'Create Event' : 'Edit Event'}
        {event?.recurrence && event.recurrence.length > 0 && (
          <Chip
            icon={<RepeatIcon />}
            label={parseRRuleToText(event.recurrence[0])}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ ml: 2 }}
          />
        )}
        {isInstance && (
          <Chip
            label="Recurring Instance"
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        )}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Title"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          sx={{ mt: 1, mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="Start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
          <LocationIcon sx={{ mt: 2, color: 'action.active' }} />
          <TextField
            label="Location"
            fullWidth
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
          <DescriptionIcon sx={{ mt: 2, color: 'action.active' }} />
          <TextField
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Box>

        {/* Recurrence Options - Only for creating new events */}
        {mode === 'create' && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <RepeatIcon sx={{ mt: 2, color: 'action.active' }} />
              <Box sx={{ flex: 1 }}>
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Repeat</InputLabel>
                  <Select
                    value={frequency}
                    label="Repeat"
                    onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                  >
                    <MenuItem value="none">Does not repeat</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="yearly">Yearly</MenuItem>
                  </Select>
                </FormControl>

                {frequency !== 'none' && (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Typography>Every</Typography>
                      <TextField
                        type="number"
                        value={interval}
                        onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        size="small"
                        sx={{ width: 80 }}
                        slotProps={{ htmlInput: { min: 1 } }}
                      />
                      <Typography>
                        {frequency === 'daily' ? 'day(s)' :
                         frequency === 'weekly' ? 'week(s)' :
                         frequency === 'monthly' ? 'month(s)' : 'year(s)'}
                      </Typography>
                    </Box>

                    {frequency === 'weekly' && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>Repeat on:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          {DAYS_OF_WEEK.map((day) => (
                            <Chip
                              key={day.value}
                              label={day.label}
                              onClick={() => handleDayToggle(day.value)}
                              color={selectedDays.includes(day.value) ? 'primary' : 'default'}
                              variant={selectedDays.includes(day.value) ? 'filled' : 'outlined'}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}

                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Ends</InputLabel>
                      <Select
                        value={endType}
                        label="Ends"
                        onChange={(e) => setEndType(e.target.value as 'never' | 'count' | 'until')}
                      >
                        <MenuItem value="never">Never</MenuItem>
                        <MenuItem value="count">After X occurrences</MenuItem>
                        <MenuItem value="until">On date</MenuItem>
                      </Select>
                    </FormControl>

                    {endType === 'count' && (
                      <TextField
                        label="Number of occurrences"
                        type="number"
                        value={repeatCount}
                        onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                        fullWidth
                        slotProps={{ htmlInput: { min: 1 } }}
                      />
                    )}

                    {endType === 'until' && (
                      <TextField
                        label="End date"
                        type="date"
                        value={repeatUntil}
                        onChange={(e) => setRepeatUntil(e.target.value)}
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    )}
                  </>
                )}
              </Box>
            </Box>
          </>
        )}

        {mode === 'edit' && isInstance && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              This event is part of a recurring series.
            </Typography>
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editMode === 'single'}
                    onChange={() => setEditMode('single')}
                  />
                }
                label="Edit only this occurrence"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editMode === 'all'}
                    onChange={() => setEditMode('all')}
                  />
                }
                label="Edit all occurrences in the series"
              />
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {mode === 'edit' && onDelete && (
          <Button color="error" onClick={handleDelete} disabled={loading}>
            Delete
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

