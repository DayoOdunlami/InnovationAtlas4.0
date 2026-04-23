import { Agent } from "app-types/agent";
import { UserPreferences } from "app-types/user";
import { MCPServerConfig, MCPToolInfo } from "app-types/mcp";
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgSchema,
  text,
  timestamp,
  json,
  jsonb,
  uuid,
  boolean,
  unique,
  varchar,
  index,
  check,
  vector,
} from "drizzle-orm/pg-core";
import { isNotNull } from "drizzle-orm";
import { DBWorkflow, DBEdge, DBNode } from "app-types/workflow";
import { UIMessage } from "ai";
import { ChatMetadata } from "app-types/chat";
import { TipTapMentionJsonContent } from "@/types/util";

export const ChatThreadTable = pgTable("chat_thread", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  /** Binds this chat thread to an atlas.passports row for split-view session doc */
  activePassportId: text("active_passport_id"),
});

export const ChatMessageTable = pgTable("chat_message", {
  id: text("id").primaryKey().notNull(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => ChatThreadTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<UIMessage["role"]>(),
  parts: json("parts").notNull().array().$type<UIMessage["parts"]>(),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const AgentTable = pgTable("agent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  icon: json("icon").$type<Agent["icon"]>(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  instructions: json("instructions").$type<Agent["instructions"]>(),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const BookmarkTable = pgTable(
  "bookmark",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    itemType: varchar("item_type", {
      enum: ["agent", "workflow", "mcp"],
    }).notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique().on(table.userId, table.itemId, table.itemType),
    index("bookmark_user_id_idx").on(table.userId),
    index("bookmark_item_idx").on(table.itemId, table.itemType),
  ],
);

export const McpServerTable = pgTable("mcp_server", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  config: json("config").notNull().$type<MCPServerConfig>(),
  enabled: boolean("enabled").notNull().default(true),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", {
    enum: ["public", "private"],
  })
    .notNull()
    .default("private"),
  toolInfo: json("tool_info").$type<MCPToolInfo[]>(),
  toolInfoUpdatedAt: timestamp("tool_info_updated_at"),
  lastConnectionStatus: varchar("last_connection_status", {
    enum: ["connected", "error"],
  }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const UserTable = pgTable("user", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  password: text("password"),
  image: text("image"),
  preferences: json("preferences").default({}).$type<UserPreferences>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  role: text("role").notNull().default("user"),
});

// Role tables removed - using Better Auth's built-in role system
// Roles are now managed via the 'role' field on UserTable

export const SessionTable = pgTable("session", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  // Admin plugin field (from better-auth generated schema)
  impersonatedBy: text("impersonated_by"),
});

