import express from 'express';
import * as ragController from '../controllers/rag.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';


const router = express.Router();
router.use(authenticate);
router.post('/search', ragController.searchRag);
router.post('/index/batch', ragController.batchIndex);

export default router;