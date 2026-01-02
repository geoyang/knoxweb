// Placeholder chat API
export const chatApi = {
  getConversations: async () => {
    return { success: true, data: { conversations: [] } };
  },
  getTotalUnreadCount: async () => {
    return 0;
  },
};
