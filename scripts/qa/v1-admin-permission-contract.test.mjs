import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminController = await readFile('apps/v1_api/src/admin/admin.controller.ts', 'utf8');
const adminService = await readFile('apps/v1_api/src/admin/admin.service.ts', 'utf8');
const adminPage = await readFile('apps/v1_web/src/components/community/admin-page.tsx', 'utf8');
const queryKeys = await readFile('apps/v1_web/src/lib/query-keys.ts', 'utf8');
const mswHandlers = await readFile('apps/v1_web/src/test/msw/handlers.ts', 'utf8');
const qaLib = await readFile('scripts/qa/v1-open-design-parity-lib.mjs', 'utf8');

test('Given active admin identity is required When frontend models admin access Then /admin/me exposes exact role capabilities', async () => {
  const adminHooks = await readFile('apps/v1_web/src/hooks/use-v1-admin-api.ts', 'utf8');
  const adminTypes = await readFile('apps/v1_web/src/types/admin-api.ts', 'utf8');

  assert.match(adminController, /@Get\('me'\)/);
  assert.match(adminService, /PERMISSION_DENIED/);
  assert.match(adminService, /Active admin access is required/);
  assert.match(adminHooks, /useV1AdminMe/);
  assert.match(adminHooks, /v1Get<V1AdminMe>\('\/admin\/me'\)/);
  assert.match(adminTypes, /export type V1AdminRole = 'owner' \| 'ops' \| 'support';/);
  assert.match(adminTypes, /export type V1AdminCapability = 'overview:read' \| 'status:write' \| 'logs:read' \| 'admin:owner';/);
  assert.match(queryKeys, /adminMe/);
  assert.match(mswHandlers, /\/admin\/me/);
});

test('Given support admins are read-only When status mutation is modeled Then UI and API contract keep mutation disabled', async () => {
  const adminHooks = await readFile('apps/v1_web/src/hooks/use-v1-admin-api.ts', 'utf8');
  const adminTypes = await readFile('apps/v1_web/src/types/admin-api.ts', 'utf8');

  assert.match(adminService, /Support admins cannot mutate status/);
  assert.match(adminPage, /support는 조회와 로그만 가능/);
  assert.match(adminPage, /상태 변경 권한 필요/);
  assert.doesNotMatch(adminPage, /처리 완료/);
  assert.match(adminTypes, /readonly capabilities: readonly V1AdminCapability\[\];/);
  assert.match(adminHooks, /useV1AdminStatusChangeLogs/);
  assert.match(adminHooks, /\/admin\/status-change-logs/);
});

test('Given admin mutations must be auditable When logs are fetched Then action and status-change logs are both represented', async () => {
  const adminHooks = await readFile('apps/v1_web/src/hooks/use-v1-admin-api.ts', 'utf8');
  const adminTypes = await readFile('apps/v1_web/src/types/admin-api.ts', 'utf8');

  assert.match(adminService, /v1AdminActionLog\.create/);
  assert.match(adminService, /v1StatusChangeLog\.create/);
  assert.match(adminTypes, /export type V1AdminActionLog/);
  assert.match(adminTypes, /export type V1AdminStatusChangeLog/);
  assert.match(adminTypes, /readonly beforeState: unknown;/);
  assert.match(adminTypes, /readonly afterState: unknown;/);
  assert.match(queryKeys, /adminStatusChangeLogs/);
  assert.match(mswHandlers, /\/admin\/action-logs/);
  assert.match(mswHandlers, /\/admin\/status-change-logs/);
  assert.match(adminHooks, /v1Get<CursorPage<V1AdminActionLog>>\('\/admin\/action-logs'/);
  assert.match(adminHooks, /v1Get<CursorPage<V1AdminStatusChangeLog>>\('\/admin\/status-change-logs'/);
});

test('Given browser QA captures admin routes When auth is injected Then the QA email can be set to an active admin account', () => {
  assert.match(qaLib, /process\.env\.V1_QA_AUTH_EMAIL/);
  assert.match(qaLib, /admin@teameet\.v1/);
});
