"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvexAuth,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReportDialog } from "@/components/report-dialog";
import { MessageComposerTools } from "@/components/message-composer-tools";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Home,
  Clock,
  Check,
  CheckCheck,
} from "lucide-react";

type Conversation = FunctionReturnType<typeof api.inbox.list>["page"][number];
type Folder = "all" | "unread" | "archived" | "blocked";
function ConversationItem({
  conv,
  selected,
  userId,
  onClick,
}: {
  conv: Conversation;
  selected: boolean;
  userId: Id<"users">;
  onClick: () => void;
}) {
  const unread =
    conv.tenantId === userId ? !conv.tenantRead : !conv.landlordRead;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-100",
        selected
          ? "bg-[#0f2044]/5 border-r-2 border-r-[#0f2044]"
          : "hover:bg-slate-50",
      )}
    >
      <div className="h-10 w-10 shrink-0 rounded-full bg-[#0f2044]/10 flex items-center justify-center overflow-hidden">
        {conv.otherUser?.avatar ? (
          <img
            src={conv.otherUser.avatar}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{conv.otherUser?.name[0]?.toUpperCase() ?? "?"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span
            className={cn(
              "text-sm truncate",
              unread ? "font-bold" : "font-medium",
            )}
          >
            {unread && <span aria-label="Unread">● </span>}
            {conv.otherUser?.name ?? "Deleted account"}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">
            {new Date(conv.lastMessageAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {conv.listing?.title ?? "Unavailable property"}
        </p>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {conv.lastMessage}
        </p>
      </div>
    </button>
  );
}
function MessageBubble({
  message,
  mine,
}: {
  message: Doc<"messages">;
  mine: boolean;
}) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          mine
            ? "bg-[#0f2044] text-white rounded-br-sm"
            : "bg-slate-100 text-slate-900 rounded-bl-sm",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {!mine && <ReportDialog messageId={message._id} />}
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] mt-1",
            mine ? "text-white/70 justify-end" : "text-slate-500",
          )}
        >
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {mine && message.origin === "inbox" && (
            <span
              className="inline-flex gap-1 items-center"
              title={
                message.read
                  ? "Recipient opened the conversation"
                  : "Saved in the recipient's inbox"
              }
            >
              {message.read ? (
                <CheckCheck className="h-4 w-4 text-sky-300" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {message.read ? "Read" : "Sent"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
function BlockedUsers() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.blockedUsers,
    {},
    { initialNumItems: 20 },
  );
  const unblock = useMutation(api.messages.unblockUser);
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-b p-3 space-y-3">
      <p className="text-xs text-slate-500">
        Messaging stays paused until you unblock. Any block set by the other
        person still applies.
      </p>
      {results.map((user) => (
        <div key={user.userId} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{user.name}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Unblock ${user.name}?`)) return;
              setBusy(true);
              try {
                await unblock({ userId: user.userId });
              } catch {
                toast.error("Unable to unblock user.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Unblock
          </Button>
        </div>
      ))}
      {status === "CanLoadMore" && (
        <Button size="sm" variant="outline" onClick={() => loadMore(20)}>
          More blocked users
        </Button>
      )}
      {status === "LoadingFirstPage" && <p>Loading…</p>}
    </div>
  );
}
export default function MessagesPage() {
  const searchParams = useSearchParams(),
    { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    isAuthenticated && userId ? { clerkId: userId } : "skip",
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("conv"),
  );
  const [folder, setFolder] = useState<Folder>("all"),
    [mobileThread, setMobileThread] = useState(!!searchParams.get("conv"));
  const {
    results: conversations,
    status: inboxStatus,
    loadMore: loadConversations,
  } = usePaginatedQuery(
    api.inbox.list,
    convexUser && isAuthenticated ? { folder } : "skip",
    { initialNumItems: 20 },
  );
  const inboxSummary = useQuery(
    api.inbox.summary,
    convexUser && isAuthenticated ? {} : "skip",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<{
    conversationId: string;
    content: string;
    requestId: string;
  } | null>(null);
  const [failedSends, setFailedSends] = useState<
    Record<
      string,
      { conversationId: string; content: string; requestId: string }
    >
  >({});
  const failedSend = selectedId ? failedSends[selectedId] : undefined;
  const [busy, setBusy] = useState(false),
    [focused, setFocused] = useState(false),
    [desktop, setDesktop] = useState(false);
  const selected = useQuery(
    api.inbox.conversation,
    isAuthenticated && convexUser && selectedId ? { id: selectedId } : "skip",
  );
  const {
    results: newestFirst,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.messages.listMessages,
    selected && isAuthenticated ? { conversationId: selected._id } : "skip",
    { initialNumItems: 50 },
  );
  const messages = [...newestFirst].reverse(),
    latestId = newestFirst[0]?._id;
  const send = useMutation(api.messages.sendMessage),
    markRead = useMutation(api.messages.markRead),
    setUnread = useMutation(api.messages.setUnread),
    archive = useMutation(api.messages.setArchived),
    block = useMutation(api.messages.setBlocked);
  const endRef = useRef<HTMLDivElement>(null),
    textareaRef = useRef<HTMLTextAreaElement>(null),
    sendingLock = useRef(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const draft = selectedId ? (drafts[selectedId] ?? "") : "";
  function updateDraft(value: string) {
    if (selectedId) setDrafts((prev) => ({ ...prev, [selectedId]: value }));
  }
  useEffect(() => {
    const conv = searchParams.get("conv");
    if (conv) {
      setSelectedId(conv);
      setMobileThread(true);
    }
  }, [searchParams]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setFocused(document.visibilityState === "visible" && document.hasFocus());
      setDesktop(media.matches);
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
      media.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (
      latestId &&
      focused &&
      !busy &&
      (desktop || mobileThread) &&
      selected &&
      convexUser
    )
      markRead({
        conversationId:
          [selected.tenantId, selected.landlordId].sort().join("_") +
          "_" +
          selected.listingId,
        userId: convexUser._id,
        throughMessageId: latestId,
      }).catch(() => toast.error("Unable to update read status."));
  }, [
    latestId,
    selected?._id,
    focused,
    desktop,
    mobileThread,
    convexUser?._id,
    markRead,
    busy,
  ]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [latestId, sending]);
  const filtered = conversations;
  async function perform(
    action: () => Promise<unknown>,
    success: string,
    clear = false,
  ) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      if (clear) {
        setSelectedId(null);
        setMobileThread(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to update conversation.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleSend() {
    if (
      !selected ||
      !convexUser ||
      !draft.trim() ||
      draft.trim().length > 2000 ||
      sendingLock.current ||
      selected.cannotMessage
    )
      return;
    const conversation = selected,
      content = draft.trim(),
      rawDraft = draft;
    const requestId =
      failedSend?.conversationId === selected._id &&
      failedSend.content === content
        ? failedSend.requestId
        : crypto.randomUUID();
    const attempt = { conversationId: selected._id, content, requestId };
    sendingLock.current = true;
    setSending(attempt);
    setFailedSends((prev) => {
      const next = { ...prev };
      delete next[conversation._id];
      return next;
    });
    try {
      await send({
        senderId: convexUser._id,
        receiverId:
          selected.tenantId === convexUser._id
            ? selected.landlordId
            : selected.tenantId,
        listingId: selected.listingId,
        content,
        clientRequestId: requestId,
        origin: "inbox",
      });
      setDrafts((prev) =>
        prev[conversation._id] === rawDraft
          ? { ...prev, [conversation._id]: "" }
          : prev,
      );
      if (selectedRef.current === conversation._id)
        textareaRef.current?.focus();
    } catch (err) {
      setFailedSends((prev) => ({ ...prev, [conversation._id]: attempt }));
      toast.error(
        err instanceof Error
          ? err.message
          : "Unable to send. Your draft is saved on this page.",
      );
    } finally {
      setSending(null);
      sendingLock.current = false;
    }
  }
  if (isAuthenticated && convexUser === null)
    return (
      <div className="p-6">
        <p>Complete your profile to use messaging.</p>
        <Link href="/onboarding" className="underline">
          Set up your account
        </Link>
      </div>
    );
  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className={cn(
          "w-full md:w-80 border-r border-slate-200 bg-white flex flex-col shrink-0",
          mobileThread ? "hidden md:flex" : "flex",
        )}
      >
        <header className="p-4 border-b">
          <h1 className="text-lg font-semibold text-slate-900">Messages</h1>
          <div
            className="flex flex-wrap gap-1 mt-3"
            aria-label="Message folders"
          >
            {(["all", "unread", "archived", "blocked"] as const).map((f) => (
              <button
                key={f}
                aria-pressed={folder === f}
                className={cn(
                  "text-xs rounded-md px-2 py-1.5 capitalize",
                  folder === f
                    ? "bg-[#0f2044] text-white"
                    : "bg-slate-100 text-slate-600",
                )}
                onClick={() => {
                  setFolder(f);
                  setSelectedId(null);
                  setMobileThread(false);
                }}
              >
                {f === "blocked" ? "Blocked users" : f}
              </button>
            ))}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {folder === "blocked" && isAuthenticated && convexUser && (
            <BlockedUsers />
          )}
          {inboxSummary && !inboxSummary.ready && (
            <p role="status" className="p-3 text-xs text-slate-500">
              Updating inbox history and folder counts…
            </p>
          )}
          {inboxStatus === "LoadingFirstPage" ? (
            <p className="p-5 text-sm text-slate-500">Loading conversations…</p>
          ) : !filtered?.length ? (
            <div className="p-6 text-center text-sm text-slate-500">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              {inboxStatus === "CanLoadMore" || !inboxSummary?.ready
                ? "No conversations loaded yet. More history may still be available."
                : "No conversations in this folder."}
            </div>
          ) : (
            filtered.map((conv) => (
              <ConversationItem
                key={conv._id}
                conv={conv}
                selected={selectedId === conv._id}
                userId={convexUser!._id}
                onClick={() => {
                  setSelectedId(conv._id);
                  setMobileThread(true);
                }}
              />
            ))
          )}
          {inboxStatus === "CanLoadMore" && (
            <Button
              className="m-3"
              variant="outline"
              onClick={() => loadConversations(20)}
            >
              More conversations
            </Button>
          )}
          {inboxStatus === "LoadingMore" && (
            <p role="status" className="p-3 text-sm">
              Loading more conversations…
            </p>
          )}
        </div>
      </aside>
      <section
        className={cn(
          "flex-1 flex-col bg-slate-50 min-w-0",
          mobileThread ? "flex" : "hidden md:flex",
        )}
      >
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
            <MessageSquare className="h-14 w-14 text-slate-300 mb-4" />
            <h2 className="font-medium">
              {selectedId
                ? selected === undefined
                  ? "Loading conversation…"
                  : "Conversation unavailable"
                : "Select a conversation"}
            </h2>
            <p className="text-sm mt-2">
              Choose a conversation to read and reply.
            </p>
          </div>
        ) : (
          <>
            <header className="bg-white border-b p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Back to conversations"
                  onClick={() => setMobileThread(false)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold truncate">
                    {selected.otherUser?.name ?? "Deleted account"}
                  </h2>
                  <p className="text-xs text-slate-500 flex gap-1 items-center">
                    <Home className="h-3 w-3" />
                    {selected.listing?.title ?? "Unavailable property"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    perform(
                      () => setUnread({ conversationId: selected._id }),
                      "Marked unread",
                      true,
                    )
                  }
                >
                  Mark unread
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    perform(
                      () =>
                        archive({
                          conversationId: selected._id,
                          archived: !selected.archived,
                        }),
                      selected.archived
                        ? "Conversation restored"
                        : "Conversation archived",
                      true,
                    )
                  }
                >
                  {selected.archived ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        selected.blockedByMe
                          ? "Unblock this user? Any block they set still applies."
                          : "Block this user? Messaging in both directions will stop across all properties.",
                      )
                    )
                      perform(
                        () =>
                          block({
                            conversationId: selected._id,
                            blocked: !selected.blockedByMe,
                          }),
                        selected.blockedByMe
                          ? "User unblocked"
                          : "User blocked",
                        true,
                      );
                  }}
                >
                  {selected.blockedByMe ? "Unblock user" : "Block user"}
                </Button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {status === "LoadingFirstPage" ? (
                <p>Loading messages…</p>
              ) : (
                <>
                  {status === "CanLoadMore" && (
                    <Button variant="outline" onClick={() => loadMore(50)}>
                      Load older messages
                    </Button>
                  )}
                  {status === "LoadingMore" && <p>Loading older messages…</p>}
                  {messages.map((message, i) => (
                    <div key={message._id}>
                      {(i === 0 ||
                        new Date(message.createdAt).toDateString() !==
                          new Date(
                            messages[i - 1].createdAt,
                          ).toDateString()) && (
                        <p className="text-center text-xs text-slate-400 py-3">
                          {formatDate(message.createdAt)}
                        </p>
                      )}
                      <MessageBubble
                        message={message}
                        mine={message.senderId === convexUser?._id}
                      />
                    </div>
                  ))}
                  {sending?.conversationId === selected._id &&
                    !newestFirst.some(
                      (m) => m.clientRequestId === sending.requestId,
                    ) && (
                      <div
                        className="ml-auto max-w-[85%] rounded-xl bg-[#0f2044]/80 text-white p-4 text-sm"
                        role="status"
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {sending.content}
                        </p>
                        <p className="flex gap-1 items-center text-xs mt-2">
                          <Clock className="w-3 h-3" />
                          Sending…
                        </p>
                      </div>
                    )}
                  <div ref={endRef} />
                </>
              )}
            </div>
            <div className="bg-white border-t p-4">
              {selected.cannotMessage ? (
                <p className="text-sm text-slate-600">
                  {selected.blockedByMe
                    ? "You blocked this user. Unblock them to resume messaging."
                    : "Messaging is currently unavailable between these accounts."}
                </p>
              ) : !selected.listing || !selected.otherUser ? (
                <p className="text-sm text-slate-500">
                  This conversation is read-only because its property or account
                  is unavailable.
                </p>
              ) : (
                <>
                  <MessageComposerTools
                    draft={draft}
                    setDraft={updateDraft}
                    disabled={!!sending}
                  />
                  {failedSend?.conversationId === selected._id && (
                    <p role="alert" className="text-sm text-red-700 mb-2">
                      Send failed. Your draft is still here; press Send to
                      retry.
                    </p>
                  )}
                  <div className="flex gap-3 items-end">
                    <label htmlFor="message-draft" className="sr-only">
                      Message
                    </label>
                    <Textarea
                      id="message-draft"
                      ref={textareaRef}
                      value={draft}
                      onChange={(e) => updateDraft(e.target.value)}
                      maxLength={2000}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      rows={2}
                      className="resize-none"
                      placeholder="Type a message…"
                    />
                    <Button
                      size="icon"
                      aria-label="Send message"
                      disabled={!draft.trim() || !!sending}
                      onClick={handleSend}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {draft.length}/2,000 · Enter to send · Shift+Enter for a new
                    line
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
