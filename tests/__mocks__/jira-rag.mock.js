export const ragSearch = async () => ({
    condensed: { mode: 'NO_ACTION' },
    boards: [],
    tasks: [],
    users: [],
    boardSummaryText: '',
    globalSummaryText: '',
    searchQueryUsed: ''
});

export const batchIndexer = async () => { };
export const upsertToIndex = async () => { };
export const deleteFromIndex = async () => { };

export const askGroq = async () => ({
    type: 'TEXT',
    content: 'Mocked Groq Response'
});

export const SYSTEM_PROMPTS = {
    SYNTHESIS_PROMPT: 'mock-synthesis-prompt'
};
