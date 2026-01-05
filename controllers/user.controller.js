import User from '../models/User.model.js';

// GET /api/users/search?username= - Search users by username
export const searchUsers = async (req, res) => {
  try {
    const query = req.query.username || '';
    const regex = new RegExp(query, 'i');
    const filter = { username: regex };
    const results
        = await User.find(filter).limit(20).select('username _id');
    res.json(results);
  }
    catch (err) {
    res.status(500).json({ error: 'Search failed' });
    }
};
