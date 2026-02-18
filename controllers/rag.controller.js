import { ragSearch } from '../../jira-rag/search.js';
import { batchIndexer } from '../../jira-rag/pipeline.js';
import { askGroq, processGroqResponse } from '../../jira-rag/groqClient.js';
import { formatContextChunks } from '../utils/rag.helpers.js';
import Board from '../models/Board.model.js';

// POST /api/rag/index/batch - batch indexer
export async function batchIndex(req, res) {
    try {
        await batchIndexer();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/rag/search - RAG search endpoint
export async function searchRag(req, res) {
    const userId = req.user?._id || req.body.userId;
    try {
        const { query, topK = 10, boardId, history = [] } = req.body;

        let activeBoardName = null;
        if (boardId) {
            try {
                const board = await Board.findById(boardId);
                if (board) activeBoardName = board.name;
            } catch (err) {
                console.error("Failed to fetch active board name for id", boardId, ":", err);
            }
        }

        const { boards, tasks, users, boardSummaryText, globalSummaryText, searchQueryUsed } =
            await ragSearch(query, boardId, topK, history, activeBoardName);

        const contextChunks = formatContextChunks({ boards, tasks, users, boardSummaryText, globalSummaryText });

        const answer = await askGroq(query, contextChunks, {
            activeBoardName,
            history,
            target: searchQueryUsed,
            currentDate: new Date().toISOString()
        });

        res.json({
            answer: processGroqResponse(answer),
            context: { boards, tasks, users, boardSummaryText, globalSummaryText },
            searchQueryUsed
        });

    } catch (err) {
        res.status(500).json({ error: 'RAG search failed', details: err.message });
        return;
    }
}