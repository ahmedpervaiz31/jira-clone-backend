import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';
import { hasCircularDependency, validateDependencies, canMoveTask} from '../utils/dependency.helpers.js';
import { getTaskOr404, updateTaskStatusAndOrder, computeTaskCreationFields } from '../utils/task.helpers.js';

// GET /api/tasks - List tasks 
export const getTasks = async (req, res) => {
  try {
    const { boardId, status, assignedTo } = req.query;
    let { limit, skip } = req.query;

    limit = parseInt(limit, 10);
    if (isNaN(limit) || limit < 1) limit = 12;
    let skipVal = parseInt(skip, 10);
    if (isNaN(skipVal) || skipVal < 0) skipVal = 0;

    if (!boardId && !assignedTo) {
      return res.status(400).json({ error: 'boardId or assignedTo required' });
    }

    const filter = {};
    if (boardId) filter.boardId = boardId;
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;

    const total = await Task.countDocuments(filter);
    
    const tasks = await Task.find(filter)
      .skip(skipVal)
      .limit(limit);

    res.json({
      items: tasks,
      total,
      page: Math.floor(skipVal / limit) + 1, 
      hasMore: (skipVal + tasks.length) < total
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// POST /api/tasks - Create a new task
export const createTask = async (req, res) => {
  try {
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

    const { finalOrder, computedDisplayId, board, error } = await computeTaskCreationFields({ boardId, status, order });
    if (error) {
      return res.status(400).json({ error });
    }

    const task = new Task({
      title,
      status,
      boardId,
      description: description || '',
      assignedTo: assignedTo || '',
      dueDate: dueDate || null,
      order: finalOrder,
      displayId: computedDisplayId,
      dependencies: Array.isArray(dependencies) ? dependencies : []
    });

    const savedTask = await task.save();

    await Board.findByIdAndUpdate(
      boardId,
      { $push: { tasks: savedTask._id } }
    );

    res.status(201).json(savedTask);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/tasks/:id - Update a task (edit, move, reorder)
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;

    delete update.boardId;

    if (Array.isArray(update.dependencies)) {
      const valid = await validateDependencies(id, update.dependencies);
      if (!valid) {
        return res.status(400).json({ error: 'Invalid dependencies: non-existent or self-reference.' });
      }
      const circular = await hasCircularDependency(id, update.dependencies);
      if (circular) {
        return res.status(400).json({ error: 'Circular dependency detected.' });
      }
    }

    if (update.status) {
      const task = await getTaskOr404(id, res);
      if (!task) return;
      const moveCheck = await canMoveTask(task, update.status);
      if (!moveCheck.ok) return res.status(400).json({ error: moveCheck.error });
      if (typeof update.order === 'number') {
        const updated = await updateTaskStatusAndOrder(task, update.status, update.order);
        return res.json(updated);
      }
    }
    const task = await Task.findByIdAndUpdate(id, update, { new: true });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
};

// DELETE /api/tasks/:id - Delete a task
export const deleteTask = async (req, res) => {
  try {
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

    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

// PUT /api/tasks/:id/move - move a task between statuses and reorder
export const moveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: targetStatus, order: targetOrder } = req.body;

    if (!targetStatus) return res.status(400).json({ error: 'target status required' });

    const validStatuses = ['to_do', 'in_progress', 'done'];
    if (!validStatuses.includes(targetStatus)) {
      return res.status(400).json({ error: 'invalid status' });
    }

    const task = await getTaskOr404(id, res);
    if (!task) return;
    const moveCheck = await canMoveTask(task, targetStatus);
    if (!moveCheck.ok) return res.status(400).json({ error: moveCheck.error });
    let newOrder = typeof targetOrder === 'number' ? targetOrder : null;
    if (newOrder === null) {
      const max = await Task.find({ boardId: task.boardId, status: targetStatus }).sort('-order').limit(1);
      newOrder = (max[0]?.order ?? -1) + 1;
    }
    const updated = await updateTaskStatusAndOrder(task, targetStatus, newOrder);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to move task' });
  }
};

// POST /api/tasks/batch-move 
export const batchMoveTasks = async (req, res) => {
  try {
    const { moves } = req.body;
    if (!Array.isArray(moves) || moves.length === 0) {
      return res.status(400).json({ error: 'No moves provided' });
    }
    const results = [];
    for (const move of moves) {
      const { taskId, status, order } = move;
      if (!taskId || !status) continue;
      const task = await getTaskOr404(taskId, res);
      if (!task) {
        results.push({ taskId, error: 'Task not found' });
        continue;
      }
      const moveCheck = await canMoveTask(task, status);
      if (!moveCheck.ok) {
        results.push({ taskId, error: moveCheck.error });
        continue;
      }
      let newOrder = typeof order === 'number' ? order : null;
      if (newOrder === null) {
        const max = await Task.find({ boardId: task.boardId, status }).sort('-order').limit(1);
        newOrder = (max[0]?.order ?? -1) + 1;
      }
      const updated = await updateTaskStatusAndOrder(task, status, newOrder);
      results.push(updated);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Batch move failed', details: err.message });
  }
};

// GET /api/tasks/search?q=keyword&boardId=
export const searchTasks = async (req, res) => {
  try {
    const query = req.query.q || '';
    const boardId = req.query.boardId;
    const regex = new RegExp(query, 'i');

    const filter = {};

    if (boardId) {
      filter.boardId = boardId;
    }

    if (query) {
      filter.$or = [
        { title: regex },
        { description: regex },
        { displayId: regex },
        { assignedTo: regex }
      ];
    }

    const results = await Task.find(filter).limit(20);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// GET /api/tasks/:id - Get a single task by ID
export const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
};

// POST /api/tasks/batch - Get multiple tasks by IDs
export const getTasksByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }
    const tasks = await Task.find({ _id: { $in: ids } });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks by IDs' });
  }
};

// GET /api/tasks/assigned/:userId - Get all tasks assigned to a user
export const getTasksByAssignee = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ error: 'username required' });
    
    const tasks = await Task.find({ assignedTo: username });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch assigned tasks' });
  }
};


