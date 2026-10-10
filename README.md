# Linn IT Solutions — Linn Tasks 1.5.0

Mobile-first employee task delegation system for Linn IT Solutions. The default user interface is Myanmar language and the application can be installed as a PWA on Android and iPhone.

**Production:** https://linn-it-task-hub.linn-it-solu-5603.chatgpt.site/

## Project specification

### Purpose

Linn Tasks gives Management, administrators and employees one shared place to assign work, follow deadlines and report progress. It replaces informal task assignment with an auditable workflow that works on phones and desktop browsers.

### User roles

| Role | Main permissions |
| --- | --- |
| CEO | Full dashboard access, task and employee management, Admin role management, team backup and reporting |
| Admin / Management | Create and assign tasks, manage employees within role limits, review progress and receive deadline alerts |
| Employee | View assigned or collaborative tasks, update status/progress, add comments and upload attachments |

Every API request checks the signed-in employee's active status, role and task membership. There is no public registration.

### Functional scope

- Task title and detailed instructions
- One or multiple assignees
- Separate collaborator list
- Start date/time and completion deadline in Myanmar Standard Time
- Priority, status, progress percentage and reminder setting
- Comments and private file attachments up to 10 MB each
- Inline thumbnail and full-screen preview for safe photo formats, with original-file download
- CEO/Admin dashboard, workload summary and deadline views
- Employee directory and editable display name/department
- Email/password authentication with temporary-password first login
- Persistent in-app notifications with per-user read state and a four-second open-app sync fallback
- Encrypted Web Push for task events and deadline reminders
- Hourly unattended deadline checks, plus an immediate check while the app is open
- CSV task export and JSON team backup metadata
- Installable Android/iPhone PWA with Home Screen shortcuts
- Optional signed Android WebView APK

### Notification behavior

Task creation, updates, comments and attachments notify relevant task members and administrators, excluding the person who performed the action. An unfinished task that reaches or passes its deadline generates a deduplicated notification for the CEO, active Admin users and relevant task members.

The production Site has an enabled hourly cloud schedule named **Linn Tasks Deadline စစ်ဆေးမှု**. Opening the authenticated app also triggers a shared deadline check. Push delivery requires each phone to install/open the PWA and grant notification permission once. A received Web Push event refreshes the open application immediately. When Web Push is unavailable, the open application checks for new notices every four seconds and refreshes the affected task automatically.

JPEG, PNG, GIF, WebP and AVIF attachments are displayed as authenticated thumbnails and can be opened in a full-screen viewer. SVG and other attachment formats remain download-only so active content is never rendered inline.

### Security requirements

- Passwords: bcryptjs with random salt and cost 12
- Minimum password length: 8 Unicode characters; maximum: bcrypt's 72 UTF-8 byte limit
- Sessions: random 256-bit tokens; only SHA-256 token hashes are stored
- Cookie: `__Host-linn-session`, Secure, HttpOnly and SameSite=Lax
- Session lifetime: 24 hours
- Same-origin and custom-header checks on mutation endpoints
- Shared D1 login rate limits by email and IP
- Role and task-membership authorization on server endpoints and downloads
- Authenticated API responses excluded from browser/offline caches
- Generic encrypted lock-screen push payloads without task details
- Push endpoints restricted to supported browser push providers
- Runtime secrets excluded from source, client assets and deployment manifests

### Current limitations

- Offline mode caches the application shell; current task data and mutations require internet access.
- The Java WebView APK does not implement the browser PWA Push API. Use the installed PWA for background phone notifications.
- Native APK background push would require a native messaging provider and a rebuilt APK.
- SMS, automatic invitation/reset email and automatic CEO recovery are not configured.
- JSON backup contains attachment metadata, not attachment bytes, and there is no restore screen yet.
- Cloud deadline checks run hourly, so a background alert can arrive up to approximately one hour after a deadline. An open app checks sooner.

