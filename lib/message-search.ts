export function prepareMessageSearch(input: string) {
  const query = input.trim().replace(/\s+/g, " ");
  const terms = query.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (
    !query ||
    query.length > 200 ||
    !terms.length ||
    terms.length > 16 ||
    terms.some((term) => term.length > 32)
  )
    throw new Error(
      "Search with 1–16 words, up to 32 characters per word and 200 characters in total.",
    );
  return { query, terms: terms.map((term) => term.toLocaleLowerCase("en-US")) };
}
export function messageExcerpt(content: string, query: string) {
  const { terms } = prepareMessageSearch(query);
  let position = 0;
  for (const match of content.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0].toLocaleLowerCase("en-US").slice(0, 32);
    if (
      terms.some((term, i) =>
        i === terms.length - 1 ? word.startsWith(term) : word === term,
      )
    ) {
      position = match.index;
      break;
    }
  }
  const start = Math.max(0, position - 80),
    end = Math.min(content.length, start + 320);
  return `${start ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}
export function participantSearchName(
  user: { name?: string; displayName?: string } | null | undefined,
) {
  return user?.displayName?.trim() || user?.name?.trim() || "";
}
export function currentNameMatches(text: string, query: string) {
  const { terms } = prepareMessageSearch(query),
    words = text.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.some((term, i) =>
    words.some((word) =>
      i === terms.length - 1 ? word.startsWith(term) : word === term,
    ),
  );
}
