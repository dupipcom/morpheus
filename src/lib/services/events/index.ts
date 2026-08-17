/**
 * Events Service Layer (Phase 8)
 * Public Event entity: CRUD, publish, discovery, RSVP, list/project links, staff.
 */

export {
  EVENT_STATUSES,
  createEvent,
  updateEvent,
  publishEvent,
  listEvents,
  listPublicEvents,
  getPublicEvent,
  upsertRsvp,
  setListLink,
  setProjectLink,
  setStaff,
  cancelEvent
} from './eventService'

export type { CreateEventInput } from './eventService'
