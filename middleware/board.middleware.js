import { upsertToIndex, deleteFromIndex } from '../../jira-rag/pipeline.js';

export async function syncBoardToRagIndex(board, action = 'upsert') {
    if (!board) return;
    if (action === 'delete') {
        deleteFromIndex('board', board.id || board._id);
    } else {
        upsertToIndex('board', board);
    }
}
