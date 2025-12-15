import express from 'express';
import * as taskController from '../controllers/task.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);
router.get('/', taskController.getTasks);
router.get('/search', taskController.searchTasks);
router.post('/', taskController.createTask);
router.put('/:id/move', taskController.moveTask);
router.put('/:id', taskController.updateTask);
router.delete('/:id', taskController.deleteTask);

export default router;
