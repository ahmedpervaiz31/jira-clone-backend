import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';
import { generateRank, rebalanceBoard, parseRank } from './lexorank.helper.js';
import { io } from '../server.js';
import { syncTaskToRagIndex } from '../middleware/task.middleware.js';
import { hasCircularDependency, validateDependencies, canMoveTask } from './dependency.helpers.js';

export function buildTaskQueryFilter(query) {
  const { boardId, status, assignedTo } = query;
  let { limit, skip } = query;
  limit = parseInt(limit, 10);
  if (isNaN(limit) || limit < 1)
    limit = 12;

  let skipVal = parseInt(skip, 10);

  if (isNaN(skipVal) || skipVal < 0)
    skipVal = 0;
  if (!boardId && !assignedTo) {
    return { error: 'boardId or assignedTo required' };
  }

  const filter = {};
  if (boardId)
    filter.boardId = boardId;
  if (status)
    filter.status = status;
  if (assignedTo)
    filter.assignedTo = assignedTo;

  return { filter, limit, skip: skipVal };
}

export async function createAndSaveTask({ title, status, boardId, description, assignedTo, dueDate, order, dependencies }) {
  try {
    const lastTask = await Task.findOne({ boardId, status })
      .sort({ order: -1 })
      .select('order')
      .lean();

    let finalOrder = order;
    if (!finalOrder) {
      finalOrder = lastTask ? generateRank(lastTask.order, null) : generateRank(null, null);
    }
    const { computedDisplayId, error } = await computeTaskCreationFields({ boardId, status });
    if (error) return { error };

    const newTask = new Task({
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

    let savedTask;
    try {
      savedTask = await newTask.save();
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.order) {
        await rebalanceBoard(boardId);

        const refreshedLast = await Task.findOne({ boardId, status })
          .sort({ order: -1 })
          .select('order')
          .lean();

        finalOrder = refreshedLast
          ? generateRank(refreshedLast.order, null)
          : generateRank(null, null);

        newTask.order = finalOrder;
        savedTask = await newTask.save();
      } else {
        return { error: 'Failed to create task' };
      }
    }

    await Board.updateOne(
      { _id: boardId },
      { $push: { tasks: savedTask._id } }
    );

    return { task: savedTask };
  } catch (err) {
    return { error: 'Failed to create task' };
  }
}
export async function updateTaskWithDependencies({ id, update, validateDependencies, hasCircularDependency, getTaskOr404, canMoveTask, updateTaskStatusAndOrder }) {
  delete update.boardId;

  if (Array.isArray(update.dependencies)) {
    const valid = await validateDependencies(id, update.dependencies);
    if (!valid) return { error: 'Invalid dependencies' };

    const circular = await hasCircularDependency(id, update.dependencies);
    if (circular) return { error: 'Circular dependency detected.' };
  }

  if (update.status) {
    const task = await getTaskOr404(id);
    if (!task) return { error: 'Task not found' };

    const moveCheck = await canMoveTask(task, update.status);
    if (!moveCheck.ok) return { error: moveCheck.error };

    if (update.prevRank || update.nextRank) {
      const newRank = generateRank(update.prevRank, update.nextRank);
      const { rank } = parseRank(newRank);

      if (rank.length > 32) {
        await rebalanceBoard(task.boardId);
      }
      return { task: await updateTaskStatusAndOrder(task, update.status, newRank) };
    }
  }

  const task = await Task.findByIdAndUpdate(id, update, { new: true });
  return { task };
}

export async function moveTaskToStatus({ id, targetStatus, prevRank, nextRank, getTaskOr404, canMoveTask, updateTaskStatusAndOrder, TaskModel }) {
  if (!targetStatus) return { error: 'target status required' };

  const task = await getTaskOr404(id);
  if (!task) return { error: 'Task not found' };

  const moveCheck = await canMoveTask(task, targetStatus);
  if (!moveCheck.ok) return { error: moveCheck.error };

  const newRank = generateRank(prevRank, nextRank);

  const { rank } = parseRank(newRank);
  if (rank.length > 32) {
    rebalanceBoard(task.boardId).catch(console.error);
  }

  let updated;
  try {
    updated = await updateTaskStatusAndOrder(task, targetStatus, newRank);

  } catch (err) {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.order) {
      await rebalanceBoard(task.boardId);
      const refreshedTask = await getTaskOr404(id);

      const neighbors = await TaskModel
        .find({ boardId: task.boardId, status: targetStatus })
        .sort({ order: 1 });

      const index = neighbors.findIndex(t => String(t._id) === String(task._id));

      const prev = neighbors[index - 1]?.order || null;
      const next = neighbors[index]?.order || null;

      const retryRank = generateRank(prev, next);

      updated = await updateTaskStatusAndOrder(refreshedTask, targetStatus, retryRank);
    } else {
      return { error: 'Failed to move task' };
    }
  }
  return { task: updated };
}