## Tech stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web UI | HTML5, CSS3, vanilla JavaScript ES modules | Myanmar UI, responsive screens, task workflow and install experience |
| PWA | Web App Manifest, Service Worker, Cache API | Android/iPhone installation, Home Screen shortcuts and offline shell |
| API runtime | Cloudflare-compatible Worker, JavaScript ES2022 | Authentication, authorization, tasks, notifications, files and MCP endpoint |
| Database | D1 / SQLite with SQL migrations | Employees, credentials, sessions, tasks, comments, notifications and rate limits |
| File storage | R2 object storage | Private task attachments |
| Authentication | `bcryptjs` 3.0.2, Web Crypto API | Password hashes, session tokens and activation/reset controls |
| Web Push | `@block65/webcrypto-web-push` 2.0.0 | RFC 8291 encrypted payloads and RFC 8292 VAPID authorization |
| Bundling | esbuild 0.25.10 | Worker dependency bundle and production build |
| Tests | Node.js test runner and `node:sqlite` | API, security, notification and PWA behavior |
| Hosting | ChatGPT Sites | Source/version deployment, Worker runtime, D1/R2 bindings and cloud automation |
| Android wrapper | Java, Android SDK Build Tools 35, JDK 17 | Optional signed WebView APK, minimum Android API 24 |

The application intentionally avoids a frontend framework. Static PWA assets are embedded in the Worker bundle by `scripts/build.mjs`.

## Repository layout

```text
.openai/hosting.json     Sites project and runtime binding declarations
android/                 Java WebView wrapper, manifest and resources
drizzle/                 Additive D1/SQLite schema migrations
scripts/                 Build, preview, test and Android packaging scripts
web/                     PWA HTML, CSS, JavaScript, manifest and service worker
worker/                  API, authentication, notifications, MCP and static assets
dist/                    Generated production deployment artifact
outputs/                 Generated APK or release deliverables
```

## Local development

Node.js 24 or newer is required because the local test/preview database uses `node:sqlite`.

```text
npm ci
npm test
npm run build
npm run dev
```

The local preview runs at `http://127.0.0.1:4173` and uses `.local/preview.db` plus `.local/uploads`. These are separate from production and excluded from source control.

A new preview database seeds `owner@local.test` as the CEO without a password. Generate a cryptographically secure 64-character hexadecimal token, set `ADMIN_SETUP_TOKEN` and a future ISO time in `ADMIN_SETUP_EXPIRES_AT`, start the preview, then open:

```text
http://127.0.0.1:4173/#activate=<token>
```

Do not store real credentials or recovery tokens in source files.

## Authentication operations

Employees sign in with their roster email and password. New employee accounts receive the configured temporary password and must replace it during first login before task APIs become available. Admins can reset employee temporary passwords; only the CEO can manage Admin credentials and roles.

Users with a known password can use **ဆက်တင်များ → Password ပြောင်းရန်**. Password changes, completed resets, logout, account deactivation and session expiry revoke the affected sessions and push bindings.

Production uses the following runtime settings:

| Variable | Secret | Purpose |
| --- | --- | --- |
| `EMPLOYEE_DEFAULT_PASSWORD` | Yes | Initial/reset temporary employee password |
| `ADMIN_SETUP_TOKEN` | Yes | One-use initial CEO setup token for a fresh environment |
| `ADMIN_SETUP_EXPIRES_AT` | No | ISO expiry time for initial CEO setup |
| `VAPID_PUBLIC_KEY` | No | Browser Web Push subscription key |
| `VAPID_PRIVATE_KEY` | Yes | Web Push signing key |
| `VAPID_SUBJECT` | No | VAPID contact, normally a `mailto:` value |

Existing employee passwords and IDs are preserved by additive migrations. Never modify a migration that has already been applied to production; add a new numbered migration instead.

## Deployment plan

### 1. Prepare the release

1. Update the application version in `package.json` and `package-lock.json`.
2. Add new database changes as an additive SQL migration under `drizzle/` and update the migration journal.
3. Update the service-worker cache name when static PWA assets change so installed phones receive the new shell.
4. Keep `.openai/hosting.json` project ID unchanged:

```json
{
  "project_id": "appgprj_6ac9e79e363481918f8cd826d3c643b1",
  "d1": "DB",
  "r2": "BUCKET",
  "capabilities": ["mcp"]
}
```

### 2. Validate before publication

