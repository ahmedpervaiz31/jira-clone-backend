import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';
import { chunkUser } from '../../jira-rag/chunker.js';

export async function syncUserToRagIndex(user, action = 'upsert') {
    if (!user) return;
    if (action === 'delete') {
        await deleteFromIndex({ type: 'user', id: user.id || user._id });
    } else {
        const text = chunkUser(user);
        await upsertToIndex({
            type: 'user',
            id: user.id || user._id,
            text,
            metadata: {
                username: user.username,
            },
        });
    }
}
