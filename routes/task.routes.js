import express from 'express';
import * as taskController from '../controllers/task.controller.js';
import * as dependencyController from '../controllers/dependency.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);

router.get('/', taskController.getTasks);
router.get('/search', taskController.searchTasks);
router.post('/', taskController.createTask);

router.put('/:id/move', taskController.moveTask);
router.post('/batch-move', taskController.batchMoveTasks);
router.put('/:id', taskController.updateTask);
router.get('/:id', taskController.getTaskById);

router.delete('/:id', taskController.deleteTask);
router.get('/:id', taskController.getTaskById);
router.get('/assigned/:username', taskController.getTasksByAssignee);
router.post('/:id/dependencies', dependencyController.addTaskDependencies);
router.delete('/:id/dependencies/:depId', dependencyController.removeTaskDependency);
router.post('/batch', taskController.getTasksByIds);

router.get('/:id/dependencies', dependencyController.getTaskDependencies);

export default router;