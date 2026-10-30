"use client";
import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { prepareMessageSearch } from "@/lib/message-search";
import { formatDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Folder = "all" | "unread" | "archived" | "blocked";
export function MessageSearch({
  folder,
  onActiveChange,
  onSelect,
}: {
  folder: Folder;
  onActiveChange: (active: boolean) => void;
  onSelect: (
    conversationId: Id<"conversations">,
    messageId?: Id<"messages">,
  ) => void;
}) {
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState<string | null>(null),
    [error, setError] = useState("");
  const [everywhere, setEverywhere] = useState(true);
  const args = query
    ? { query, scope: everywhere ? ("everywhere" as const) : folder }
    : null;
  const people = usePaginatedQuery(api.messageSearch.people, args ?? "skip", {
    initialNumItems: 20,
  });
  const received = usePaginatedQuery(
    api.messageSearch.messages,
    args ? { ...args, direction: "received" } : "skip",
    { initialNumItems: 20 },
  );
  const sent = usePaginatedQuery(
    api.messageSearch.messages,
    args ? { ...args, direction: "sent" } : "skip",
    { initialNumItems: 20 },
  );
  const readiness = useQuery(api.messageSearch.status, query ? {} : "skip");
  const results = [received, sent];
  const loading =
    query &&
    [people, ...results].some((result) => result.status === "LoadingFirstPage");
  const noMatches =
    people.results.length + received.results.length + sent.results.length === 0;
  const complete =
    [people, ...results].every((result) => result.status === "Exhausted") &&
    readiness?.namesReady &&
    readiness.historyReady;
  function clear() {
    setDraft("");
    setQuery(null);
    setError("");
    onActiveChange(false);
  }
  return (
    <div className="border-b p-3 space-y-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const prepared = prepareMessageSearch(draft);
            setQuery(prepared.query);
            setError("");
            onActiveChange(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Enter a search query.");
          }
        }}
      >
        <label className="text-xs font-medium" htmlFor="inbox-search">
          Search messages and participant names
        </label>
        <Input
          id="inbox-search"
          type="search"
          maxLength={200}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Keyword or participant name"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Search
          </Button>
          {query && (
            <Button type="button" size="sm" variant="outline" onClick={clear}>
              Clear search
            </Button>
          )}
        </div>
        <label className="flex gap-2 items-center text-xs">
          <input
            type="checkbox"
            checked={everywhere}
            onChange={(event) => setEverywhere(event.target.checked)}
          />
          Search all folders, including archived and blocked history
        </label>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </form>
      {query && (
        <div className="space-y-4" aria-live="polite">
          <p className="text-xs text-slate-500">
            Results for “{query}”, ranked by relevance in each section. The
            final word also matches word beginnings; spelling variants are not
            expanded. Profile-name changes update in the background.
          </p>
          {readiness && (!readiness.namesReady || !readiness.historyReady) && (
            <p role="status" className="text-xs text-slate-500">
              Search indexes or folder changes are still updating. Current
              matches may be incomplete.
            </p>
          )}
          {loading && (
            <p role="status" className="text-sm">
              Searching saved history…
            </p>
          )}
          {!loading && noMatches && (
            <p className="text-sm">
              {complete
                ? "No matches found."
                : "No matches loaded yet. More history may still be available."}
            </p>
          )}
          <section className="space-y-2">
            <h2 className="text-xs font-semibold">Participant matches</h2>
            {people.results.map((conv) => (
              <button
                type="button"
                key={conv._id}
                onClick={() => onSelect(conv._id)}
                className="w-full rounded-lg border p-3 text-left text-sm hover:bg-slate-50"
              >
                <span className="block font-medium">
                  {conv.otherUser?.name ?? "Unavailable account"}
                </span>
                <span className="block text-xs text-slate-500">
                  {conv.listing?.title ?? "Unavailable property"}
                </span>
              </button>
            ))}
            {people.status === "CanLoadMore" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => people.loadMore(20)}
              >
                More participant matches
              </Button>
            )}
            {people.status === "LoadingMore" && (
              <p role="status" className="text-xs">
                Loading participant matches…
              </p>
            )}
          </section>
          {results.map((result, index) => (
            <section key={index} className="space-y-2">
              <h2 className="text-xs font-semibold">
                {index === 0
                  ? "Received message matches"
                  : "Sent message matches"}
              </h2>
              {result.results.map((hit) => (
                <button
                  type="button"
                  key={hit.messageId}
                  onClick={() => onSelect(hit.conversation._id, hit.messageId)}
                  className="w-full rounded-lg border p-3 text-left text-sm hover:bg-slate-50"
                >
                  <span className="block font-medium">
                    {hit.conversation.otherUser?.name ?? "Unavailable account"}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {hit.conversation.listing?.title ?? "Unavailable property"}{" "}
                    · {formatDate(hit.createdAt)}
                  </span>
                  <span className="block whitespace-pre-wrap break-words mt-1">
                    {hit.excerpt}
                  </span>
                </button>
              ))}
              {result.status === "CanLoadMore" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => result.loadMore(20)}
                >
                  More {index === 0 ? "received" : "sent"} matches
                </Button>
              )}
              {result.status === "LoadingMore" && (
                <p role="status" className="text-xs">
                  Loading message matches…
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
