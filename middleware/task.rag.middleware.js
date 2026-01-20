import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';
import { chunkTask } from '../../jira-rag/chunker.js';

export async function syncTaskToRagIndex(task, action = 'upsert') {
    if (!task) return;
    if (action === 'delete') {
        await deleteFromIndex({ type: 'task', id: task.id || task._id });
    } else {
        const text = chunkTask(task);
        await upsertToIndex({
            type: 'task',
            id: task.id || task._id,
            text,
            metadata: {
                title: task.title,
                status: task.status,
                assignedTo: task.assignedTo,
                boardId: task.boardId?.toString(),
            },
        });
    }
}
