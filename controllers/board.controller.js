import Board from '../models/Board.model.js';
import Task from '../models/Task.model.js';

// GET /api/boards - List all boards
export const getBoards = async (req, res) => {
  try {
    const boards = await Board.find().populate('tasks'); 
    res.json(boards);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch boards' });
  }
};

// POST /api/boards - Create a new board
export const createBoard = async (req, res) => {
  try {
    const { name, key: keyFromClient } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Always generate a 2-letter key from the name if not provided or invalid
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
    console.error("Board Create Error:", err.message); 
    res.status(500).json({ error: err.message });
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

    // Remove all tasks that belong to this board
    try {
      if (Array.isArray(board.tasks) && board.tasks.length > 0) {
        await Task.deleteMany({ _id: { $in: board.tasks } });
      }
    } catch (cleanupErr) {
      console.error('Failed to delete tasks for board:', cleanupErr.message);
    }

    res.json({ message: 'Board and its tasks deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
