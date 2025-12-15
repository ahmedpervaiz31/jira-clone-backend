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
    const { name, key } = req.body;
    
    if (!name || !key) {
      return res.status(400).json({ error: 'Name and key are required' });
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
    res.json({ message: 'Board deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
