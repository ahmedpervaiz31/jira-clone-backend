import { keywordSearch } from '../utils/rag.helper.js';

// POST /api/rag/search
export async function searchRag(req, res) {
	try {
		const { query } = req.body;
		const userId = req.user?._id || req.body.userId; 
		if (!query || !userId) {
			return res.status(400).json({ error: 'Missing query or userId' });
		}
		const results = await keywordSearch(query, userId);
		res.json(results);
	} catch (err) {
		res.status(500).json({ error: 'RAG search failed', details: err.message });
	}
}
