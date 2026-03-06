import { createBoardHelper, deleteBoardHelper } from '../utils/board.helpers.js';
import { createTaskHelper, updateTaskHelper, deleteTaskHelper, moveTaskHelper } from '../utils/task.utils.js';

export async function executeToolCall(toolName, args, user) {
    try {
        switch (toolName) {
            // board
            case 'createBoard':
                return await createBoardHelper({
                    name: args.name,
                    key: args.key,
                    flag: args.flag,
                    members: args.members,
                    user
                });

            case 'deleteBoard':
                if (!args.id)
                    throw new Error("Missing 'id' for deleteBoard");
                return await deleteBoardHelper(args.id, user);

            // task
            case 'createTask':
                return await createTaskHelper({
                    title: args.title,
                    status: args.status,
                    boardId: args.boardId,
                    description: args.description,
                    assignedTo: args.assignedTo,
                    dueDate: args.dueDate,
                    order: args.order,
                    dependencies: args.dependencies,
                    user
                });

            case 'updateTask':
                if (!args.id)
                    throw new Error("Missing 'id' for updateTask");
                const { id: updateId, ...updateFields } = args;
                return await updateTaskHelper({
                    id: updateId,
                    update: updateFields,
                    user
                });

            case 'moveTask':
                if (!args.id)
                    throw new Error("Missing 'id' for moveTask");
                if (!args.targetStatus)
                    throw new Error("Missing 'targetStatus' for moveTask");
                return await moveTaskHelper({
                    id: args.id,
                    targetStatus: args.targetStatus,
                    prevRank: args.prevRank,
                    nextRank: args.nextRank,
                    user
                });

            case 'deleteTask':
                if (!args.id)
                    throw new Error("Missing 'id' for deleteTask");
                return await deleteTaskHelper(args.id, user);

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    } catch (error) {
        throw new Error(`Tool execution failed: ${error.message}`);
    }
}
