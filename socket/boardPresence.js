
// boardUsers: Map<boardId, Map<userId, userObject>>
const boardUsers = new Map();


function broadcastUserList(io, boardId) {
  const users = Array.from((boardUsers.get(boardId) && boardUsers.get(boardId).values()) || []);
  io.to(boardId).emit('user:presence', { boardId, users });
}


export function handleBoardPresence(io, socket) {
  let currentBoardId = null;
  let currentUserId = null;

  socket.on('join_board', ({ boardId, user }) => {
    // leave prev board
    if (currentBoardId && currentUserId) {
      socket.leave(currentBoardId);
      if (boardUsers.has(currentBoardId)) {
        boardUsers.get(currentBoardId).delete(currentUserId);
        if (boardUsers.get(currentBoardId).size === 0) {
          boardUsers.delete(currentBoardId);
        } else {
          broadcastUserList(io, currentBoardId);
        }
      }
    }
    // join new
    currentBoardId = boardId;
    currentUserId = (user && user.id) ? user.id : socket.id;
    socket.join(boardId);
    if (!boardUsers.has(boardId)) boardUsers.set(boardId, new Map());
    boardUsers.get(boardId).set(currentUserId, user || { id: socket.id, username: socket.id });
    broadcastUserList(io, boardId);
  });

  socket.on('leave_board', () => {
    if (currentBoardId && currentUserId && boardUsers.has(currentBoardId)) {
      boardUsers.get(currentBoardId).delete(currentUserId);
      if (boardUsers.get(currentBoardId).size === 0) {
        boardUsers.delete(currentBoardId);
      } else {
        broadcastUserList(io, currentBoardId);
      }
      socket.leave(currentBoardId);
    }
    currentBoardId = null;
    currentUserId = null;
  });

  socket.on('disconnect', () => {
    if (currentBoardId && currentUserId && boardUsers.has(currentBoardId)) {
      boardUsers.get(currentBoardId).delete(currentUserId);
      if (boardUsers.get(currentBoardId).size === 0) {
        boardUsers.delete(currentBoardId);
      } else {
        broadcastUserList(io, currentBoardId);
      }
    }
  });
}