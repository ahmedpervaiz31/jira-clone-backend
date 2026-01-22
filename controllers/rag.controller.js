import { ragSearch, batchIndexer } from '../../jira-rag/index.js';
import { askGroq, processGroqResponse } from '../../jira-rag/groqClient.js';

// POST /api/rag/index/batch - batch indexer
export async function batchIndex(req, res) {
    try {
        await batchIndexer();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/rag/search - RAG search 
export async function searchRag(req, res) {
    const userId = req.user?._id || req.body.userId;
    try {
        const { query, topK = 5 } = req.body;
        if (!query) {
            return res.status(400).json({ 
                error: 'Missing query',
                debug: { hasUser: !!req.user } 
            });
        }
        const { boards, tasks, users, boardSummaries, globalSummaryText } = await ragSearch(query, userId, topK);

        const contextChunks = [
            globalSummaryText,
            ...boardSummaries.map(b => b.summary),
            ...boards.map(b => `Board: ${b.name} (${b.key})`),
            ...tasks.map(t => `Task: ${t.title} [${t.status}]`),
            ...users.map(u => `User: ${u.username}`)
        ];

        const sanitizedQuery = processGroqResponse(query);
        const answer = await askGroq(sanitizedQuery, contextChunks);
        const processedAnswer = processGroqResponse(answer);

        res.json({ answer: processedAnswer, context: { boards, tasks, users, boardSummaries, globalSummaryText } });
    } catch (err) {
        res.status(500).json({ error: 'RAG search failed', details: err.message });
    }
}
