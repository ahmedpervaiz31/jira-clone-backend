import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';
import { hasCircularDependency, validateDependencies, canMoveTask } from '../utils/dependency.helpers.js';
import { getTaskOr404, updateTaskStatusAndOrder, buildTaskQueryFilter, createAndSaveTask, updateTaskWithDependencies, 
  moveTaskToStatus, buildTaskSearchFilter } from '../utils/task.helpers.js';
import { asyncHandler } from '../utils/async.handler.js';
import { io } from '../server.js';

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
  if (Array.isArray(dependencies)) {
    const valid = await validateDependencies(null, dependencies);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid dependencies' });
    }
  }
  const { task, error } = await createAndSaveTask({ title, status, boardId, description, assignedTo, dueDate, order, dependencies });
  if (error) {
    if (error === 'Failed to create task') {
      return res.status(503).json({ error: 'Task creation failed due to order collision.' });
    }
    return res.status(400).json({ error });
  }
  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:created', {
      boardId: task.boardId.toString(),
      userId: req.user?.id || req.user?._id
    });
  }
  res.status(201).json(task);
});

// PUT /api/tasks/:id - Update a task (edit, move, reorder)
export const updateTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const update = req.body;
  const result = await updateTaskWithDependencies({
    id,
    update,
    validateDependencies,
    hasCircularDependency,
    getTaskOr404: (id, res) => getTaskOr404(id, res),
    canMoveTask,
    updateTaskStatusAndOrder,
    res
  });
  if (result.error) return res.status(400).json({ error: result.error });
  if (result && result.task && result.task.boardId) {
    io.to(result.task.boardId.toString()).emit('task:updated', {
      boardId: result.task.boardId.toString(),
      userId: req.user?.id || req.user?._id
    });
  }
  res.json(result.task);
});

// DELETE /api/tasks/:id - Delete a task
export const deleteTask = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const task = await Task.findById(id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  await Task.deleteOne({ _id: id });

  await Board.findByIdAndUpdate(
    task.boardId,
    { $pull: { tasks: task._id } }
  );

  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:deleted', {
      boardId: task.boardId.toString(),
      userId: req.user?.id || req.user?._id
    });
  }
  res.json({ message: 'Task deleted' });
});

// PUT /api/tasks/:id/move - move a task between statuses and reorder using lexoRank
export const moveTask = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status: targetStatus, prevRank, nextRank } = req.body;
  if (!targetStatus) {
    return res.status(400).json({ error: 'target status required' });
  }

  const result = await moveTaskToStatus({
    id,
    targetStatus,
    prevRank,
    nextRank,
    getTaskOr404: (id) => getTaskOr404(id, res),
    canMoveTask,
    updateTaskStatusAndOrder,
    TaskModel: Task
  });

  if (result.error) {
    if (result.error === 'Failed to move task') {
      return res.status(503).json({ error: 'Task move failed due to order collision. Board was rebalanced, please retry.' });
    }
    return res.status(400).json({ error: result.error });
  }
  if (result && result.task && result.task.boardId) {
    io.to(result.task.boardId.toString()).emit('task:moved', {
      boardId: result.task.boardId.toString(),
      userId: req.user?.id || req.user?._id
    });
  }
  res.json(result.task);
});

// GET /api/tasks/search?q=keyword&boardId=
export const searchTasks = asyncHandler(async (req, res) => {
  const filter = buildTaskSearchFilter({ q: req.query.q, boardId: req.query.boardId });
  const results = await Task.find(filter).limit(20);
  res.json(results);
});

// GET /api/tasks/:id - Get a single task by ID
export const getTaskById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await Task.findById(id);
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