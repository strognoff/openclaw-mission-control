Build a production-ready web application called **OpenClaw Mission Control**.  
The purpose of this application is to provide a live dashboard showing what all of my OpenClaw bots are doing in real time.  
I already have an existing VPS and domain infrastructure.  
Do NOT use Docker.  
The API must be hosted under:  
[https://api.menuboard.online/v1/agents](https://api.menuboard.online/v1/agents)  
The dashboard must be hosted under:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
I already have an OpenClaw bot running on this VPS. Use that bot as the first real integration/test agent.  
Do not create unnecessary new infrastructure if the existing VPS/web server/database setup can be reused safely.  
## First: inspect the existing VPS  
Before changing anything, inspect the machine and determine:  
* Linux distribution/version  
* Node.js version  
* npm/pnpm availability  
* OpenClaw version  
* OpenClaw installation location  
* OpenClaw config location  
* How OpenClaw is currently running  
* Whether it uses systemd, PM2, another service manager, or a manual process  
* Existing web server  
* Nginx/Apache/Caddy configuration  
* Existing MenuBoard deployment  
* Existing API deployment  
* Existing SSL configuration  
* Existing databases  
* Existing firewall rules relevant to the application  
* Existing directory structure  
Do not overwrite or break the existing MenuBoard application.  
Back up any configuration file before modifying it.  
## Architecture  
Build three main components:  
1. Mission Control backend API  
2. Mission Control dashboard  
3. OpenClaw Mission Control plugin/integration  
Preferred technology:  
* Node.js  
* TypeScript  
* Next.js if appropriate for the existing MenuBoard stack  
* Tailwind CSS  
* SQLite initially, unless the VPS already has a suitable PostgreSQL/MySQL database that can be safely reused  
* Prisma ORM where appropriate  
* Server-Sent Events for real-time updates  
Keep the architecture straightforward and lightweight.  
No Docker.  
## URLs  
The public API base URL must be:  
[https://api.menuboard.online/v1/agents](https://api.menuboard.online/v1/agents)  
The web dashboard must be:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
Design routing around those existing URLs.  
For example, API endpoints may become:  
POST https://api.menuboard.online/v1/agents/register  
POST https://api.menuboard.online/v1/agents/events  
POST https://api.menuboard.online/v1/agents/heartbeat  
GET https://api.menuboard.online/v1/agents  
GET https://api.menuboard.online/v1/agents/:id  
GET https://api.menuboard.online/v1/agents/:id/events  
GET https://api.menuboard.online/v1/agents/:id/runs  
GET https://api.menuboard.online/v1/agents/events/stream  
If the existing MenuBoard API architecture requires slightly different routing, adapt it cleanly while preserving:  
[https://api.menuboard.online/v1/agents](https://api.menuboard.online/v1/agents)  
as the base endpoint.  
## Dashboard  
Create the Mission Control dashboard at:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
It should look like part of the MenuBoard ecosystem but function as an OpenClaw operations dashboard.  
Title:  
**OpenClaw Mission Control**  
Dark mode is preferred.  
The dashboard must work well on desktop and iPhone.  
## Dashboard summary  
At the top show:  
* Agents online  
* Agents working  
* Agents idle  
* Agents offline  
* Tasks completed today  
* Failed tasks today  
* Tool calls today  
Example:  
OpenClaw Mission Control  
Online: 4 Working: 2 Idle: 1 Offline: 1 Tasks today: 37  
## Agent cards  
Show one card for every registered OpenClaw bot.  
Each card should display:  
* Friendly name  
* Agent ID  
* Status  
* Hostname  
* Platform  
* OpenClaw version  
* Model/provider where available  
* Current task  
* Current activity  
* Current tool  
* Current run duration  
* Last heartbeat  
* Last completed task  
* Error state if applicable  
Statuses:  
* IDLE  
* WORKING  
* THINKING  
* TOOL  
* WAITING  
* COMPLETE  
* ERROR  
* OFFLINE  
Use clear visual indicators.  
## Agent details  
Clicking an agent should open something like:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
Show:  
* Current run  
* Current task  
* Status  
* Model  
* Provider  
* Host  
* Platform  
* OpenClaw version  
* Start time  
* Elapsed duration  
* Session ID  
* Run ID  
* Last heartbeat  
Then show a chronological activity stream.  
Example:  
14:12:03 — Task started 14:12:04 — Thinking 14:12:07 — Tool started: browser 14:12:11 — Tool completed: browser 14:12:14 — Tool started: shell 14:12:20 — Tool completed: shell 14:12:23 — Thinking 14:12:28 — Task completed  
The activity should update without manually refreshing the page.  
Use Server-Sent Events unless there is a strong technical reason to use WebSockets.  
## Global live activity feed  
Also provide a live activity feed across all agents.  
Example:  
[14:12](x-apple-data-detectors://embedded-result/4308) Developer Bot — shell started 14:11 YouTube Bot — generating scene 4/6 14:10 Assistant Bot — task completed 14:09 Research Bot — browser search  
## OpenClaw integration  
This is the most important part.  
Do NOT rely on the agent prompt telling the agent to update the dashboard.  
The monitoring must happen automatically through OpenClaw lifecycle/plugin hooks.  
First inspect the installed OpenClaw version on this VPS.  
Then inspect its currently supported:  
* plugin API  
* lifecycle hooks  
* tool hooks  
* agent/run hooks  
* event system  
* configuration mechanism  
Do not assume hook names.  
Implement using the actual API supported by the installed OpenClaw version.  
Create an integration/plugin named something similar to:  
openclaw-mission-control  
The integration should detect and report events such as:  
* OpenClaw starts  
* Agent becomes available  
* Run starts  
* Agent starts thinking  
* Tool call starts  
* Tool call completes  
* Tool call fails  
* Agent waits  
* Run completes  
* Run fails  
* Agent shuts down  
* Heartbeat  
## Tester  
The OpenClaw bot already running on this VPS will be the first test agent.  
Register it with a sensible ID such as:  
vps-main  
or derive an appropriate stable ID from the existing hostname/configuration.  
Give it a friendly name such as:  
VPS Agent  
Do not make assumptions if the existing agent already has a configured name. Reuse the configured name where available.  
Once the system is implemented:  
1. Connect this VPS OpenClaw bot.  
2. Confirm it appears at: [https://menuboard.online/agents/](https://menuboard.online/agents/)  
3. Run a simple test task.  
4. Verify that its status changes from IDLE to WORKING.  
5. Verify THINKING/tool events appear.  
6. Verify tool completion appears.  
7. Verify the task changes to COMPLETE.  
8. Verify it eventually returns to IDLE.  
9. Verify event history is persisted.  
10. Verify stopping the agent eventually changes it to OFFLINE.  
## Event format  
Use a normalized event structure similar to:  
```
{
  "agentId": "vps-main",
  "agentName": "VPS Agent",
  "runId": "run-abc123",
  "sessionId": "session-xyz456",
  "host": "server-hostname",
  "platform": "linux",
  "type": "tool_started",
  "status": "TOOL",
  "task": "Test Mission Control",
  "activity": "Executing shell tool",
  "tool": "shell",
  "timestamp": "2026-09-10T13:12:03Z"
}

```
Supported events should include:  
* agent_online  
* agent_offline  
* run_started  
* run_completed  
* run_failed  
* thinking  
* tool_started  
* tool_completed  
* tool_failed  
* waiting  
* heartbeat  
* status_changed  
## Task description  
Where possible, show a concise description of what the agent is currently doing.  
Do NOT transmit the complete system prompt or full user prompt.  
Generate or capture a safe short task label such as:  
“Update Mission Control dashboard”  
instead of transmitting sensitive context.  
## Progress tracking  
Support optional progress fields:  
* progressCurrent  
* progressTotal  
* progressPercent  
* progressLabel  
For example:  
Generating video Scene 4 of 6 67%  
These fields are optional because many OpenClaw tasks will not have measurable progress.  
## Privacy and security  
This is critical.  
Never transmit or store:  
* API keys  
* tokens  
* passwords  
* credentials  
* cookies  
* complete prompts  
* complete model responses  
* email bodies  
* private file contents  
* shell output  
* environment variables  
* authorization headers  
* browser session information  
Create a dedicated sanitisation layer in the OpenClaw integration before events are sent.  
Only metadata should be transmitted.  
## API authentication  
Each OpenClaw bot should authenticate to the API using its own agent token.  
Example environment/config values:  
MISSION_CONTROL_URL=https://api.menuboard.online/v1/agents  
MISSION_CONTROL_AGENT_ID=vps-main  
MISSION_CONTROL_AGENT_NAME=“VPS Agent”  
MISSION_CONTROL_API_KEY=  
Do not hardcode credentials.  
Prefer a separate API key per agent so individual agents can later be revoked.  
Store hashes of API keys server-side where practical rather than plaintext.  
## Dashboard authentication  
The page:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
must not be publicly accessible unless the existing MenuBoard authentication system already provides appropriate protection.  
First inspect how MenuBoard authenticates users.  
If possible, reuse the existing MenuBoard login/session system.  
Prefer this rather than creating a second login mechanism.  
If reusing the existing auth system is not practical, implement secure authentication specifically for Mission Control.  
## Heartbeats  
Each connected OpenClaw bot should periodically send a heartbeat.  
Default:  
every 30 seconds.  
If there has been no heartbeat for 90 seconds:  
status = OFFLINE  
Make these values configurable.  
The heartbeat mechanism should not create excessive database records.  
Store current heartbeat status separately or periodically clean old heartbeat events.  
## Persistence  
Store:  
Agents  
Runs  
Events  
Agent tokens/credentials metadata  
Suggested Agent fields:  
* id  
* name  
* hostname  
* platform  
* openclawVersion  
* currentStatus  
* currentTask  
* currentActivity  
* currentTool  
* provider  
* model  
* lastHeartbeat  
* lastSeen  
* createdAt  
* updatedAt  
Suggested Run fields:  
* id  
* agentId  
* sessionId  
* task  
* status  
* provider  
* model  
* startedAt  
* completedAt  
* durationMs  
* toolCallCount  
* errorSummary  
Suggested Event fields:  
* id  
* agentId  
* runId  
* type  
* status  
* activity  
* tool  
* timestamp  
* safe metadata JSON  
Add appropriate indexes.  
## Resilience  
Mission Control must never interfere with OpenClaw itself.  
If:  
[api.menuboard.online](http://api.menuboard.online)  
is down, slow, unavailable, or returns an error:  
OpenClaw must continue normally.  
The integration must:  
* use short HTTP timeouts  
* send events asynchronously  
* catch all monitoring errors  
* never throw monitoring failures into the agent execution path  
* use bounded retries  
* optionally maintain a small local bounded event queue  
* discard oldest monitoring events if the queue becomes full  
Monitoring is always secondary to the actual OpenClaw work.  
## Existing VPS deployment  
Do NOT use Docker.  
Use the existing VPS process-management approach where possible.  
If the server already uses PM2, use PM2.  
If the existing application uses systemd, use systemd.  
Avoid adding another process manager unless necessary.  
The service should automatically restart after VPS reboot.  
Possible service names:  
menuboard-agents-api  
menuboard-agents-web  
or integrate the functionality into the existing MenuBoard services if that architecture is cleaner.  
## Existing Nginx / reverse proxy  
Inspect the current reverse proxy configuration.  
Configure:  
[https://api.menuboard.online/v1/agents](https://api.menuboard.online/v1/agents)  
to route to the backend service.  
Configure:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
to route to the dashboard.  
Do not break existing routes.  
Back up Nginx/Caddy/Apache configuration before changes.  
Run configuration validation before reload.  
For Nginx:  
nginx -t  
must succeed before reloading.  
Never restart the web server blindly.  
Prefer reload over restart.  
## SSL  
Reuse the existing SSL certificates/configuration if possible.  
Do not request new certificates unnecessarily.  
Confirm both:  
[https://api.menuboard.online](https://api.menuboard.online)  
and  
[https://menuboard.online](https://menuboard.online)  
already have valid certificates.  
If configuration adjustments are needed, preserve the existing certificate management approach.  
## Application location  
Inspect the existing MenuBoard directory layout first.  
Prefer an appropriate location such as:  
/opt/menuboard/agents  
or  
/var/www/menuboard/agents  
but do not create arbitrary directories before understanding the existing structure.  
The Mission Control source code should live somewhere logical alongside the existing MenuBoard deployment.  
## Logging  
Add lightweight structured logging.  
Backend logs should include:  
* API startup  
* database failures  
* authentication failures  
* malformed events  
* SSE connections  
* unexpected application errors  
Do not log API keys or private event payloads.  
The OpenClaw plugin should log only important monitoring problems and should not flood OpenClaw logs.  
## Retention  
Do not allow the events table to grow forever.  
Implement configurable retention.  
Default:  
Keep detailed events for 30 days.  
Keep run summaries longer.  
Create a safe cleanup process.  
This can be:  
* cron  
* systemd timer  
* application scheduled cleanup  
Use whatever best fits the VPS.  
## Future controls  
Design the frontend/data model so future versions can support:  
* Send task  
* Wake agent  
* Stop task  
* Pause agent  
* Restart agent  
* Trigger cron job  
* View scheduled jobs  
DO NOT implement arbitrary remote shell execution.  
Version 1 is monitoring only.  
## Installation for future OpenClaw bots  
Once the VPS test bot works, document exactly how to connect another bot.  
The target process should be simple.  
For example:  
Install Mission Control plugin.  
Configure:  
MISSION_CONTROL_URL=https://api.menuboard.online/v1/agents MISSION_CONTROL_AGENT_ID=youtube-bot MISSION_CONTROL_AGENT_NAME=“YouTube Bot” MISSION_CONTROL_API_KEY=xxxx  
Restart/reload OpenClaw.  
Agent appears automatically at:  
[https://menuboard.online/agents/](https://menuboard.online/agents/)  
Adapt these instructions to the actual OpenClaw configuration system.  
## UI polish  
Make the dashboard visually polished.  
Each agent should have a compact status card.  
Example:  
VPS Agent  
● WORKING  
Task Testing Mission Control  
Current Activity shell  
Host my-vps  
Model GPT-5.6  
Running 01:24  
Last heartbeat 5 seconds ago  
Clicking the card should open detailed history.  
## Testing  
Implement automated tests for:  
* agent registration  
* agent authentication  
* API-key rejection  
* event ingestion  
* event sanitisation  
* run start  
* run completion  
* run failure  
* heartbeat handling  
* offline detection  
* SSE delivery  
* database persistence  
* malformed events  
* API unavailable behavior from plugin  
* plugin retry behaviour  
Then conduct a real end-to-end test with the existing VPS OpenClaw bot.  
## Safe change procedure  
Before making infrastructure changes:  
1. Inspect.  
2. Understand existing architecture.  
3. Back up files that will be changed.  
4. Make the minimum necessary changes.  
5. Validate configuration.  
6. Reload services safely.  
7. Verify existing MenuBoard functionality still works.  
8. Verify Mission Control.  
9. Verify OpenClaw still works normally.  
Do not unnecessarily modify unrelated MenuBoard components.  
## Definition of done  
The work is complete when:  
* [https://menuboard.online/agents/](https://menuboard.online/agents/) loads correctly.  
* Authentication works.  
* The VPS OpenClaw bot appears automatically.  
* It shows ONLINE while connected.  
* Starting an OpenClaw task changes it to WORKING.  
* Thinking state appears where detectable.  
* Tool calls appear live.  
* Tool completions appear live.  
* Completed tasks are stored as runs.  
* The browser updates without refresh.  
* Heartbeats work.  
* The bot becomes OFFLINE if it disappears.  
* Historical runs can be viewed.  
* Detailed events can be viewed.  
* No sensitive information is exposed.  
* Existing MenuBoard functionality remains operational.  
* Existing [api.menuboard.online](http://api.menuboard.online) functionality remains operational.  
* OpenClaw continues functioning when Mission Control is unavailable.  
* The setup survives a VPS reboot.  
* Documentation explains exactly how to connect my other OpenClaw bots.  
## Final report  
After completing the implementation, report back with:  
1. The dashboard URL.  
2. The API URL.  
3. The name/ID of the VPS test agent.  
4. Screenshot or textual verification of the live test.  
5. Where the Mission Control source code is installed.  
6. Database location.  
7. Services/processes created or modified.  
8. Nginx/Apache/Caddy files modified.  
9. OpenClaw files/config modified.  
10. How to start the Mission Control services.  
11. How to stop them.  
12. How to restart them.  
13. How to view logs.  
14. How to add a second OpenClaw bot.  
15. How to generate/revoke an agent API key.  
16. Any limitations discovered in the currently installed OpenClaw hook API.  
17. Any recommended next improvements.  
Do not stop at writing the code.  
Actually deploy it on this VPS, connect the existing OpenClaw bot, perform a real task, and verify that the complete flow works:  
OpenClaw → Mission Control plugin → https://api.menuboard.online/v1/agents → database → live SSE → https://menuboard.online/agents/  
