import { ragSearch } from '../../jira-rag/search.js';
import { batchIndexer } from '../../jira-rag/pipeline.js';
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

// POST /api/rag/search - RAG search endpoint
export async function searchRag(req, res) {
    const userId = req.user?._id || req.body.userId;
    try {
        const { query, topK = 10, boardId, history = [] } = req.body;

        const { boards, tasks, users, boardSummaries, globalSummaryText, searchQueryUsed } = 
            await ragSearch(query, userId, boardId, topK, history); 

        const contextChunks = [
            globalSummaryText,
            ...boardSummaries.map(b => 
                `### Board Overview: ${b.name}
                - Statistics: Total: ${b.stats.total} | To Do: ${b.stats.toDo} | In Progress: ${b.stats.inProgress} | Done: ${b.stats.done}
                - All Task Titles: ${b.taskTitles.join(', ')}`
            ),
            ...boards.map(b => `Board Info: ${b.name} (${b.key})`), 
            ...tasks.map((t, index) => {
                const parentBoard = boards.find(b => b._id.toString() === t.boardId.toString());
                const boardName = parentBoard ? parentBoard.name : 'Unknown';
                
                const assignee = users.find(u => u.username === t.assignedTo);
                const assignedTo = assignee ? assignee.username : 'Unassigned';

                return `[Task Detail #${index + 1}] Title: ${t.title}. Board: ${boardName}. Status: ${t.status}. Due: ${t.dueDate || 'No date'}. Assigned to: ${assignedTo}. Description: ${t.description || 'N/A'}`;}),
            ...users.map(u => `User Available: ${u.username}`) 
        ].filter(Boolean);

        const activeBoardName = boards.find(b => b._id.toString() === boardId)?.name || null;

        const answer = await askGroq(query, contextChunks, { 
            activeBoardName,
            history, 
            target: searchQueryUsed 
        }); 

        res.json({ 
            answer: processGroqResponse(answer), 
            context: { boards, tasks, users, boardSummaries, globalSummaryText },
            searchQueryUsed 
        });

    } catch (err) {
        res.status(500).json({ error: 'RAG search failed', details: err.message });
        return;
    }
}