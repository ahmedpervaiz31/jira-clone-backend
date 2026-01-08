import Task from '../models/Task.model.js';

export async function canMoveTask(task, newStatus) {
  if ((newStatus === 'in_progress' || newStatus === 'done') && !(await dependenciesAreReady(task, newStatus))) {
    return { ok: false, error: 'Cannot move task: dependencies are not in progress or done.' };
  }
  if (newStatus === 'done' && (await parentInProgress(task))) {
    return { ok: false, error: 'Cannot move task to done: a parent is still in progress.' };
  }
  if ((newStatus === 'to_do' || newStatus === 'in_progress') && (await hasChildFurtherAlong(task._id, newStatus))) {
    return { ok: false, error: 'Cannot move task: one or more dependent tasks are further along.' };
  }
  return { ok: true };
}

async function parentInProgress(task) {
  if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) return false;
  const parentTasks = await Task.find({ _id: { $in: task.dependencies } });
  return parentTasks.some(pt => pt.status === 'in_progress');
}
export async function dependenciesAreReady(task, newStatus) {
  if (!Array.isArray(task.dependencies) || task.dependencies.length === 0) return true;
  const parentTasks = await Task.find({ _id: { $in: task.dependencies } });
  if (newStatus === 'done') {
    return parentTasks.every(pt => pt.status === 'done');
  }
  return parentTasks.every(pt => pt.status === 'in_progress' || pt.status === 'done');
}

export async function hasChildFurtherAlong(taskId, targetStatus) {
  const children = await Task.find({ dependencies: taskId });
  const forbiddenStatuses = targetStatus === 'to_do' ? ['in_progress', 'done'] : ['done'];
  return children.some(child => forbiddenStatuses.includes(child.status));
}

export async function hasCircularDependency(taskId, dependencies) {
  const visited = new Set();
  async function dfs(currentId) {
    if (!currentId) 
      return false;
    if (currentId.toString() === taskId?.toString()) 
      return true;
    if (visited.has(currentId.toString())) 
      return false;
    visited.add(currentId.toString());
    const task = await Task.findById(currentId);
    if (!task || !Array.isArray(task.dependencies)) 
      return false;
    for (const depId of task.dependencies) {
      if (await dfs(depId)) 
      return true;
    }
    return false;
  }
  for (const depId of dependencies) {
    if (await dfs(depId)) return true;
  }
  return false;
}

export async function validateDependencies(taskId, dependencies) {
  if (!Array.isArray(dependencies)) 
    return false;
  for (const depId of dependencies) {
    if (depId.toString() === taskId?.toString()) 
        return false;
    const exists = await Task.exists({ _id: depId });
    if (!exists) 
        return false;
  }
  return true;
}
