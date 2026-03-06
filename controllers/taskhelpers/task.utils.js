import Task from '../../models/Task.model.js';
import Board from '../../models/Board.model.js';
import { io } from '../../server.js';
import { syncTaskToRagIndex } from '../../middleware/task.middleware.js';
import { hasCircularDependency, validateDependencies, canMoveTask } from '../dependency.helpers.js';
import { getTaskOr404, buildTaskSearchFilter } from './task.helpers.js';

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
