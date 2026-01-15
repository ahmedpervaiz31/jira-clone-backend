import express from 'express';
import * as ragControllerr from '../controllers/rag.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);
router.post('/search', ragControllerr.searchRag);

export default router;