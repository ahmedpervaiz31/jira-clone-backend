# Jira Backend API

A Node.js + Express + MongoDB backend for a Kanban/Jira-style app. This document explains how to run the server, environment variables, the data models, all API endpoints (request/response examples), and quick troubleshooting notes.

---

## Quick Start

1. Install dependencies:

```bash
cd jira-backend
npm install
```

2. Create a `.env` file (copy `samples/.env.sample`) and set values:

```
MONGO_URI=mongodb://localhost:27017/jira-clone
JWT_SECRET=your_jwt_secret
PORT=4000
FRONTEND_URL=http://localhost:5173
```

3. Start in development:

```bash
npm run dev
```

Server should log `MongoDB connected` and `Server running on port <PORT>`.

---

## Environment variables

- `MONGO_URI` — MongoDB connection string.
- `JWT_SECRET` — secret used to sign JWTs.
- `PORT` — listening port (default 4000).
- `FRONTEND_URL` — allowed CORS origin for browser requests.

---

## Models (Mongoose)

Files: [models/User.model.js](models/User.model.js), [models/Board.model.js](models/Board.model.js), [models/Task.model.js](models/Task.model.js)

- User

  - Schema fields:
    - `username` (String, required, unique)
    - `password` (String, required, hashed)

  - Notes: used for authentication; responses return an object with `id` (Mongo `_id`) and `username`.

- Board

  - Schema fields:
    - `name` (String, required)
    - `key` (String, required, unique)
    - `tasks` (Array of ObjectId references to Task documents)
    - `nextDisplayNumber` (Number) — internal counter used to generate monotonic task display numbers for the board

  - Notes: `tasks` contains task identifiers associated with the board.

- Task

  - Schema fields:
    - `title` (String, required)
    - `status` (String, required) — allowed values: `to_do`, `in_progress`, `done`
    - `boardId` (ObjectId ref 'Board', required)
    - `assignedTo` (String)
    - `description` (String)
    - `dueDate` (String | null)
    - `createdAt` (Date)
    - `order` (Number)
    - `displayId` (String) — human-friendly id like `AB-1` shown in the UI
    - `displayNumber` (Number) — numeric suffix used to build `displayId`

  - Notes: `boardId` is a Mongo ObjectId referencing the board. The API uses Mongo `_id` for primary identifiers.

---

## Middleware & Security

- JWT authentication middleware: [middleware/auth.middleware.js](middleware/auth.middleware.js)
  - Reads `Authorization: Bearer <token>` header, verifies token with `JWT_SECRET`, and attaches decoded payload to `req.user`.
- CORS: server applies CORS using `FRONTEND_URL` and allows `Authorization` header.

---

## API Reference

Base URL (local): `http://localhost:4000`

All responses are JSON. Protected endpoints require `Authorization: Bearer <token>` header.

### Health

- GET `/health`
  - Response: `{ "status": "ok" }`

### Authentication

Files: [routes/auth.routes.js](routes/auth.routes.js), [controllers/auth.controller.js](controllers/auth.controller.js)

- POST `/api/auth/register`
  - Purpose: create a new user
  - Headers: `Content-Type: application/json`
  - Body:

    ```json
    { "username": "alice", "password": "secret" }
    ```

  - Success (201):

    ```json
    {
      "token": "<jwt>",
      "user": { "id": "<mongo_id>", "username": "alice" }
    }
    ```

  - Errors:
    - `400` when username/password missing
    - `409` when username already exists
    - `500` on unexpected server errors

- POST `/api/auth/login`
  - Purpose: return JWT for valid credentials
  - Body: same shape as register
  - Success (200): same shape as register
  - Errors: `400` missing fields, `401` invalid credentials

- GET `/api/auth/me`
  - Headers: `Authorization: Bearer <token>`
  - Success: `{ "user": { "id": "<mongo_id>", "username": "alice" } }`

### Protected test route

- GET `/api/protected`
  - Purpose: quick endpoint for Postman/curl to validate tokens
  - Headers: `Authorization: Bearer <token>`
  - Success: `{ "user": { ...decoded token payload... } }`

### Boards

Files: [routes/board.routes.js](routes/board.routes.js), [controllers/board.controller.js](controllers/board.controller.js)

- GET `/api/boards`
  - Purpose: list boards (currently returns all boards)
  - Headers: `Authorization: Bearer <token>`
  - Success: array of board objects:

    ```json
    [ { "_id": "...", "name": "My Board", "key": "MB", "tasks": [ {"id":"...","title":"...","displayId":"MB-1"}, {"id":"...","title":"...","displayId":"MB-2"} ] } ]
    ```

- POST `/api/boards`
  - Body:
    ```json
    { "name": "New Board", "key": "NB" }
    ```
  - Success (201): created board object

- DELETE `/api/boards/:id`
  - Delete a board by Mongo `_id`.

### Tasks

Files: [routes/task.routes.js](routes/task.routes.js), [controllers/task.controller.js](controllers/task.controller.js)

- GET `/api/tasks?boardId=<boardId>`
  - Purpose: list tasks for a board
  - Query param: `boardId` (required)
  - Success: array of task objects

- POST `/api/tasks`
  - Body example:
    ```json
    {
      "title": "Fix bug",
      "status": "to_do",
      "boardId": "<board_mongo_id>",
      "description": "...",
      "assignedTo": "bob",
      "dueDate": "2025-12-31",
      "order": 1
    }
    ```
  - Notes: The server now generates and persists a human-friendly `displayId` for each created task (e.g. `AB-1`). The backend computes `displayNumber` using a monotonic counter stored on the parent `Board` (`nextDisplayNumber`) so deleted tasks do not cause display numbers to be reused.
  - Success (201): created task object (includes `_id`, `displayId`, and `createdAt`)

- PUT `/api/tasks/:id`
  - Path param: `id` — currently controller updates by custom `id` field if present; prefer using Mongo `_id`.
  - Body: partial fields to update

- DELETE `/api/tasks/:id`
  - Deletes task by id (see note about `_id` vs custom id below).
  - Notes: Deleting a task also removes its ObjectId reference from the parent board's `tasks` array.

---

## ID strategy and important notes

- Boards and Tasks use Mongo `_id` as primary identifiers. `Task.boardId` is an ObjectId referencing `Board`.
- CORS is configured to allow `FRONTEND_URL` and `Authorization` header.

---

## Example curl flows (testing)

Register:

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'
```

Login:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"pass123"}'
```

Use token to call protected route:

```bash
curl http://localhost:4000/api/protected -H "Authorization: Bearer <TOKEN>"
```

Create board example (with token):

```bash
curl -X POST http://localhost:4000/api/boards \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Board","key":"MB"}'
```

---

## Troubleshooting

- 500 errors at register: check server logs — common causes:
  - Mismatched model schema (e.g., model requires `email` while controller sends `username`).
  - DB connection failures (check `MongoDB connected` in server logs).
  - Ensure `JWT_SECRET` is set in `.env` and server restarted after changes.

- CORS errors: ensure `FRONTEND_URL` is set to your frontend origin (for local Vite dev: `http://localhost:5173`).

---