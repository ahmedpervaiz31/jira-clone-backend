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

### Authentication & User Search

Files: [routes/auth.routes.js](routes/auth.routes.js), [controllers/auth.controller.js](controllers/auth.controller.js)

- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login and get JWT
- `GET /api/auth/me` — Get current user (protected)
- `GET /api/auth/users?q=keyword` — Search users by username (for assignment/autocomplete)

Example response for GET `/api/auth/users?q=ali`:

```json
[
  { "_id": "...", "username": "alice" },
  { "_id": "...", "username": "alina" }
]
```

### Boards

Files: [routes/board.routes.js](routes/board.routes.js), [controllers/board.controller.js](controllers/board.controller.js)

- `GET /api/boards` — List all boards (protected)
- `GET /api/boards/search?q=keyword` — Search boards by name or key (protected)
- `GET /api/boards/:id` — Get a single board by ID (protected)
- `POST /api/boards` — Create a board (protected)
- `DELETE /api/boards/:id` — Delete a board by Mongo `_id` (protected, also deletes all its tasks)

Example response for GET `/api/boards`:

```json
[
  {
    "id": "...",
    "name": "My Board",
    "key": "MB",
    "tasks": [
      {"id": "...", "title": "...", "displayId": "MB-1"},
      {"id": "...", "title": "...", "displayId": "MB-2"}
    ]
  }
]
```

### Tasks

Files: [routes/task.routes.js](routes/task.routes.js), [controllers/task.controller.js](controllers/task.controller.js)

- `GET /api/tasks?boardId=<boardId>` — List all tasks for a board (protected)
- `GET /api/tasks/search?q=keyword&boardId=<id>` — Search tasks by title, description, displayId, or assignedTo (optionally filter by board, protected)
- `GET /api/tasks/assigned/:username` — Get all tasks assigned to a user (protected)
- `GET /api/tasks/:id` — Get a single task by ID (protected)
- `POST /api/tasks` — Create a new task (protected)
- `PUT /api/tasks/:id` — Update a task (edit, move, reorder, protected)
- `PUT /api/tasks/:id/move` — Move a task between statuses and reorder (protected)
- `DELETE /api/tasks/:id` — Delete a task (protected, also removes from board)

Example response for GET `/api/tasks/assigned/alice`:

```json
[
  {
    "id": "...",
    "title": "Fix bug",
    "status": "to_do",
    "boardId": "...",
    "assignedTo": "alice",
    "description": "...",
    "dueDate": "2025-12-31",
    "createdAt": "2025-12-22T12:00:00.000Z",
    "order": 1,
    "displayId": "MB-1"
  }
]
```

### Protected test route

- `GET /api/protected` — Quick endpoint for Postman/curl to validate tokens (protected)

---

## ID strategy and important notes

- Boards and Tasks use Mongo `_id` as primary identifiers. `Task.boardId` is an ObjectId referencing `Board`.
- CORS is configured to allow `FRONTEND_URL` and `Authorization` header.
- Deleting a board also deletes all its tasks (cascading delete).

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

# New endpoint examples

Search tasks:
```bash
curl http://localhost:4000/api/tasks/search?q=bug -H "Authorization: Bearer <TOKEN>"
```

Get tasks assigned to a user:
```bash
curl http://localhost:4000/api/tasks/assigned/alice -H "Authorization: Bearer <TOKEN>"
```

Search boards:
```bash
curl http://localhost:4000/api/boards/search?q=frontend -H "Authorization: Bearer <TOKEN>"
```

Search users:
```bash
curl http://localhost:4000/api/auth/users?q=ali
```

---

## Troubleshooting

- 500 errors at register: check server logs — common causes:
  - Mismatched model schema (e.g., model requires `email` while controller sends `username`).
  - DB connection failures (check `MongoDB connected` in server logs).
  - Ensure `JWT_SECRET` is set in `.env` and server restarted after changes.

- CORS errors: ensure `FRONTEND_URL` is set to your frontend origin (for local Vite dev: `http://localhost:5173`).

---