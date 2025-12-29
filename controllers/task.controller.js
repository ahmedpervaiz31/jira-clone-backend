import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';

// GET /api/tasks?boardId=&status=&page=&limit= - List paginated tasks - column wise
export const getTasks = async (req, res) => {
  try {
    const { boardId, status, assignedTo } = req.query;
    let { page = 1, limit = 12 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 7;

    if (!boardId && !assignedTo) {
      return res.status(400).json({ error: 'boardId or assignedTo required' });
    }

    const filter = {};
    if (boardId) filter.boardId = boardId;
    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;

    const total = await Task.countDocuments(filter);
    const tasks = await Task.find(filter)
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      items: tasks,
      total,
      page,
      hasMore: page * limit < total
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
};

// POST /api/tasks - Create a new task
export const createTask = async (req, res) => {
  try {
    const { title, status, boardId, description, assignedTo, dueDate, order } = req.body;

    if (!title || !status || !boardId) {
      return res.status(400).json({ error: 'title, status, and boardId required' });
    }

    // if no order in body then calculate it chronologically
    let finalOrder = order;

    if (finalOrder === undefined || finalOrder === null) {
      const lastTask = await Task.findOne({ boardId, status })
        .sort({ order: -1 })
        .select('order');

      finalOrder = lastTask ? lastTask.order + 1 : 0;
    }

    // Atomically increment a counter 
    const board = await Board.findByIdAndUpdate(
      boardId,
      { $inc: { nextDisplayNumber: 1 } },
      { new: true, select: 'nextDisplayNumber key name tasks' }
    );

    if (!board) return res.status(400).json({ error: 'Invalid boardId' });

    const displayNumberComputed = board.nextDisplayNumber || (Array.isArray(board.tasks) ? board.tasks.length + 1 : 1);
    const boardKey = board.key || (() => {
      const words = (board.name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
      if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
      return (words[0] || 'BR').slice(0,2).toUpperCase();
    })();

    const computedDisplayId = `${boardKey}-${displayNumberComputed}`;

    const task = new Task({
      title,
      status,
      boardId,
      description: description || '',
      assignedTo: assignedTo || '',
      dueDate: dueDate || null,
      order: finalOrder,
      displayId: computedDisplayId
    });

    const savedTask = await task.save();

    await Board.findByIdAndUpdate(
        boardId, 
        { $push: { tasks: savedTask._id } } 
    );

    res.status(201).json(savedTask);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/tasks/:id - Update a task (edit, move, reorder)
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;

    delete update.boardId; 
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

    const task = await Task.findByIdAndDelete(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

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

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const boardId = task.boardId;

    let newOrder = typeof targetOrder === 'number' ? targetOrder : null;
    if (newOrder === null) {
      const max = await Task.find({ boardId, status: targetStatus }).sort('-order').limit(1);
      newOrder = (max[0]?.order ?? -1) + 1;
    }

    if (task.status === targetStatus) {
      const oldOrder = task.order ?? 0;
      if (newOrder === oldOrder) {
        task.status = targetStatus;
        task.order = newOrder;
        await task.save();
        return res.json(task);
      }

      if (newOrder > oldOrder) {
        await Task.updateMany(
          { boardId, status: targetStatus, order: { $gt: oldOrder, $lte: newOrder } },
          { $inc: { order: -1 } }
        );
      } else {
        await Task.updateMany(
          { boardId, status: targetStatus, order: { $gte: newOrder, $lt: oldOrder } },
          { $inc: { order: 1 } }
        );
      }

      task.order = newOrder;
      await task.save();
      return res.json(task);
    }

    const oldOrder = task.order ?? 0;
    await Task.updateMany(
      { boardId, status: task.status, order: { $gt: oldOrder } },
      { $inc: { order: -1 } }
    );
    
    await Task.updateMany(
      { boardId, status: targetStatus, order: { $gte: newOrder } },
      { $inc: { order: 1 } }
    );

    task.status = targetStatus;
    task.order = newOrder;
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to move task' });
  }
};

// GET /api/tasks/search?q=keyword
export const searchTasks = async (req, res) => {
  try {
    const query = req.query.q || '';
    const regex = new RegExp(query, 'i');
    const filter = { 
      $or: [
        { title: regex }, { description: regex },  
        { displayId: regex }, { assignedTo: regex }   
      ] 
    };

    const boardId = req.query.boardId;
    if (boardId) {
       filter.$and = [{ boardId: boardId }]; 
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