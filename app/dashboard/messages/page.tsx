"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Home,
  Clock,
} from "lucide-react";

type Conversation = {
  _id: string;
  listingId: Id<"listings">;
  tenantId: Id<"users">;
  landlordId: Id<"users">;
  lastMessage: string;
  lastMessageAt: number;
  tenantRead: boolean;
  landlordRead: boolean;
  listing: {
    _id: Id<"listings">;
    title: string;
    photos: string[];
  } | null;
  otherUser: {
    _id: Id<"users">;
    name: string;
    avatar?: string;
  } | null;
};

type Message = {
  _id: string;
  conversationId: string;
  senderId: Id<"users">;
  receiverId: Id<"users">;
  listingId: Id<"listings">;
  content: string;
  read: boolean;
  createdAt: number;
};

function ConversationItem({
  conv,
  isSelected,
  currentUserId,
  onClick,
}: {
  conv: Conversation;
  isSelected: boolean;
  currentUserId: Id<"users">;
  onClick: () => void;
}) {
  const isTenant = conv.tenantId === currentUserId;
  const isUnread = isTenant ? !conv.tenantRead : !conv.landlordRead;
  const coverPhoto = conv.listing?.photos?.[0];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors border-b border-slate-100 last:border-0",
        isSelected
          ? "bg-[#0f2044]/5 border-r-2 border-r-[#0f2044]"
          : "hover:bg-slate-50"
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-[#0f2044]/10 flex items-center justify-center overflow-hidden">
          {conv.otherUser?.avatar ? (
            <img
              src={conv.otherUser.avatar}
              alt={conv.otherUser.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-[#0f2044]">
              {conv.otherUser?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
        {isUnread && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#0f2044] border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className={cn(
              "text-sm truncate",
              isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"
            )}
          >
            {conv.otherUser?.name ?? "Unknown"}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">
            {new Date(conv.lastMessageAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {conv.listing?.title ?? "Listing"}
        </p>
        <p
          className={cn(
            "text-xs truncate mt-0.5",
            isUnread ? "text-slate-700 font-medium" : "text-slate-400"
          )}
        >
          {conv.lastMessage}
        </p>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  isMine,
}: {
  message: Message;
  isMine: boolean;
}) {
  return (
    <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
          isMine
            ? "bg-[#0f2044] text-white rounded-br-sm"
            : "bg-slate-100 text-slate-900 rounded-bl-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={cn(
            "text-[11px] mt-1",
            isMine ? "text-white/60 text-right" : "text-slate-400"
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const { userId } = useAuth();

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  const conversations = useQuery(
    api.messages.getConversations,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  ) as Conversation[] | undefined;

  // Selected conversation — can be pre-selected via ?conv=... query param
  const [selectedConvId, setSelectedConvId] = useState<string | null>(
    searchParams.get("conv")
  );
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedConv = conversations?.find((c) => c._id === selectedConvId) ?? null;

  // Build conversationId string from selected conversation
  const convIdString = selectedConv
    ? [selectedConv.tenantId, selectedConv.landlordId].sort().join("_") +
      "_" +
      selectedConv.listingId
    : null;

  const messages = useQuery(
    api.messages.getMessages,
    convIdString ? { conversationId: convIdString } : "skip"
  ) as Message[] | undefined;

  const sendMessage = useMutation(api.messages.sendMessage);
  const markRead = useMutation(api.messages.markRead);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (!convIdString || !convexUser?._id) return;
    markRead({ conversationId: convIdString, userId: convexUser._id }).catch(() => {});
  }, [convIdString, convexUser?._id]);

  // Pre-select first conversation if none selected
  useEffect(() => {
    if (!selectedConvId && conversations && conversations.length > 0) {
      setSelectedConvId(conversations[0]._id);
    }
  }, [conversations, selectedConvId]);

  function selectConversation(convId: string) {
    setSelectedConvId(convId);
    setMobileShowThread(true);
  }

  async function handleSend() {
    if (!messageText.trim() || !selectedConv || !convexUser?._id) return;
    setSending(true);
    try {
      const isTenant = selectedConv.tenantId === convexUser._id;
      const receiverId = isTenant ? selectedConv.landlordId : selectedConv.tenantId;

      await sendMessage({
        senderId: convexUser._id,
        receiverId,
        listingId: selectedConv.listingId,
        content: messageText.trim(),
      });
      setMessageText("");
      textareaRef.current?.focus();
    } catch {
      toast.error("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isLoading = convexUser === undefined || conversations === undefined;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation list */}
      <div
        className={cn(
          "w-full md:w-80 border-r border-slate-200 bg-white flex flex-col shrink-0",
          mobileShowThread ? "hidden md:flex" : "flex"
        )}
      >
        {/* List header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
          {conversations && (
            <p className="text-xs text-slate-500 mt-0.5">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="divide-y divide-slate-100">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-3 p-4">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center py-16">
              <MessageSquare className="h-12 w-12 text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-700 mb-1">No messages yet</p>
              <p className="text-xs text-slate-400">
                When you start a conversation about a listing, it'll appear here.
              </p>
            </div>
          ) : (
            conversations?.map((conv) => (
              <ConversationItem
                key={conv._id}
                conv={conv}
                isSelected={selectedConvId === conv._id}
                currentUserId={convexUser!._id}
                onClick={() => selectConversation(conv._id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Message thread */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-slate-50 min-w-0",
          !mobileShowThread ? "hidden md:flex" : "flex"
        )}
      >
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <MessageSquare className="h-16 w-16 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-slate-400">
              Choose a conversation from the list to view your messages.
            </p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
              <button
                className="md:hidden text-slate-500 hover:text-slate-700 mr-1"
                onClick={() => setMobileShowThread(false)}
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="h-9 w-9 rounded-full bg-[#0f2044]/10 flex items-center justify-center shrink-0 overflow-hidden">
                {selectedConv.otherUser?.avatar ? (
                  <img
                    src={selectedConv.otherUser.avatar}
                    alt={selectedConv.otherUser.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-[#0f2044]">
                    {selectedConv.otherUser?.name?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedConv.otherUser?.name ?? "Unknown"}
                </p>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Home className="h-3 w-3" />
                  <span className="truncate">
                    {selectedConv.listing?.title ?? "Listing"}
                  </span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages === undefined ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}
                    >
                      <Skeleton
                        className={cn(
                          "h-12 rounded-2xl",
                          i % 2 === 0 ? "w-48" : "w-56"
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <MessageSquare className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">No messages yet. Say hello!</p>
                </div>
              ) : (
                <>
                  {/* Date separator for first message */}
                  {messages.length > 0 && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs text-slate-400 shrink-0">
                        {formatDate(messages[0].createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                    const isMine = msg.senderId === convexUser?._id;
                    // Show date separator when day changes
                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const showDateSep =
                      prevMsg &&
                      new Date(msg.createdAt).toDateString() !==
                        new Date(prevMsg.createdAt).toDateString();

                    return (
                      <div key={msg._id}>
                        {showDateSep && (
                          <div className="flex items-center gap-3 py-2">
                            <div className="flex-1 h-px bg-slate-200" />
                            <span className="text-xs text-slate-400 shrink-0">
                              {formatDate(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-slate-200" />
                          </div>
                        )}
                        <MessageBubble message={msg} isMine={isMine} />
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message input */}
            <div className="bg-white border-t border-slate-200 p-4">
              <div className="flex items-end gap-3">
                <Textarea
                  ref={textareaRef}
                  placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className="flex-1 resize-none min-h-[42px] max-h-32 overflow-y-auto"
                  style={{
                    height: "auto",
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
