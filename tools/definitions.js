export const JIRA_TOOLS = [
    {
        type: "function",
        function: {
            name: "createBoard",
            description: "Create a new board in the system.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "The name of the board (e.g., 'Project Alpha', 'Marketing Sprint')"
                    },
                    key: {
                        type: "string",
                        description: "Optional short key for the board (e.g., 'PA', 'MKT'). If omitted, it will be auto-generated."
                    },
                    flag: {
                        type: "string",
                        enum: ["public", "private"],
                        description: "Visibility of the board. Defaults to 'public' if omitted."
                    },
                    members: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "List of usernames to add as members to the board."
                    }
                },
                required: ["name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "deleteBoard",
            description: "Delete an existing board and all its tasks.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The unique ID of the board to delete."
                    }
                },
                required: ["id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "createTask",
            description: "Create a new task on a specific board.",
            parameters: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "Title or summary of the task."
                    },
                    status: {
                        type: "string",
                        description: "Initial status column (e.g., 'To Do', 'In Progress')."
                    },
                    boardId: {
                        type: "string",
                        description: "The ID of the board where the task belongs."
                    },
                    description: {
                        type: "string",
                        description: "Detailed description of the task."
                    },
                    assignedTo: {
                        type: "string",
                        description: "Username of the person assigned to this task."
                    },
                    dueDate: {
                        type: "string",
                        description: "Due date in ISO 8601 format (YYYY-MM-DD)."
                    },
                    dependencies: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "List of task IDs that this task depends on."
                    }
                },
                required: ["title", "status", "boardId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "updateTask",
            description: "Update details of an existing task (title, description, assignee, etc.). Do NOT use this for moving tasks between columns.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The ID of the task to update."
                    },
                    title: {
                        type: "string",
                        description: "New title for the task."
                    },
                    description: {
                        type: "string",
                        description: "New description."
                    },
                    assignedTo: {
                        type: "string",
                        description: "New assignee username."
                    },
                    dueDate: {
                        type: "string",
                        description: "New due date (ISO string)."
                    },
                    dependencies: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "Updated list of dependency task IDs."
                    }
                },
                required: ["id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "moveTask",
            description: "Move a task to a different status column. If prevRank/nextRank are omitted, the task is moved to the END of the target column.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The ID of the task to move."
                    },
                    targetStatus: {
                        type: "string",
                        description: "The destination status column (e.g., 'Done', 'In Progress')."
                    },
                    prevRank: {
                        type: "string",
                        description: "Optional. The LexoRank of the task immediately BEFORE this one. Defaults to last task's rank."
                    },
                    nextRank: {
                        type: "string",
                        description: "Optional. The LexoRank of the task immediately AFTER this one. Defaults to null (end of column)."
                    }
                },
                required: ["id", "targetStatus"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "deleteTask",
            description: "Permanently delete a task.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description: "The ID of the task to delete."
                    }
                },
                required: ["id"]
            }
        }
    }
];
