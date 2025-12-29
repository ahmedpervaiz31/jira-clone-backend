
import express from 'express';
import { register, login, me, searchUsers} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();
router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);
router.get('/users', searchUsers);

export default router;
