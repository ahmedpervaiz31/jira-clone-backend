import User from '../models/User.model.js';
import { asyncHandler } from '../utils/async.handler.js';

// GET /api/users/search?username= - Search users by username
export const searchUsers = asyncHandler(async (req, res) => {
  const query = req.query.username || '';
  const regex = new RegExp(query, 'i');
  const filter = { username: regex };
  const results = await User.find(filter).limit(20).select('username _id');
  res.json(results);
});