export function buildTaskSearchFilter({ q, boardId }) {
  const query = q || '';
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
  return filter;
}

export async function computeTaskCreationFields({ boardId, status }) {
  const board = await Board.findByIdAndUpdate(
    boardId,
    { $inc: { nextDisplayNumber: 1 } },
    { new: true, select: 'nextDisplayNumber key name tasks' }
  );
  if (!board) return { error: 'Invalid boardId' };

  const displayNumberComputed = board.nextDisplayNumber || (Array.isArray(board.tasks) ? board.tasks.length + 1 : 1);
  const boardKey = board.key || (() => {
    const words = (board.name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return (words[0] || 'BR').slice(0, 2).toUpperCase();
  })();
  const computedDisplayId = `${boardKey}-${displayNumberComputed}`;
  return { computedDisplayId, board };
}

export async function getTaskOr404(id, res) {
  const task = await Task.findById(id);
  if (!task) {
    if (res && typeof res.status === 'function') {
      res.status(404).json({ error: 'Task not found' });
    }
    return null;
  }
  return task;
}

export async function updateTaskStatusAndOrder(task, newStatus, newOrder) {
  task.status = newStatus;
  task.order = newOrder;
  await task.save();
  return task;
}

export async function createTaskHelper({ title, status, boardId, description, assignedTo, dueDate, order, dependencies, user }) {
  if (!title || !status || !boardId) {
    throw new Error('title, status, and boardId required');
  }
  if (Array.isArray(dependencies)) {
    const valid = await validateDependencies(null, dependencies);
    if (!valid) {
      throw new Error('Invalid dependencies');
    }
  }

  const { task, error } = await createAndSaveTask({ title, status, boardId, description, assignedTo, dueDate, order, dependencies });

  if (error) {
    throw new Error(error === 'Failed to create task' ? 'Task creation failed due to order collision.' : error);
  }

  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:created', {
      boardId: task.boardId.toString(),
      userId: user?.id || user?._id
    });
  }
  if (task) {
    await syncTaskToRagIndex(task, 'upsert');
  }
  return task;
}

export async function updateTaskHelper({ id, update, user }) {
  const result = await updateTaskWithDependencies({
    id,
    update,
    validateDependencies,
    hasCircularDependency,
    getTaskOr404,
    canMoveTask,
    updateTaskStatusAndOrder
  });

  if (result.error) throw new Error(result.error);

  const task = result.task;

  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:updated', {
      boardId: task.boardId.toString(),
      userId: user?.id || user?._id
    });
  }
  if (task) {
    await syncTaskToRagIndex(task, 'upsert');
  }
  return task;
}

export async function deleteTaskHelper(id, user) {
  const task = await Task.findById(id);
  if (!task) {
    throw new Error('Task not found');
  }

  await Task.deleteOne({ _id: id });

  await Board.findByIdAndUpdate(
    task.boardId,
    { $pull: { tasks: task._id } }
  );

  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:deleted', {
      boardId: task.boardId.toString(),
      userId: user?.id || user?._id
    });
  }

  await syncTaskToRagIndex(task, 'delete');

  return { message: 'Task deleted', boardId: task.boardId, taskId: id };
}

export async function moveTaskHelper({ id, targetStatus, prevRank, nextRank, user }) {
  if (!targetStatus) {
    throw new Error('target status required');
  }

  if (!prevRank && !nextRank) {
    const task = await Task.findById(id).select('boardId');
    if (!task) throw new Error('Task not found');

    const lastTask = await Task.findOne({
      boardId: task.boardId,
      status: targetStatus
    })
      .sort({ order: -1 })
      .select('order')
      .lean();

    if (lastTask) {
      prevRank = lastTask.order;
    }
  }

  const result = await moveTaskToStatus({
    id,
    targetStatus,
    prevRank,
    nextRank,
    getTaskOr404,
    canMoveTask,
    updateTaskStatusAndOrder,
    TaskModel: Task
  });

  if (result.error) {
    throw new Error(result.error === 'Failed to move task' ? 'Task move failed due to order collision. Board was rebalanced, please retry.' : result.error);
  }

  const task = result.task;
  if (task && task.boardId) {
    io.to(task.boardId.toString()).emit('task:moved', {
      boardId: task.boardId.toString(),
      userId: user?.id || user?._id
    });
  }
  if (task) {
    await syncTaskToRagIndex(task, 'upsert');
  }
  return task;
}

export async function searchTasksHelper({ q, boardId }) {
  const filter = buildTaskSearchFilter({ q, boardId });
  return await Task.find(filter).limit(20);
}

export async function getTaskByIdHelper(id) {
  return await Task.findById(id);
}
