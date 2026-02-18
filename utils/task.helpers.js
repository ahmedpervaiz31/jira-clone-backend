import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';
import { generateRank, rebalanceBoard, parseRank } from './lexorank.helper.js';

export function buildTaskQueryFilter(query) {
	const { boardId, status, assignedTo } = query;
	let { limit, skip } = query;
	limit = parseInt(limit, 10);
	if (isNaN(limit) || limit < 1) limit = 12;
	let skipVal = parseInt(skip, 10);
	if (isNaN(skipVal) || skipVal < 0) skipVal = 0;
	if (!boardId && !assignedTo) {
		return { error: 'boardId or assignedTo required' };
	}
	const filter = {};
	if (boardId) filter.boardId = boardId;
	if (status) filter.status = status;
	if (assignedTo) filter.assignedTo = assignedTo;
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
		return (words[0] || 'BR').slice(0,2).toUpperCase();
	})();
	const computedDisplayId = `${boardKey}-${displayNumberComputed}`;
	return { computedDisplayId, board };
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
	task.status = newStatus;
	task.order = newOrder;
	await task.save();
	return task;
}
