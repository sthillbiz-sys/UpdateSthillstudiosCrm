import { useEffect, useMemo, useState } from 'react';
import { Send, Search, Plus, User } from 'lucide-react';
import { usePresence } from '../lib/presence';
import { useAuth } from '../lib/auth';
import { apiGet, apiPost } from '../lib/api';

interface ApiConversation {
  id: number;
  name: string;
  participant_count: number;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string;
  unread_count: number;
}

interface ApiMessage {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  sender_name: string;
  content: string;
  created_at: string;
}

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isOwn: boolean;
}

interface Conversation {
  id: number;
  name: string;
  participantCount: number;
  lastMessage: string;
  timestamp: string;
  unread: number;
}

export function Messages() {
  const { user } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationMessages, setConversationMessages] = useState<Record<number, Message[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { teamPresence } = usePresence();

  const selectedConversationMeta = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversation) || null,
    [conversations, selectedConversation],
  );

  const toDisplayDate = (raw: string | null | undefined, fallback = ''): string => {
    if (!raw) {
      return fallback;
    }
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return fallback;
    }

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const mapConversation = (conversation: ApiConversation): Conversation => ({
    id: conversation.id,
    name: conversation.name,
    participantCount: conversation.participant_count || 0,
    lastMessage: conversation.last_message || 'No messages yet',
    timestamp: toDisplayDate(conversation.last_message_at || conversation.updated_at, ''),
    unread: conversation.unread_count || 0,
  });

  const mapMessage = (message: ApiMessage): Message => ({
    id: String(message.id),
    sender: message.sender_name || 'User',
    content: message.content,
    timestamp: toDisplayDate(message.created_at, ''),
    isOwn: message.sender_user_id === user?.id,
  });

  const getConversationInitials = (name: string): string => {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
    return initials || 'C';
  };

  const loadConversations = async () => {
    setLoadingConversations(true);
    setError(null);

    try {
      const rows = await apiGet<ApiConversation[]>('/messages/conversations');
      const mapped = Array.isArray(rows) ? rows.map(mapConversation) : [];
      setConversations(mapped);
      setSelectedConversation((current) => {
        if (current && mapped.some((conversation) => conversation.id === current)) {
          return current;
        }
        return mapped.length > 0 ? mapped[0].id : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadConversationMessages = async (conversationId: number) => {
    setLoadingMessages(true);
    setError(null);

    try {
      const rows = await apiGet<ApiMessage[]>(`/messages/conversations/${conversationId}/messages`);
      const mapped = Array.isArray(rows) ? rows.map(mapMessage) : [];

      setConversationMessages((prev) => ({
        ...prev,
        [conversationId]: mapped,
      }));
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unread: 0 }
            : conversation,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }
    void loadConversationMessages(selectedConversation);
  }, [selectedConversation]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500';
      case 'busy':
      case 'in_meeting':
        return 'bg-red-500';
      case 'on_break':
      case 'lunch':
        return 'bg-yellow-500';
      case 'away':
        return 'bg-orange-500';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'busy':
        return 'Busy';
      case 'in_meeting':
        return 'In a Meeting';
      case 'on_break':
        return 'On Break';
      case 'lunch':
        return 'At Lunch';
      case 'away':
        return 'Away';
      case 'offline':
        return 'Offline';
      default:
        return status;
    }
  };

  const messages: Message[] = selectedConversation ? conversationMessages[selectedConversation] || [] : [];

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedConversation || sending) return;

    setSending(true);
    setError(null);

    try {
      const message = await apiPost<ApiMessage>(
        `/messages/conversations/${selectedConversation}/messages`,
        { content },
      );
      const newMessage = mapMessage(message);

      setConversationMessages((prev) => ({
        ...prev,
        [selectedConversation]: [...(prev[selectedConversation] || []), newMessage],
      }));
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === selectedConversation
            ? {
                ...conversation,
                lastMessage: newMessage.content,
                timestamp: newMessage.timestamp || 'Now',
                unread: 0,
              }
            : conversation,
        ),
      );
      setMessageInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-100">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-700 mb-3">Team Status</h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {teamPresence.slice(0, 5).map((member) => (
              <div key={member.user_id} className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${getStatusColor(member.status)}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {member.name || member.employee?.full_name || 'Team Member'}
                  </p>
                  <p className="text-[10px] text-gray-600">{getStatusLabel(member.status)}</p>
                </div>
              </div>
            ))}
            {teamPresence.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-2">No team members online</p>
            )}
          </div>
        </div>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900">Messages</h2>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
              title="New conversations will be available in a future update"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations && (
            <div className="p-4 text-sm text-gray-500">Loading conversations...</div>
          )}

          {!loadingConversations && filteredConversations.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No conversations found.</div>
          )}

          {!loadingConversations && filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`w-full p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left ${
                selectedConversation === conv.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold flex-shrink-0">
                  {getConversationInitials(conv.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-gray-900 truncate">
                      {conv.name}
                    </h3>
                    <span className="text-xs text-gray-500">{conv.timestamp}</span>
                  </div>
                  <p className="text-xs text-gray-600 truncate">{conv.lastMessage}</p>
                </div>
                {conv.unread > 0 && (
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-semibold">
                    {conv.unread}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {error && (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {selectedConversation ? (
          <>
            <div className="p-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold">
                  {getConversationInitials(selectedConversationMeta?.name || 'Conversation')}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {selectedConversationMeta?.name || 'Conversation'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {(selectedConversationMeta?.participantCount || 0) > 0
                      ? `${selectedConversationMeta?.participantCount || 0} members`
                      : 'No members'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingMessages && (
                <div className="text-sm text-gray-500">Loading messages...</div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div className="text-sm text-gray-500">No messages yet. Start the conversation.</div>
              )}

              {!loadingMessages && messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-3 rounded-2xl ${
                      message.isOwn
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 border border-gray-200'
                    }`}
                  >
                    {!message.isOwn && (
                      <p className="text-xs font-semibold mb-1 text-gray-600">
                        {message.sender}
                      </p>
                    )}
                    <p className="text-sm">{message.content}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.isOwn ? 'text-blue-200' : 'text-gray-500'
                      }`}
                    >
                      {message.timestamp}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSendMessage()}
                  disabled={sending}
                  className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => void handleSendMessage()}
                  disabled={sending || messageInput.trim() === ''}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">Select a conversation</p>
              <p className="text-sm">Choose a conversation from the list to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
