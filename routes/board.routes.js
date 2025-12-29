import express from 'express';
import * as boardController from '../controllers/board.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);

router.get('/', boardController.getBoards);
router.post('/', boardController.createBoard);
router.get('/search', boardController.searchBoards);

router.delete('/:id', boardController.deleteBoard);
router.get('/:id', boardController.getBoardById); 

export default router;