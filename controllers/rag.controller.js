import { ragSearch } from '../../jira-rag/search.js';
import { batchIndexer } from '../../jira-rag/pipeline.js';
import { askGroq } from '../../jira-rag/groqClient.js';
import { formatContextChunks, getActiveBoardName, handleAgenticActions } from './rag.helpers.js';

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
    const user = req.user || null;
    try {
        const { query, topK = 10, boardId, history = [] } = req.body;

        const activeBoardName = await getActiveBoardName(boardId);

        const searchResult = await ragSearch(query, boardId, topK, history, activeBoardName);
        const { condensed, boards, tasks, users, boardSummaryText, globalSummaryText, searchQueryUsed } = searchResult;

        const contextChunks = formatContextChunks({ boards, tasks, users, boardSummaryText, globalSummaryText });

        const groqResult = await askGroq(query, contextChunks, {
            activeBoardName,
            history,
            mode: condensed.mode,
            target: searchQueryUsed,
            currentDate: new Date().toISOString()
        });

        if (groqResult.type === "TOOL_CALL") {
            const agentResponse = await handleAgenticActions({
                groqResult,
                user,
                query,
                history,
                contextData: { boards, tasks, users, activeBoardName, boardId },
                io: req.app.get('socketio'),
                originalQuery: query
            });

            return res.json(agentResponse);
        }

        res.json({
            ...groqResult,
            context: { boards, tasks, users, boardSummaryText, globalSummaryText },
            searchQueryUsed
        });

    } catch (err) {
        console.error("RAG Controller Error:", err);
        res.status(500).json({
            error: 'RAG search failed',
            type: "TEXT",
            content: "Something went wrong while processing that request."
        });
    }
}