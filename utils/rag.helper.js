import Task from '../models/Task.model.js';
import Board from '../models/Board.model.js';
import User from '../models/User.model.js';

export async function keywordSearch(query, userId) {
	const regex = new RegExp(query, 'i');
	const boards = await Board.find({
		$and: [
			{
				$or: [
					{ flag: 'public' },
					{ $and: [ { flag: 'private' }, { members: userId } ] }
				]
			},
			{
				$or: [
					{ name: regex },
					{ key: regex }
				]
			}
		]
	});

    const boardIds = boards.map(b => b._id);
	const tasks = await Task.find({
		boardId: { $in: boardIds },
		$or: [
			{ title: regex },
			{ description: regex },
			{ assignedTo: regex }
		]
	});

    const users = await User.find({ username: regex });

	return {
		boards,
		tasks,
		users,
	};
}
