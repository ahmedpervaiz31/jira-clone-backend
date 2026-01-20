import { ragSearch, batchIndexer } from '../../jira-rag/index.js';

// POST /api/rag/index/batch - batch indexer
export async function batchIndex(req, res) {
    try {
        await batchIndexer();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// POST /api/rag/search - rag search
export async function searchRag(req, res) {
    const userId = req.user?._id || req.body.userId;
    try {
        const { query, type = 'keyword', topK = 5 } = req.body;
        if (!query) {
            return res.status(400).json({ 
                error: 'Missing query',
                debug: { hasUser: !!req.user } 
            });
        }
        const results = await ragSearch(query, userId, { type, topK });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'RAG search failed', details: err.message });
    }
}