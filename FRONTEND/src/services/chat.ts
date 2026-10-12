import api from "./api";
import type { ChatConversation, ChatMessage } from "../types";

export const getChatMessages = async (
  userId?: number,
): Promise<ChatMessage[]> => {
  const { data } = await api.get<ChatMessage[]>("/chat/messages", {
    params: userId ? { user_id: userId } : undefined,
  });
  return data;
};

export const getChatConversations = async (): Promise<ChatConversation[]> => {
  const { data } = await api.get<ChatConversation[]>("/chat/conversations");
  return data;
};
