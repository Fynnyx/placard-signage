import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// All timestamps are Unix milliseconds.
const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`

export const ROLES = ['admin', 'editor', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const ITEM_TYPES = ['url', 'image', 'video'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export const COMMAND_TYPES = ['reload', 'reboot', 'display_on', 'display_off', 'screenshot'] as const
export type CommandType = (typeof COMMAND_TYPES)[number]

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  role: text('role', { enum: ROLES }).notNull().default('viewer'),
  passwordHash: text('password_hash'),
  oidcSub: text('oidc_sub').unique(),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  inviteTokenHash: text('invite_token_hash'),
  inviteExpiresAt: integer('invite_expires_at'),
  locale: text('locale'),
  createdAt: integer('created_at').notNull().default(now),
  lastLoginAt: integer('last_login_at'),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie value
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull().default(now),
})

export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role', { enum: ROLES }).notNull().default('editor'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
  lastUsedAt: integer('last_used_at'),
})

export const screenGroups = sqliteTable('screen_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})

export const screens = sqliteTable('screens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  location: text('location').notNull().default(''),
  groupId: integer('group_id').references(() => screenGroups.id, { onDelete: 'set null' }),
  tokenHash: text('token_hash').notNull().unique(),
  lastSeenAt: integer('last_seen_at'),
  agentSeenAt: integer('agent_seen_at'),
  lastIp: text('last_ip'),
  browserVersion: text('browser_version'),
  agentVersion: text('agent_version'),
  resolution: text('resolution'),
  displayOn: integer('display_on', { mode: 'boolean' }),
  lastError: text('last_error'),
  lastErrorAt: integer('last_error_at'),
  currentUrl: text('current_url'),
  currentItem: text('current_item'),
  status: text('status', { mode: 'json' }).$type<Record<string, unknown>>(),
  screenshotAt: integer('screenshot_at'),
  nightlyReboot: text('nightly_reboot'), // "HH:MM" in the server timezone, or null
  offlineNotified: integer('offline_notified', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(now),
})

export const pairingCodes = sqliteTable('pairing_codes', {
  code: text('code').primaryKey(),
  deviceSecretHash: text('device_secret_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  claimedScreenId: integer('claimed_screen_id').references(() => screens.id, { onDelete: 'cascade' }),
  // Plain token handed to the device exactly once; cleared when the device picks it up.
  pendingToken: text('pending_token'),
  ip: text('ip'),
  createdAt: integer('created_at').notNull().default(now),
})

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  updatedAt: integer('updated_at').notNull().default(now),
})

export const playlistItems = sqliteTable('playlist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playlistId: integer('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  type: text('type', { enum: ITEM_TYPES }).notNull(),
  title: text('title').notNull().default(''),
  source: text('source').notNull(),
  durationS: integer('duration_s').notNull().default(10),
  reloadEachTime: integer('reload_each_time', { mode: 'boolean' }).notNull().default(false),
  signUrl: integer('sign_url', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
}, t => [index('playlist_items_playlist_idx').on(t.playlistId, t.position)])

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  filename: text('filename').notNull().unique(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull().default(now),
})

export const assignments = sqliteTable('assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Exactly one of screenId / groupId is set.
  screenId: integer('screen_id').references(() => screens.id, { onDelete: 'cascade' }),
  groupId: integer('group_id').references(() => screenGroups.id, { onDelete: 'cascade' }),
  playlistId: integer('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  // Bitmask, Monday = 1, Tuesday = 2, … Sunday = 64. 127 = every day.
  weekdays: integer('weekdays').notNull().default(127),
  timeFrom: text('time_from'), // "HH:MM", null = start of day
  timeTo: text('time_to'), // "HH:MM", null = end of day
  priority: integer('priority').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
})

export const commands = sqliteTable('commands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  screenId: integer('screen_id').notNull().references(() => screens.id, { onDelete: 'cascade' }),
  type: text('type', { enum: COMMAND_TYPES }).notNull(),
  createdAt: integer('created_at').notNull().default(now),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  deliveredAt: integer('delivered_at'),
  ackedAt: integer('acked_at'),
  success: integer('success', { mode: 'boolean' }),
  result: text('result'),
}, t => [index('commands_screen_idx').on(t.screenId, t.ackedAt)])

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  screenId: integer('screen_id').references(() => screens.id, { onDelete: 'cascade' }),
  at: integer('at').notNull().default(now),
  level: text('level', { enum: ['debug', 'info', 'warn', 'error'] }).notNull().default('info'),
  source: text('source').notNull().default('server'),
  message: text('message').notNull(),
}, t => [index('events_at_idx').on(t.at), index('events_screen_idx').on(t.screenId, t.at)])

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

