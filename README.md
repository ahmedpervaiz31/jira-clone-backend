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
    - `tasks` (Array of String references to Task IDs)

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
    [ { "_id": "...", "name": "My Board", "key": "MB", "tasks": ["taskId1", "taskId2"] } ]
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
  - Success (201): created task object (including `_id` and `createdAt`)

- PUT `/api/tasks/:id`
  - Path param: `id` — currently controller updates by custom `id` field if present; prefer using Mongo `_id`.
  - Body: partial fields to update

- DELETE `/api/tasks/:id`
  - Deletes task by id (see note about `_id` vs custom id below).

---

## ID strategy and important notes

- Boards and Tasks use Mongo `_id` as primary identifiers. `Task.boardId` is an ObjectId referencing `Board`.
- Some controllers historically used a custom `id` field; current code primarily uses Mongo `_id` for creation and retrieval — if the frontend expects a different `id` field, you should normalize either on the frontend or update controllers to map `_id` → `id` in responses.
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

## Next improvements (suggested)

- Add request validation (express-validator or Joi) for all endpoints.
- Scope boards/tasks to the authenticated user (add `owner` to Board and Task and filter by `req.user.id`).
- Normalize ID usage: always include `id` in responses alongside `_id` if frontend expects `id`.
- Add a search endpoint for tasks to support the frontend search feature.

---

If you want, I can also generate a short OpenAPI spec or Postman collection from this README to make frontend integration easier — tell me which you prefer.
# Jira Backend API

A Node.js + Express + MongoDB backend for a simple Kanban/Jira clone. This backend provides authentication, board, and task management APIs, using JWT for authentication and Mongoose for data modeling.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Setup & Running](#setup--running)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
  - [Authentication](#authentication)
  - [Boards](#boards)
  - [Tasks](#tasks)
- [File-by-File Explanation](#file-by-file-explanation)

---

## Project Structure

```
jira-backend/
  server.js
  database/
    Mongo.database.js
  middleware/
    auth.middleware.js
  models/
    User.model.js
    Board.model.js
    Task.model.js
  controllers/
    auth.controller.js
    board.controller.js
    task.controller.js
  routes/
    auth.routes.js
    board.routes.js
    task.routes.js
  package.json
```

---

## Setup & Running

1. **Install dependencies:**
   ```
   npm install
   ```

2. **Set environment variables:**  
   Create a `.env` file with:
   ```
   MONGO_URI=mongodb://localhost:27017/jira-clone
   JWT_SECRET=your_jwt_secret
   PORT=4000
   ```

3. **Start the server:**
   ```
   npm run dev
   ```
   or
   ```
   node server.js
   ```

---

## Environment Variables

- `MONGO_URI`: MongoDB connection string.
- `JWT_SECRET`: Secret for signing JWT tokens.
- `PORT`: Port to run the server (default: 4000).

---

## API Overview

All endpoints (except `/api/auth/register` and `/api/auth/login`) require a JWT token in the `Authorization: Bearer <token>` header.

### Authentication

- `POST /api/auth/register`  
  Register a new user.  
  Body: `{ "username": "user", "password": "pass" }`

- `POST /api/auth/login`  
  Login and receive a JWT.  
  Body: `{ "username": "user", "password": "pass" }`

- `GET /api/auth/me`  
  Get current user info (requires JWT).

### Boards

- `GET /api/boards`  
  List all boards for the user.

- `POST /api/boards`  
  Create a new board.  
  Body: `{ "name": "Board Name", "key": "BOARDKEY" }`

- `DELETE /api/boards/:id`  
  Delete a board by its MongoDB `_id`.

### Tasks

- `GET /api/tasks?boardId=<boardId>`  
  List all tasks for a board.

- `POST /api/tasks`  
  Create a new task.  
  Body: `{ "title": "Task", "status": "todo", "boardId": "<boardId>", ... }`

- `PUT /api/tasks/:id`  
  Update a task by its MongoDB `_id`.

- `DELETE /api/tasks/:id`  
  Delete a task by its MongoDB `_id`.

---

## File-by-File Explanation

### server.js
- Main entry point. Sets up Express, connects to MongoDB, loads routes, and starts the server.

### database/Mongo.database.js
- Exports `connectDB`, which connects to MongoDB using Mongoose.

### middleware/auth.middleware.js
- Exports `authenticate`, a middleware that checks for a valid JWT in the `Authorization` header.

### models/User.model.js
- Mongoose schema for users: `username` (unique), `password` (hashed).

### models/Board.model.js
- Mongoose schema for boards: `name`, `key` (unique), and an array of task references.

### models/Task.model.js
- Mongoose schema for tasks: `title`, `status`, `assignedTo`, `description`, `dueDate`, `createdAt`, `order`, and `boardId`.

### controllers/auth.controller.js
- `register`: Registers a new user, hashes password, returns JWT.
- `login`: Authenticates user, returns JWT.
- `me`: Returns current user info if JWT is valid.

### controllers/board.controller.js
- `getBoards`: Lists all boards.
- `createBoard`: Creates a new board.
- `deleteBoard`: Deletes a board by `_id`.

### controllers/task.controller.js
- `getTasks`: Lists all tasks for a board.
- `createTask`: Creates a new task.
- `updateTask`: Updates a task by `_id`.
- `deleteTask`: Deletes a task by `_id`.

### routes/auth.routes.js
- Routes for authentication: `/register`, `/login`, `/me`.

### routes/board.routes.js
- Routes for boards: `/` (GET, POST), `/:id` (DELETE).

### routes/task.routes.js
- Routes for tasks: `/` (GET, POST), `/:id` (PUT, DELETE).

---

## Notes

- All data is scoped to a single user (no multi-user/organization logic).
- All API responses are JSON.
- Error handling is basic; you may want to add more robust validation and error responses for production use.

---

Let me know if you want further customization!
