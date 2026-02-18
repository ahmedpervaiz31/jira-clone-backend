export function formatContextChunks(data) {
    const { boards = [], tasks = [], users = [], boardSummaryText, globalSummaryText } = data;

    return [
        globalSummaryText,
        boardSummaryText,
        ...boards.map(b => `Board Info: ${b.name} (${b.key})`),
        ...tasks.map((t, index) => {
            const boardName = t.boardName || 'Unknown';
            const assignedTo = t.assignedTo || 'Unassigned';

            return `[Task Detail #${index + 1}] Title: ${t.title}. Board: ${boardName}. Status: ${t.status}. Due: ${t.dueDate || 'No date'}. Assigned to: ${assignedTo}. Description: ${t.description || 'N/A'}`;
        }),
        ...users.map(u => `User Info: ${u.username}`)
    ].filter(Boolean);
}