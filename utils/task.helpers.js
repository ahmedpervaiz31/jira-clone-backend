import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';

export async function computeTaskCreationFields({ boardId, status, order }) {
  let finalOrder = order;
  if (finalOrder === undefined || finalOrder === null) {
    const lastTask = await Task.findOne({ boardId, status })
      .sort({ order: -1 })
      .select('order');
    finalOrder = lastTask ? lastTask.order + 1 : 0;
  }

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
    return (words[0] || 'BR').slice(0,2).toUpperCase();
  })();
  const computedDisplayId = `${boardKey}-${displayNumberComputed}`;
  return { finalOrder, computedDisplayId, board };
}

export async function getTaskOr404(id, res) {
  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }
  return task;
}

export async function updateTaskStatusAndOrder(task, newStatus, newOrder) {
  const boardId = task.boardId;
  if (task.status === newStatus) {
    const oldOrder = task.order ?? 0;
    if (newOrder === oldOrder) {
      task.status = newStatus;
      task.order = newOrder;
      await task.save();
      return task;
    }
    if (newOrder > oldOrder) {
      await Task.updateMany(
        { boardId, status: newStatus, order: { $gt: oldOrder, $lte: newOrder } },
        { $inc: { order: -1 } }
      );
    } else {
      await Task.updateMany(
        { boardId, status: newStatus, order: { $gte: newOrder, $lt: oldOrder } },
        { $inc: { order: 1 } }
      );
    }
    task.order = newOrder;
    await task.save();
    return task;
  }
  const oldOrder = task.order ?? 0;
  await Task.updateMany(
    { boardId, status: task.status, order: { $gt: oldOrder } },
    { $inc: { order: -1 } }
  );
  await Task.updateMany(
    { boardId, status: newStatus, order: { $gte: newOrder } },
    { $inc: { order: 1 } }
  );
  task.status = newStatus;
  task.order = newOrder;
  await task.save();
  return task;
}
