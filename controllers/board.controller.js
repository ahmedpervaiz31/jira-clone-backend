import Board from '../models/Board.model.js';
import Task from '../models/Task.model.js';
import mongoose from 'mongoose';

// GET /api/boards - List all boards
export const getBoards = async (req, res) => {
  try {
    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const userId = req.user && req.user.id;
    const filter = {
      $or: [
        { flag: 'public' },
        { flag: 'private', members: userId }
      ]
    };

    const total = await Board.countDocuments(filter);
    const boards = await Board.find(filter)
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
    const { name, key: keyFromClient, flag: flagFromClient, members: membersFromClient } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    let key = keyFromClient;
    if (!key || typeof key !== 'string' || key.length < 2) {
      const words = (name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
      
      if (words.length > 1) {
        const firstLetter = words[0][0].toUpperCase();
        const secondWord = words[1].toUpperCase();

        const existingBoards = await Board.find(
          { key: new RegExp(`^${firstLetter}`) },
          { key: 1 }
        ).lean();

        const takenKeys = new Set(existingBoards.map(b => b.key));

        key = firstLetter + secondWord[0];
        
        if (takenKeys.has(key)) {
          for (let i = 1; i < secondWord.length; i++) {
            let candidate = firstLetter + secondWord[i];
            if (!takenKeys.has(candidate)) {
              key = candidate;
              break;
            }
          }
        }
      } else {
        key = (words[0] || 'BR').slice(0, 2).toUpperCase();
      }
    }

    let flag = flagFromClient === 'private' ? 'private' : 'public';
    let members = [];

    if (flag === 'private') {
      const creatorId = req.user?.id;
      
      if (!Array.isArray(membersFromClient)) {
        members = creatorId ? [creatorId] : [];
      } else {
        const User = mongoose.model('User');
        const memberIds = await User.find({ 
          username: { $in: membersFromClient } 
        }).distinct('_id');

        const finalMemberIds = memberIds.map(id => id.toString());
        if (creatorId && !finalMemberIds.includes(creatorId)) {
          finalMemberIds.unshift(creatorId);
        }
        members = finalMemberIds;
      }
    }

    const board = new Board({ 
      name, 
      key, 
      tasks: [],
      flag,
      members
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
    const board = await Board.findById(id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    await Board.deleteOne({ _id: id });

    if (Array.isArray(board.tasks) && board.tasks.length > 0) {
      await Task.deleteMany({ _id: { $in: board.tasks } });
    }

    res.json({ message: 'Board and its tasks deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete board' });
  }
};
