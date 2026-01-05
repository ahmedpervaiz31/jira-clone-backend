import Task from '../models/Task.model.js';
import { hasCircularDependency, validateDependencies } from '../utils/dependency.helpers.js';
import { getTaskOr404 } from '../utils/task.helpers.js';

// POST /api/tasks/:id/dependencies - Add dependencies to a task
export const addTaskDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const { dependencies } = req.body;
    if (!Array.isArray(dependencies) || dependencies.length === 0) {
      return res.status(400).json({ error: 'dependencies array required' });
    }
    const task = await getTaskOr404(id, res);
    if (!task) {
      return;
    }
    const valid = await validateDependencies(id, dependencies);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid dependencies' });
    }
    const circular = await hasCircularDependency(id, [...task.dependencies, ...dependencies]);
    if (circular) {
      return res.status(400).json({ error: 'Circular dependency detected.' });
    }

    const currentSet = new Set(task.dependencies.map(String));
    for (const dep of dependencies) {
      if (!currentSet.has(dep.toString())) {
        task.dependencies.push(dep);
        currentSet.add(dep.toString());
      }
    }
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add dependencies' });
  }
};

// DELETE /api/tasks/:id/dependencies/:depId - Remove a dependency from a task
export const removeTaskDependency = async (req, res) => {
  try {
    const { id, depId } = req.params;
    const task = await getTaskOr404(id, res);
    if (!task) {
      return;
    }
    const index = task.dependencies.indexOf(depId);
    if (index === -1) {
      return res.status(400).json({ error: 'Dependency not found on task' });
    }
    task.dependencies.splice(index, 1);
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove dependency' });
  }
};

// GET /api/tasks/:id/dependencies - Get all dependencies of a task
export const getTaskDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await getTaskOr404(id, res);
    if (!task) 
      return;
    const dependencies = await Task.find({ _id: { $in: task.dependencies } });
    res.json(dependencies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get dependencies' });
  }
};
