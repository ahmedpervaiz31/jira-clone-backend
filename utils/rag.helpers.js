import { searchBoardsHelper } from './board.helpers.js';
import { searchTasksHelper } from './task.helpers.js';
import { executeToolCall } from '../tools/executor.js';
import { askGroq } from '../../jira-rag/groqClient.js';
import { SYSTEM_PROMPTS } from '../../jira-rag/groqPrompt.js';
import Board from '../models/Board.model.js';

export function formatContextChunks(data) {
    const { boards = [], tasks = [], users = [], boardSummaryText, globalSummaryText } = data;

    return [
        globalSummaryText,
        boardSummaryText,
        ...boards.map(b => `Board Info: ${b.name} (${b.key}) (ID: ${b._id || b.mongoId})`),
        ...tasks.map((t, index) => {
            const boardName = t.boardName || 'Unknown';
            const assignedTo = t.assignedTo || 'Unassigned';

            return `[Task Detail #${index + 1}] (ID: ${t._id || t.mongoId}) Title: ${t.title}. Board: ${boardName}. Status: ${t.status}. Due: ${t.dueDate || 'No date'}. Assigned to: ${assignedTo}. Description: ${t.description || 'N/A'}`;
        }),
        ...users.map(u => `User Info: ${u.username}`)
    ].filter(Boolean);
}

const isLikelyName = (id) => id && typeof id === 'string' && !/^[0-9a-fA-F]{24}$/.test(id);

export async function resolveToolArgs(toolName, args, context) {
    const { boards, tasks, activeBoardName, boardId } = context;

    if (isLikelyName(args.boardId)) {
        const targetName = args.boardId.toLowerCase();
        let resolvedBoardId = null;

        const contextBoard = boards.find(b => b.name.toLowerCase() === targetName);
        if (contextBoard) {
            resolvedBoardId = contextBoard.mongoId || contextBoard._id;
        }

        if (!resolvedBoardId && activeBoardName && activeBoardName.toLowerCase() === targetName && boardId) {
            resolvedBoardId = boardId;
        }

        if (!resolvedBoardId) {
            const foundBoards = await searchBoardsHelper(args.boardId);
            if (foundBoards && foundBoards.length > 0) {
                resolvedBoardId = foundBoards[0]._id.toString();
            }
        }

        if (resolvedBoardId) {
            args.boardId = resolvedBoardId;
        } else {
            throw new Error(`Board "${args.boardId}" not found.`);
        }
    }

    if (isLikelyName(args.id)) {
        const targetName = args.id;
        let resolvedId = null;

        if (toolName.toLowerCase().includes('board')) {
            const contextBoard = boards.find(b => b.name.toLowerCase() === targetName.toLowerCase());
            if (contextBoard) {
                resolvedId = contextBoard.mongoId || contextBoard._id;
            }

            if (!resolvedId) {
                const foundBoards = await searchBoardsHelper(targetName);
                if (foundBoards && foundBoards.length > 0) {
                    resolvedId = foundBoards[0]._id.toString();
                }
            }

            if (!resolvedId) throw new Error(`Board "${targetName}" not found.`);
            args.id = resolvedId;

        } else {
            const contextTask = tasks.find(t => t.title.toLowerCase() === targetName.toLowerCase() || t.displayId === targetName);
            if (contextTask) {
                resolvedId = contextTask.mongoId || contextTask._id;
            }

            if (!resolvedId) {
                const foundTasks = await searchTasksHelper({ q: targetName });
                if (foundTasks && foundTasks.length > 0) {
                    resolvedId = foundTasks[0]._id.toString();
                }
            }

            if (!resolvedId) throw new Error(`Task "${targetName}" not found.`);
            args.id = resolvedId;
        }
    }

    if (args.dependencies && Array.isArray(args.dependencies)) {
        const resolvedDeps = await Promise.all(args.dependencies.map(async (dep) => {
            if (isLikelyName(dep)) {
                const depLower = dep.toLowerCase();
                const contextTask = tasks.find(t =>
                    t.title.toLowerCase() === depLower ||
                    (t.displayId && t.displayId.toLowerCase() === depLower)
                );
                if (contextTask) return contextTask.mongoId || contextTask._id;

                const found = await searchTasksHelper({ q: dep });
                if (found.length > 0) {
                    return found[0]._id.toString();
                }
                throw new Error(`Dependency "${dep}" not found.`);
            }
            return dep;
        }));
        args.dependencies = resolvedDeps;
    }

    return args;
}

export async function getActiveBoardName(boardId) {
    if (!boardId) return null;
    try {
        const board = await Board.findById(boardId);
        return board ? board.name : null;
    } catch (err) {
        console.error("Error fetching active board:", err);
        return null;
    }
}

export async function handleAgenticActions({ groqResult, user, query, history, contextData }) {
    const { boards, tasks, users, activeBoardName, boardId } = contextData;
    const results = [];
    const executionLog = [];

    for (const call of groqResult.toolCalls) {
        const toolName = call.function.name;
        let args = JSON.parse(call.function.arguments);
        const originalArgs = { ...args };

        try {
            const resolvedArgs = await resolveToolArgs(toolName, args, { boards, tasks, activeBoardName, boardId });

            const result = await executeToolCall(toolName, resolvedArgs, user);
            results.push(result);

            executionLog.push({
                tool: toolName,
                args: originalArgs,
                status: "Success",
                details: result.message || "Action completed"
            });

        } catch (error) {
            console.error(`[Orchestrator] Resolution/Execution failed for ${toolName}:`, error);
            results.push({ error: error.message, tool: toolName });

            executionLog.push({
                tool: toolName,
                args: originalArgs,
                status: "Failed",
                error: error.message
            });
        }
    }

    // --- SYNTHESIS PASS ---
    const synthesisContext = [
        `User Original Query: ${query}`
    ];

    let finalResponseContent = "";

    try {
        const secondPass = await askGroq(query, synthesisContext, {
            mode: "INFORMATIONAL",
            systemPrompt: SYSTEM_PROMPTS.SYNTHESIS_PROMPT,
            executionLog: JSON.stringify(executionLog, null, 2),
            activeBoardName,
            history,
            currentDate: new Date().toISOString()
        });
        finalResponseContent = secondPass.content;
    } catch (synthError) {
        console.error("Synthesis failed:", synthError);
        finalResponseContent = "Actions processed. (Summary generation failed)";
    }

    return {
        type: "TEXT",
        content: finalResponseContent,
        toolResults: results,
        context: { boards, tasks, users }
    };
}