import Board from '../models/Board.model.js';
import Task from '../models/Task.model.js';

// GET /api/boards - List all boards
export const getBoards = async (req, res) => {
  try {
    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const total = await Board.countDocuments();
    
    const boards = await Board.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v'); 

    const boardsWithCounts = boards.map(b => ({
      ...b.toObject(),
      taskCount: b.tasks ? b.tasks.length : 0, 
      tasks: []
    }));

    res.json({
      items: boardsWithCounts,
      total,
      page,
      hasMore: page * limit < total
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
};

// GET /api/boards/:id - Get a single board by ID
export const getBoardById = async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findById(id);
    if (!board) return res.status(404).json({ error: 'Board not found' });
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch board' });
  }
};

// POST /api/boards - Create a new board
export const createBoard = async (req, res) => {
  try {
    const { name, key: keyFromClient } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let key = keyFromClient;
    if (!key || typeof key !== 'string' || key.length < 2) {
      const words = (name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
      if (words.length > 1) key = (words[0][0] + words[1][0]).toUpperCase();
      else key = (words[0] || 'BR').slice(0,2).toUpperCase();
    }

    const board = new Board({ 
      name, 
      key, 
      tasks: [] 
    });

    await board.save();
    res.status(201).json(board);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/boards/search?q=keyword - search boards by name or key
export const searchBoards = async (req, res) => {
  try {
    const query = req.query.q || '';
    const regex = new RegExp(query, 'i');
    const filter = { $or: [{ name: regex }, { key: regex }] };

    const results = await Board.find(filter).limit(20);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// DELETE /api/boards/:id - Delete a board
export const deleteBoard = async (req, res) => {
  try {
    const { id } = req.params;
    const board = await Board.findByIdAndDelete(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    try {
      if (Array.isArray(board.tasks) && board.tasks.length > 0) {
        await Task.deleteMany({ _id: { $in: board.tasks } });
      }
    } catch (cleanupErr) {
      res.status(500).json({ error: 'Board deleted but failed to delete associated tasks' });
      return;
    }

    res.json({ message: 'Board and its tasks deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
