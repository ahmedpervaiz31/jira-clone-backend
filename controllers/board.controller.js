import { getBoardFilter, formatBoardsWithCounts, createBoardHelper, deleteBoardHelper, searchBoardsHelper } from '../utils/board.helpers.js';
import Board from '../models/Board.model.js';
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

  res.json({ items: boardsWithCounts, total, page, hasMore: page * limit < total });
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
  const { name, key, flag, members } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name must be a string' });
  }

  try {
    const board = await createBoardHelper({
      name,
      key,
      flag,
      members,
      user: req.user
    });

    res.status(201).json(board);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Board with this key already exists' });
    }
    throw error;
  }
});

// GET /api/boards/search?q=keyword - search boards by name or key
export const searchBoards = asyncHandler(async (req, res) => {
  const query = req.query.q || '';
  const results = await searchBoardsHelper(query);
  res.json(results);
});

// DELETE /api/boards/:id - Delete a board
export const deleteBoard = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await deleteBoardHelper(id, req.user);

  if (!result) {
    return res.status(404).json({ error: 'Board not found' });
  }

  res.json({ message: 'Board and its tasks deleted' });
});
