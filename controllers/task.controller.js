import Task from '../models/Task.model.js';
import {
  buildTaskQueryFilter, createTaskHelper, updateTaskHelper,
  deleteTaskHelper, moveTaskHelper, searchTasksHelper, getTaskByIdHelper,
} from '../utils/task.helpers.js';
import { asyncHandler } from '../utils/async.handler.js';

// GET /api/tasks - List tasks 
export const getTasks = asyncHandler(async (req, res) => {
  const { filter, limit, skip, error } = buildTaskQueryFilter(req.query);
  if (error) return res.status(400).json({ error });
  const total = await Task.countDocuments(filter);
  const tasks = await Task.find(filter).skip(skip).limit(limit);
  res.json({
    items: tasks,
    total,
    page: Math.floor(skip / limit) + 1,
    hasMore: (skip + tasks.length) < total
  });
});

// POST /api/tasks - Create a new task
export const createTask = asyncHandler(async (req, res) => {
  const { title, status, boardId, description, assignedTo, dueDate, order, dependencies } = req.body;
  if (!title || !status || !boardId) {
    return res.status(400).json({ error: 'title, status, and boardId required' });
  }

  try {
    const task = await createTaskHelper({ title, status, boardId, description, assignedTo, dueDate, order, dependencies, user: req.user });
    res.status(201).json(task);
  } catch (error) {
    if (error.message.includes('collision')) {
      return res.status(503).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
});

// PUT /api/tasks/:id - Update a task (edit, move, reorder)
export const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  try {
    const task = await updateTaskHelper({ id, update, user: req.user });
    res.json(task);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// DELETE /api/tasks/:id - Delete a task
export const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await deleteTaskHelper(id, req.user);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
});

// PUT /api/tasks/:id/move - move a task between statuses and reorder using lexoRank
export const moveTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: targetStatus, prevRank, nextRank } = req.body;

  try {
    const task = await moveTaskHelper({ id, targetStatus, prevRank, nextRank, user: req.user });
    res.json(task);
  } catch (error) {
    if (error.message.includes('collision')) {
      return res.status(503).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
});

// GET /api/tasks/search?q=keyword&boardId=
export const searchTasks = asyncHandler(async (req, res) => {
  const results = await searchTasksHelper({ q: req.query.q, boardId: req.query.boardId });
  res.json(results);
});

// GET /api/tasks/:id - Get a single task by ID
export const getTaskById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await getTaskByIdHelper(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST /api/tasks/batch - Get multiple tasks by IDs
export const getTasksByIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }
  const tasks = await Task.find({ _id: { $in: ids } });
  res.json(tasks);
});

// GET /api/tasks/assigned/:userId - Get all tasks assigned to a user
export const getTasksByAssignee = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ error: 'username required' });
  const tasks = await Task.find({ assignedTo: username });
  res.json(tasks);
});