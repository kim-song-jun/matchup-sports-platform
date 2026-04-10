export const PAGINATION = {
  /** Default page size for cursor-paginated list endpoints. */
  DEFAULT_LIMIT: 20,
  /** Default page size for chat message history queries. */
  CHAT_MESSAGE_LIMIT: 30,
  /** Maximum rows returned for admin export/full-list queries (venues, payments). */
  ADMIN_EXPORT_LIMIT: 100,
} as const;
