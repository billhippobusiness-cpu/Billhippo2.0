# BillHippo Tally Connector

A lightweight Windows tray app (Electron) that bridges the BillHippo web app and
a local **Tally Prime** instance. It signs in to Firebase as the user, watches
Firestore for pending sync jobs, talks to Tally's XML gateway on
`http://localhost:9000`, and reports results back to Firestore.

> **Status: Milestone C.** Pairing, Firebase auth with on-disk persistence, the
> heartbeat (drives the web "Connector online" pill), the job-watcher lifecycle,
> and all three Tally job handlers (`FETCH_LEDGERS`, `PUSH_INVOICE`,
> `CREATE_LEDGER`) with their XML request builders and response parsers are
> implemented. Remaining for Milestone D: a signed Windows installer, app icon,
> auto-update feed, and flipping the web feature flag on.

## How pairing works

No service-account keys ship with the app. Instead:

1. In BillHippo → **Accounts → Connector**, the user clicks *Generate pairing
   code* (calls the `tallyCreatePairingCode` Cloud Function).
2. The user pastes the code into this app's Settings window.
3. The connector calls `tallyExchangePairingCode`, receives a Firebase **custom
   token**, and signs in. The session is persisted on disk (electron-store), so
   it stays paired across restarts.

## Architecture

```
src/
  main.ts          Tray + settings window + lifecycle + IPC
  preload.ts       contextBridge API for the renderer
  config.ts        Public Firebase config + electron-store persistence
  firebaseClient.ts  initFirebase, custom Node auth persistence, pairing
  heartbeat.ts     Writes tallyConfig.lastHeartbeat every 30s + Tally ping
  jobWatcher.ts    Subscribes to pending syncJobs, claims + dispatches them
  tally/client.ts  HTTP client for the Tally XML gateway (ping + postXml)
  tally/xml.ts     Escaping, date/amount formatting, ledger doc-id hashing
  tally/builders.ts  Build XML: ledger-list export, sales voucher, ledger master
  tally/parse.ts   Parse XML: ledger list, import result (throws on Tally errors)
  tally/handlers.ts  FETCH_LEDGERS / PUSH_INVOICE / CREATE_LEDGER handlers
  shared/types.ts  Firestore doc shapes (mirrors the web app)
renderer/
  index.html       Settings UI
  renderer.js      Settings UI logic (talks to main via window.connector)
```

## Develop

```bash
cd connector
npm install
npm start          # builds TS and launches Electron
```

Provide the public Firebase web config via environment variables (the non-secret
web config — same values the website uses):

```
BILLHIPPO_FB_API_KEY=...
BILLHIPPO_FB_APP_ID=...
BILLHIPPO_FB_SENDER_ID=...
# authDomain / projectId / storageBucket default to the production project
```

## Build a Windows installer

```bash
npm run dist       # electron-builder --win → release/
```

Code-signing (EV/OV cert) and the auto-update feed are configured in Milestone D
(see `electron-builder.yml`).