```text
npm ci
npm test
npm run build
```

The current suite contains 22 automated tests covering authentication, role/task access, temporary passwords, employee provisioning, profile editing, comments/attachments and safe photo previews, notification recipients and read state, deadline deduplication, MCP deadline checks, PWA metadata, SSRF prevention, encrypted Web Push, VAPID signatures and revoked-session delivery restrictions.

Also perform browser checks at phone, tablet and desktop widths. Verify sign-in, dashboard, task creation/editing, employee management, notification permission/test, install instructions and lack of horizontal overflow.

### 3. Publish the PWA/API

1. Use the Sites source workflow to synchronize the existing Site checkout; do not create a new Site.
2. Build and package the exact Git commit into a deployment archive containing `dist/` and `.openai/drizzle`.
3. Save a new Site version from that commit and archive.
4. Deploy the saved version while preserving the current public audience and all D1/R2 bindings.
5. Wait for a terminal `succeeded` deployment state and verify the production URL.
6. Confirm that the MCP endpoint is ready and the hourly deadline schedule remains enabled after deployment.

The Site workflow owns Git synchronization and archive packaging. The source commit used to save a version must exactly match the packaged archive.

### 4. Production smoke test

- Sign in with a non-temporary CEO/Admin account.
- Open all main screens and confirm existing tasks/employees remain present.
- Create or use a disposable test task to validate assignment, progress and comments.
- Confirm an in-app notification appears and mark it as read.
- On one authorized phone, install the PWA, enable notifications and use **စမ်းပို့ရန်**.
- Confirm the manifest/icon/install prompt on Android Chrome and Add to Home Screen instructions on iPhone Safari.
- Confirm the Site automation is enabled in `Asia/Rangoon` timezone.

### 5. Rollback and recovery

- Application rollback: redeploy the last known-good saved Site version.
- Database rollback: use a forward corrective migration. Do not edit or delete an applied migration.
- Attachment recovery: restore from the storage provider's backup/versioning process when available.
- Credential incident: rotate affected runtime secrets, revoke sessions and rebind push devices.
- Keep the Android signing key and its password securely backed up. Losing the original key prevents an in-place APK update.

### 6. Release monitoring

For the first business day after a release, check authentication errors, Worker failures, D1 migration results, R2 uploads, notification delivery failures and the deadline automation's last-run state. Record the deployed Site version, Git commit and smoke-test result in the release log.

## Android APK

Run the following only on a machine with Android SDK, Build Tools 35 and JDK 17 installed:

```text
npm run build:apk
```

The script compiles the Java wrapper, creates a signed APK and verifies its signature. The current output path is `outputs/Linn-Tasks-1.0.0.apk`. The local signing key and password are stored under `.local/` and excluded from deployment archives. Preserve the same signing key for every update.

The APK loads the production web application, so most UI/API releases appear after refresh without rebuilding the APK. Rebuild it when native Java, Android resources, manifest settings or the target/minimum SDK changes.

## PWA installation and phone notifications

- **Android:** Chrome → Install app, or **ဆက်တင်များ → ထည့်ရန်**.
- **iPhone:** Safari → Share → Add to Home Screen → Add.
- Open the installed app, then choose **အသိပေးချက်များ → သတိပေးခွင့်ဖွင့်ရန် → စမ်းပို့ရန်**.

The push-service acceptance response confirms that the server delivered the encrypted request to the provider. Final lock-screen display still depends on the phone's operating-system settings, network state and notification permission.

## Verification status

- Automated tests: 22 passing
- Production Site version: use the latest successful version shown in the Sites project deployment history
- Application version: 1.5.0
- Responsive checks: phone, tablet and desktop layouts; 16 px base text; no horizontal page overflow observed
- PWA checks: Android/iPhone metadata, manifest shortcuts, service worker push-to-app refresh and install guidance
- Production deadline automation: enabled hourly in `Asia/Rangoon`

## Third-party libraries

- bcrypt.js: https://github.com/dcodeIO/bcrypt.js — BSD-3-Clause
- webcrypto-web-push: https://github.com/block65/webcrypto-web-push — MIT
- iOS Web Push requirements: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
