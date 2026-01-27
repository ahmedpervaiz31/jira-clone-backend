import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';

export async function syncTaskToRagIndex(task, action = 'upsert') {
    if (!task) return;
    if (action === 'delete') {
        deleteFromIndex('task', task.id || task._id);
    } else {
        upsertToIndex('task', task);
    }
}
