import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComments,
  faMagnifyingGlass,
  faPaperPlane,
  faUserPlus,
  faCircleInfo,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../services/apiClient";
import { formatDateTimeForCalendar } from "../../lib/nepaliCalendar";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { ListPane } from "../layout/ListPane";
import { RightRail } from "../layout/RightRail";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { EmptyState } from "../ui/EmptyState";

interface MessageUser {
  id: number;
  email: string;
  name: string;
}

interface Conversation {
  user: MessageUser;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface Message {
  id: number;
  body: string;
  created_at: string;
  isSelf: boolean;
}

interface Contact extends MessageUser {
  roles: string[];
}

export const MessagesView: React.FC = () => {
  const { calendarType, language } = useCollegeOS();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [peer, setPeer] = useState<MessageUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refreshConversations = async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>(
      "/messages",
    );
    setConversations(result.conversations);
  };

  const openConversation = async (user: MessageUser) => {
    setPeer(user);
    setError("");
    try {
      const result = await apiRequest<{
        user: MessageUser;
        messages: Message[];
      }>(`/messages/${user.id}`);
      setPeer(result.user);
      setMessages(result.messages);
      await refreshConversations();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open this conversation.",
      );
    }
  };

  useEffect(() => {
    let active = true;
    apiRequest<{ conversations: Conversation[] }>("/messages")
      .then((result) => {
        if (active) setConversations(result.conversations);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load messages.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const searchContacts = async (event: React.FormEvent) => {
    event.preventDefault();
    setSearching(true);
    setError("");
    try {
      const result = await apiRequest<{ users: Contact[] }>(
        `/messages/contacts?q=${encodeURIComponent(contactQuery)}`,
      );
      setContacts(result.users);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Contact search failed.",
      );
    } finally {
      setSearching(false);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!peer || !draft.trim()) return;
    setSending(true);
    setError("");
    try {
      await apiRequest(`/messages/${peer.id}`, {
        method: "POST",
        body: JSON.stringify({ body: draft }),
      });
      setDraft("");
      await openConversation(peer);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  };

  const unreadTotal = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

  return (
    <WorkspaceLayout
      title="Messages"
      icon={faComments}
      toolbar={
        <span className="text-sm text-slate-500">
          {unreadTotal > 0
            ? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}`
            : "No unread messages"}
        </span>
      }
      listPane={
        <ListPane
          label="Direct conversations"
          footer={`${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`}
          toolbar={
            <form onSubmit={searchContacts} className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                  aria-hidden="true"
                />
                <input
                  value={contactQuery}
                  onChange={(event) => setContactQuery(event.target.value)}
                  placeholder="Find a person"
                  aria-label="Find institutional users"
                  className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 transition focus:border-[var(--color-primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                isLoading={searching}
                loadingLabel="Searching"
                className="h-10 min-h-10"
              >
                Search
              </Button>
            </form>
          }
        >
          {contacts.length > 0 && (
            <div className="border-b border-slate-200 p-2">
              <p className="cos-eyebrow px-2 pb-1.5">Institutional directory</p>
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => void openConversation(contact)}
                  className="block w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
                >
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {contact.name || contact.email}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {contact.email}
                    {contact.roles.length > 0
                      ? ` · ${contact.roles.join(", ").replace(/_/g, " ")}`
                      : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="p-3 pb-1">
            <p className="cos-eyebrow">Direct messages</p>
          </div>

          {loading ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              Loading conversations...
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              No conversations yet. Search for an institutional user to begin.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((conversation) => {
                const isSelected = peer?.id === conversation.user.id;
                return (
                  <li key={conversation.user.id}>
                    <button
                      type="button"
                      onClick={() => void openConversation(conversation.user)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`w-full cursor-pointer border-l-[3px] px-4 py-3.5 text-left transition ${
                        isSelected
                          ? "border-l-[var(--color-primary)] bg-[var(--color-primary-soft)]/50"
                          : "border-l-transparent hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                          {conversation.user.name || conversation.user.email}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="shrink-0 rounded-md bg-[var(--color-primary)] px-1.5 py-0.5 text-xs font-semibold text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-sm text-slate-500">
                        {conversation.lastMessage}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ListPane>
      }
      rightRail={
        <RightRail
          label="Conversation details"
          actions={[
            {
              icon: faUserPlus,
              label: "Start a new conversation",
              onClick: () =>
                document
                  .querySelector<HTMLInputElement>(
                    'input[aria-label="Find institutional users"]',
                  )
                  ?.focus(),
            },
            {
              icon: faCircleInfo,
              label: "Conversation participants",
              disabled: !peer,
            },
          ]}
        />
      }
    >
      {error && (
        <div className="px-5 pt-4">
          <Alert variant="error" onDismiss={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}

      {peer ? (
        <section className="flex min-h-[60vh] flex-col" aria-label="Conversation">
          <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5">
            <IconButton
              icon={faArrowLeft}
              label="Back to conversations"
              onClick={() => {
                setPeer(null);
                setMessages([]);
              }}
              className="lg:hidden"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900">
                {peer.name || peer.email}
              </p>
              <p className="truncate text-sm text-slate-500">{peer.email}</p>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-5">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">
                No messages yet. Start the conversation.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.isSelf ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 ${
                      message.isSelf
                        ? "bg-[var(--color-primary)] text-white"
                        : "border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <time
                      dateTime={message.created_at}
                      className={`mb-1 block text-xs ${
                        message.isSelf ? "opacity-80" : "text-slate-500"
                      }`}
                    >
                      {formatDateTimeForCalendar(
                        message.created_at,
                        calendarType,
                        language,
                      )}
                    </time>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={sendMessage}
            className="flex items-end gap-2 border-t border-slate-200 bg-white px-5 py-4"
          >
            <label htmlFor="message-draft" className="sr-only">
              Write a private message
            </label>
            <textarea
              id="message-draft"
              required
              maxLength={5000}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a private message"
              className="cos-input min-h-11 flex-1 resize-y py-2.5 leading-relaxed"
            />
            <IconButton
              icon={faPaperPlane}
              label="Send message"
              variant="primary"
              type="submit"
              disabled={sending || !draft.trim()}
            />
          </form>
        </section>
      ) : (
        <div className="p-6">
          <EmptyState
            icon={faComments}
            title="Choose a conversation"
            description="Select an existing conversation or search the institutional directory to start a new one."
          />
        </div>
      )}

      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        Messages are stored by CollegeOS and protected by authenticated
        participant checks; end-to-end encryption is not provided.
      </p>
    </WorkspaceLayout>
  );
};

export default MessagesView;