# Morpheus - Dupip's Content Presence Website

What: Legacy Next.js SSG Engine, Contentful

## Getting Started

```
cp .env.public .env.local
nvm use v20
npm ci
npm run dev
```

Documentation: TBD

## MCP server + Telnyx voice assistant

Dupip exposes an MCP server at `/api/mcp` (tools: `web_auth`,
`phone_auth_by_callerid`, `phone_query_user_data`, `phone_record_message`)
backed by a Telnyx Edge Function (`edge/dupip-mcp-edge/`) and an AI Assistant
conversation workflow, so friends can call and catch up asynchronously.

- Plan: `docs/plans/phase-12-mcp-voice-assistant.md`
- Runbook + demo script: `docs/mcp-voice-assistant.md`
- Edge function + assistant workflow config: `edge/dupip-mcp-edge/`

## Unread chat email cron

- Vercel cron schedule is defined in `vercel.json` and calls `/api/cron/unread-chat-emails` daily.
- Set `CRON_SECRET` so the cron route only accepts authorized requests.
- Configure Brevo SMTP with `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `BREVO_SMTP_FROM_EMAIL`, and optional `BREVO_SMTP_FROM_NAME`.
- Apply the Prisma schema change before running the cron in a real environment (for example with `npx prisma db push`).
- Unread chat summary emails intentionally omit message contents for privacy, send when a user has new unread chat messages, and can re-notify messages that remain unread after 3 days.

Nightly Environment: https://beta.dupip.com

Production Environment: https://www.dupip.com

--------
| [![Hippocratic License HL3-ECO](https://img.shields.io/static/v1?label=Hippocratic%20License&message=HL3-ECO&labelColor=5e2751&color=bc8c3d)](https://firstdonoharm.dev/version/3/0/eco.html)  | 
[![License: CC BY-NC-ND 4.0](https://licensebuttons.net/l/by-nc-nd/4.0/80x15.png)](https://creativecommons.org/licenses/by-nc-nd/4.0/)  |
--------

Purizu di Angelo Reale Caldeira de Lemos and Remotelys Portais de Internet Ltda dba Dupip.

P.IVA IT02925300903
REA 572763
CNPJ 37.553.462/0001-46
