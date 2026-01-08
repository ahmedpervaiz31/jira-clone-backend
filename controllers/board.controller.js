import Board from '../models/Board.model.js';
import Task from '../models/Task.model.js';
import { generateBoardKey, getBoardFilter, resolveBoardMembers, formatBoardsWithCounts } from '../utils/board.helpers.js';
import { asyncHandler } from '../utils/async.handler.js';

// GET /api/boards - List all boards
export const getBoards = asyncHandler(async (req, res) => {
  let { page = 1, limit = 20 } = req.query;
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;

  const userId = req.user && req.user.id;
  const filter = getBoardFilter(userId);
  const total = await Board.countDocuments(filter);
  const boards = await Board.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .select('-__v');

  const boardsWithCounts = formatBoardsWithCounts(boards);

  res.json({ items: boardsWithCounts, total, page, hasMore: page * limit < total});
});

// GET /api/boards/:id - Get a single board by ID
export const getBoardById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const board = await Board.findById(id);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board);
});

// POST /api/boards - Create a new board
export const createBoard = asyncHandler(async (req, res) => {
  const { name, key: keyFromClient, flag: flagFromClient, members: membersFromClient } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const key = await generateBoardKey(name, keyFromClient);
  const flag = flagFromClient === 'private' ? 'private' : 'public';
  const creatorId = req.user?.id;
  const members = await resolveBoardMembers(flag, membersFromClient, creatorId);

  const board = new Board({ name, key, tasks: [], flag, members });

  await board.save();
  res.status(201).json(board);
});

// GET /api/boards/search?q=keyword - search boards by name or key
export const searchBoards = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  const regex = new RegExp(query, 'i');
  const filter = { $or: [{ name: regex }, { key: regex }] };

  const results = await Board.find(filter).limit(20);
  res.json(results);
});

// DELETE /api/boards/:id - Delete a board
export const deleteBoard = asyncHandler(async (req, res) => {
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
});
