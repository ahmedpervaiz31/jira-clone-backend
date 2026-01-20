import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';
import { chunkBoard } from '../../jira-rag/chunker.js';

export async function syncBoardToRagIndex(board, action = 'upsert') {
    if (!board) return;
    if (action === 'delete') {
        await deleteFromIndex({ type: 'board', id: board.id || board._id });
    } else {
        const text = chunkBoard(board);
        await upsertToIndex({
            type: 'board',
            id: board.id || board._id,
            text,
            metadata: {
                name: board.name,
                key: board.key,
                flag: board.flag,
            },
        });
    }
}
