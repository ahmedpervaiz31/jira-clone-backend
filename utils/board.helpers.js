import mongoose from 'mongoose';
import Board from '../models/Board.model.js';
import Task from '../models/Task.model.js';
import { syncBoardToRagIndex } from '../middleware/board.middleware.js';
import { io } from '../server.js';

export async function generateBoardKey(name, keyFromClient) {
    let key = keyFromClient;
    if (typeof key === 'string' && key.length >= 2)
        return key.toUpperCase();

    const words = (name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
    if (words.length <= 1) {
        key = (words[0] || 'BR').slice(0, 2).toUpperCase();
        return key;
    }
    const firstLetter = words[0][0].toUpperCase();
    const secondWord = words[1].toUpperCase();
    const existingBoards = await Board.find(
        { key: new RegExp(`^${firstLetter}`) },
        { key: 1 }
    ).lean();

    const takenKeys = new Set(existingBoards.map(b => b.key));
    key = firstLetter + secondWord[0];
    if (!takenKeys.has(key)) {
        return key;
    }

    for (let i = 1; i < secondWord.length; i++) {
        let candidate = firstLetter + secondWord[i];
        if (!takenKeys.has(candidate)) {
            key = candidate;
            break;
        }
    }
    return key;
}

export function getBoardFilter(userId) {
    return {
        $or: [
            { flag: 'public' },
            { flag: 'private', members: userId }
        ]
    };
}

export async function resolveBoardMembers(flag, membersFromClient, creatorId) {
    let members = [];
    if (flag === 'public') {
        return members;
    }
    if (!Array.isArray(membersFromClient)) {
        members = creatorId ? [creatorId] : [];
    } else {
        const User = mongoose.model('User');
        const memberIds = await User.find({ username: { $in: membersFromClient } }).distinct('_id');

        const finalMemberIds = memberIds.map(id => id.toString());
        if (creatorId && !finalMemberIds.includes(creatorId)) {
            finalMemberIds.unshift(creatorId);
        }
        members = finalMemberIds;
    }
    return members;
}

export function formatBoardsWithCounts(boards) {
    return boards.map(b => ({
        ...b.toObject(),
        taskCount: b.tasks ? b.tasks.length : 0,
        tasks: []
    }));
}

export async function createBoardHelper({ name, key: keyFromClient, flag: flagFromClient, members: membersFromClient, user }) {
    if (!name) {
        throw new Error('Name is required');
    }

    const key = await generateBoardKey(name, keyFromClient);
    const flag = flagFromClient === 'private' ? 'private' : 'public';
    const creatorId = user?.id || user?._id;
    const members = await resolveBoardMembers(flag, membersFromClient, creatorId);

    const board = new Board({ name, key, tasks: [], flag, members });

    await board.save();
    await syncBoardToRagIndex(board, 'upsert');

    io.emit('board:created', {
        boardId: board._id.toString(),
        userId: creatorId
    });

    return board;
}

export async function deleteBoardHelper(id, user) {
    const board = await Board.findById(id);
    if (!board) {
        return null;
    }

    await Board.deleteOne({ _id: id });
    await syncBoardToRagIndex(board, 'delete');

    if (Array.isArray(board.tasks) && board.tasks.length > 0) {
        await Task.deleteMany({ _id: { $in: board.tasks } });
    }

    const userId = user?.id || user?._id;

    if (board._id) {
        io.to(board._id.toString()).emit('board:deleted', {
            boardId: board._id.toString(),
            userId: userId
        });
    }

    io.emit('board:deleted', {
        boardId: board._id.toString(),
        deleted: true,
        userId: userId
    });

    return board;
}

export async function searchBoardsHelper(query) {
    const regex = new RegExp(query, 'i');
    const filter = { $or: [{ name: regex }, { key: regex }] };
    return await Board.find(filter).limit(20);
}
