import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';

export async function syncUserToRagIndex(user, action = 'upsert') {
    if (!user) return;
    if (action === 'delete') {
        deleteFromIndex('user', user.id || user._id);
    } else {
        upsertToIndex('user', user);
    }
}
