import mongoose from 'mongoose';
import Board from '../models/Board.model.js';

export async function generateBoardKey(name, keyFromClient) {
    let key = keyFromClient;
    if (typeof key === 'string' && key.length >= 2) 
        return key.toUpperCase();

    const words = (name || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w);
    if (words.length <=1 ) {
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
        const memberIds = await User.find({username: { $in: membersFromClient }}).distinct('_id');

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