export const AccountTable = pgTable("account", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const VerificationTable = pgTable("verification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});

// Tool customization table for per-user additional instructions
export const McpToolCustomizationTable = pgTable(
  "mcp_server_tool_custom_instructions",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [unique().on(table.userId, table.toolName, table.mcpServerId)],
);

export const McpServerCustomizationTable = pgTable(
  "mcp_server_custom_instructions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    prompt: text("prompt"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [unique().on(table.userId, table.mcpServerId)],
);

export const WorkflowTable = pgTable("workflow", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  name: text("name").notNull(),
  icon: json("icon").$type<DBWorkflow["icon"]>(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  visibility: varchar("visibility", {
    enum: ["public", "private", "readonly"],
  })
    .notNull()
    .default("private"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const WorkflowNodeDataTable = pgTable(
  "workflow_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    version: text("version").notNull().default("0.1.0"),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => WorkflowTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    uiConfig: json("ui_config").$type<DBNode["uiConfig"]>().default({}),
    nodeConfig: json("node_config")
      .$type<Partial<DBNode["nodeConfig"]>>()
      .default({}),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("workflow_node_kind_idx").on(t.kind)],
);

export const WorkflowEdgeTable = pgTable("workflow_edge", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  version: text("version").notNull().default("0.1.0"),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => WorkflowTable.id, { onDelete: "cascade" }),
  source: uuid("source")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  target: uuid("target")
    .notNull()
    .references(() => WorkflowNodeDataTable.id, { onDelete: "cascade" }),
  uiConfig: json("ui_config").$type<DBEdge["uiConfig"]>().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveTable = pgTable("archive", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  userId: uuid("user_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ArchiveItemTable = pgTable(
  "archive_item",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    archiveId: uuid("archive_id")
      .notNull()
      .references(() => ArchiveTable.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("archive_item_item_id_idx").on(t.itemId)],
);

export const McpOAuthSessionTable = pgTable(
  "mcp_oauth_session",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    mcpServerId: uuid("mcp_server_id")
      .notNull()
      .references(() => McpServerTable.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    clientInfo: json("client_info"),
    tokens: json("tokens"),
    codeVerifier: text("code_verifier"),
    state: text("state").unique(), // OAuth state parameter for current flow (unique for security)
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("mcp_oauth_session_server_id_idx").on(t.mcpServerId),
    index("mcp_oauth_session_state_idx").on(t.state),
    // Partial index for sessions with tokens for better performance
    index("mcp_oauth_session_tokens_idx")
      .on(t.mcpServerId)
      .where(isNotNull(t.tokens)),
  ],
);

export type McpServerEntity = typeof McpServerTable.$inferSelect;
export type ChatThreadEntity = typeof ChatThreadTable.$inferSelect;
export type ChatMessageEntity = typeof ChatMessageTable.$inferSelect;

export type AgentEntity = typeof AgentTable.$inferSelect;
export type UserEntity = typeof UserTable.$inferSelect;
export type SessionEntity = typeof SessionTable.$inferSelect;

export type ToolCustomizationEntity =
  typeof McpToolCustomizationTable.$inferSelect;
export type McpServerCustomizationEntity =
  typeof McpServerCustomizationTable.$inferSelect;

export const ChatExportTable = pgTable("chat_export", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  exporterId: uuid("exporter_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  originalThreadId: uuid("original_thread_id"),
  messages: json("messages").notNull().$type<
    Array<{
      id: string;
      role: UIMessage["role"];
      parts: UIMessage["parts"];
      metadata?: ChatMetadata;
    }>
  >(),
  exportedAt: timestamp("exported_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  expiresAt: timestamp("expires_at"),
});

export const ChatExportCommentTable = pgTable("chat_export_comment", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  exportId: uuid("export_id")
    .notNull()
    .references(() => ChatExportTable.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references(() => ChatExportCommentTable.id, {
    onDelete: "cascade",
  }),
  content: json("content").notNull().$type<TipTapMentionJsonContent>(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ArchiveEntity = typeof ArchiveTable.$inferSelect;
export type ArchiveItemEntity = typeof ArchiveItemTable.$inferSelect;
export type BookmarkEntity = typeof BookmarkTable.$inferSelect;

// ---------------------------------------------------------------------------
// Atlas schema (Phase 1, Brief-First Rebuild — Data Model Spec v1.1)
//
// The `atlas` Postgres schema houses the five brief-first tables that the
// Phase 1 deliverables own: briefs, messages, brief_share_tokens,
// passport_share_tokens, and telemetry_events. Access control for these
// tables is enforced at the repository boundary via the `AccessScope`
// contract (no RLS) — see `src/lib/db/pg/repositories/brief-repository.pg.ts`.
//
// Notes
// -----
// * The `atlas` schema itself is created idempotently in migration 0017
//   (it was originally provisioned out-of-band for `atlas.passports`
//   and friends, which continue to live there outside Drizzle's schema).
// * `vector(1536)` depends on the `pgvector` extension; migration 0017
//   also `CREATE EXTENSION IF NOT EXISTS vector` at the top, defensively.
// * `atlas.passport_share_tokens` foreign-keys to `atlas.passports(id)`,
//   which Drizzle does not model. The FK is added via raw SQL in 0017.
// * `atlas.blocks` is deliberately excluded from Phase 1; Phase 2a.0 adds
//   it in a separate migration.
// ---------------------------------------------------------------------------

export const atlasSchema = pgSchema("atlas");

export const AtlasBriefsTable = atlasSchema.table(
  "briefs",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled brief"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    agentCompleteSnapshotJson: jsonb("agent_complete_snapshot_json"),
    isEdited: boolean("is_edited").notNull().default(false),
    sharedWith: uuid("shared_with")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (t) => [
    check("briefs_title_len_chk", sql`char_length(${t.title}) <= 200`),
    index("atlas_briefs_owner_updated_idx")
      .on(t.ownerId, t.updatedAt.desc())
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export const AtlasMessagesTable = atlasSchema.table(
  "messages",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => AtlasBriefsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    contentJson: jsonb("content_json").notNull(),
    toolCalls: jsonb("tool_calls").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    transcript: boolean("transcript").notNull().default(false),
  },
  (t) => [
    check(
      "messages_role_chk",
      sql`${t.role} IN ('user','assistant','system','tool')`,
    ),
    index("atlas_messages_brief_created_idx").on(t.briefId, t.createdAt),
  ],
);

export const AtlasBriefShareTokensTable = atlasSchema.table(
  "brief_share_tokens",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => AtlasBriefsTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("atlas_brief_share_tokens_active_idx")
      .on(t.token)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// `passport_id` references `atlas.passports(id)`, which is provisioned
// out-of-band and not modelled in Drizzle. The FK constraint is added
// via raw SQL in migration 0017.
export const AtlasPassportShareTokensTable = atlasSchema.table(
  "passport_share_tokens",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    passportId: uuid("passport_id").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("atlas_passport_share_tokens_active_idx")
      .on(t.token)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// atlas.blocks (Phase 2a.0, Brief-First Rebuild — Data Model Spec §4.2,
// Block Types Spec §1). Holds the ordered block list that makes up a
// brief's body.
//
// * `id` is a client-generated 26-char ULID string (not a UUID). The
//   CHECK constraint enforces the length.
// * `type` CHECK encodes all nine v1 block types even though Phase 2a.0
//   only renders two of them (heading, paragraph). The schema is frozen
//   at Phase 0; later phases only add renderers / write tools.
// * `source` is v1's two-value union `('user', 'agent')`. Data Model
//   Spec #15 adds 'voice' later — the CHECK MUST stay two-valued in
//   this phase.
// * `position` is the fractional-indexing string (see
//   `fractional-indexing` npm package). Stored as TEXT, sorted
//   lexicographically via the `(brief_id, position)` composite index.
// * `canonical_question_ids` + `comments_json` are reserved columns
//   required by the Phase 0 spec freeze; unused in v1.
// ---------------------------------------------------------------------------

export const AtlasBlocksTable = atlasSchema.table(
  "blocks",
  {
    id: text("id").primaryKey().notNull(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => AtlasBriefsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    position: text("position").notNull(),
    contentJson: jsonb("content_json").notNull().default(sql`'{}'::jsonb`),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    canonicalQuestionIds: text("canonical_question_ids")
      .array()
      .default(sql`'{}'::text[]`),
    commentsJson: jsonb("comments_json").default(sql`'[]'::jsonb`),
  },
  (t) => [
    check("blocks_id_ulid_len_chk", sql`char_length(${t.id}) = 26`),
    check(
      "blocks_type_chk",
      sql`${t.type} IN ('heading','paragraph','bullets','citation','project-card','chart','live-passport-view','landscape-embed','table')`,
    ),
    check("blocks_source_chk", sql`${t.source} IN ('user','agent')`),
    index("blocks_brief_id_position").on(t.briefId, t.position),
    index("blocks_type_idx").on(t.type),
  ],
);

export const AtlasTelemetryEventsTable = atlasSchema.table(
  "telemetry_events",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    sessionId: text("session_id").notNull(),
    userIdHash: text("user_id_hash"),
    env: text("env").notNull(),
    category: text("category").notNull(),
    event: text("event").notNull(),
    payloadJson: jsonb("payload_json").notNull().default(sql`'{}'::jsonb`),
    ts: timestamp("ts", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    check(
      "telemetry_events_category_chk",
      sql`${t.category} IN ('nav','action','agent','perf')`,
    ),
    index("atlas_telemetry_ts_idx").on(t.ts.desc()),
    index("atlas_telemetry_cat_event_ts_idx").on(
      t.category,
      t.event,
      t.ts.desc(),
    ),
  ],
);

export type AtlasBriefEntity = typeof AtlasBriefsTable.$inferSelect;
export type AtlasBriefInsert = typeof AtlasBriefsTable.$inferInsert;
export type AtlasMessageEntity = typeof AtlasMessagesTable.$inferSelect;
export type AtlasMessageInsert = typeof AtlasMessagesTable.$inferInsert;
export type AtlasBriefShareTokenEntity =
  typeof AtlasBriefShareTokensTable.$inferSelect;
export type AtlasBriefShareTokenInsert =
  typeof AtlasBriefShareTokensTable.$inferInsert;
export type AtlasPassportShareTokenEntity =
  typeof AtlasPassportShareTokensTable.$inferSelect;
export type AtlasPassportShareTokenInsert =
  typeof AtlasPassportShareTokensTable.$inferInsert;
export type AtlasTelemetryEventEntity =
  typeof AtlasTelemetryEventsTable.$inferSelect;
export type AtlasTelemetryEventInsert =
  typeof AtlasTelemetryEventsTable.$inferInsert;
export type AtlasBlockEntity = typeof AtlasBlocksTable.$inferSelect;
export type AtlasBlockInsert = typeof AtlasBlocksTable.$inferInsert;
