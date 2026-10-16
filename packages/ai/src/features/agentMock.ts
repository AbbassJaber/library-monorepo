import { ReadingState, ToolName } from '@library/contracts';
import { lastUserText } from '../providers/mock/index.js';
import type { GenerateRequest, Message } from '../providers/types.js';
import { clip } from '../safety/untrusted.js';
import type { AgentStep } from './agentTypes.js';

const ISBN = /\b(97[89]\d{10}|\d{9}[\dX])\b/i;
const ADD_PATTERNS = [
  /\b(?:add|put)\s+(?!it\b)(.+?)\s+(?:to|on|in)\s+my\b/i,
  /\breading\s+(.+?)\s+now\b/i,
  /\bajoute[rsz]?\s+(.+?)\s+(?:à|a|dans)\s+ma\b/i,
];
const REMOVE_PATTERNS = [
  /\b(?:remove|delete|take)\s+(.+?)\s+(?:from|off)\s+my\b/i,
  /\b(?:retire|enlève|enleve|supprime)[rsz]?\s+(.+?)\s+de\s+ma\b/i,
];
const MANY = /\b(every|all|everything|tous|toutes|tout)\b/i;
const OUT_OF_SCOPE = /\b(weather|forecast|news|météo|temps fera|actualités?)\b/i;
const QUERY_PREFIXES = [
  /^(?:please\s+)?(?:find|show me|search for|look for)\s+/i,
  /^(?:books|novels?|anything)\s+(?:by|from)\s+/i,
  /^do you have (?:anything|any books?|something) (?:by|from|about)\s+/i,
  /^(?:what is|what's|tell me about)\s+/i,
  /^(?:a|an|the)\s+(?:novel|book)\s+(?:about|where|in which)\s+/i,
  /^(?:des|les)\s+livres\s+(?:de|d'|d’)\s*/i,
  /^(?:un|le)\s+roman\s+(?:où|sur|dans lequel)\s+/i,
];

const mockQuery = (text: string): string => {
  let q = text
    .trim()
    .replace(/[?!.]+$/g, '')
    .trim();
  for (const prefix of QUERY_PREFIXES) q = q.replace(prefix, '');
  q = q.replace(/\s+about$/i, '').trim();
  return clip(q.length >= 2 ? q : text.trim(), 200);
};

const readState = (text: string): ReadingState =>
  /\b(as reading|reading it|en cours|je lis)\b|reading .+ now/i.test(text)
    ? ReadingState.enum.READING
    : /\b(finished|termin[ée]|lu)(?!\w)/i.test(text)
      ? ReadingState.enum.FINISHED
      : ReadingState.enum.WANT_TO_READ;

const lastResults = (messages: Message[]) => {
  const last = messages.at(-1);
  if (!last || typeof last.content === 'string') return null;
  const previous = messages.at(-2);
  const names = new Map<string, string>();
  if (previous && typeof previous.content !== 'string')
    for (const part of previous.content)
      if (part.type === 'tool_use') names.set(part.id, part.name);
  const results = last.content.flatMap(part => {
    if (part.type !== 'tool_result') return [];
    const json = part.content.slice(
      part.content.indexOf('\n') + 1,
      part.content.lastIndexOf('\n</data>')
    );
    let value: unknown = null;
    try {
      value = JSON.parse(json);
    } catch {
      value = null;
    }
    return [{ tool: names.get(part.toolUseId) ?? '', value, isError: part.isError === true }];
  });
  return results.length > 0 ? results : null;
};

const listBooks = (books: Array<{ id: number; title: string; author?: string }>, fr: boolean) =>
  books
    .slice(0, 5)
    .map(
      book =>
        `${book.title}${book.author ? (fr ? ` de ${book.author}` : ` by ${book.author}`) : ''} [book:${book.id}]`
    )
    .join(', ');

export const agentMockPolicy = (request: GenerateRequest): AgentStep => {
  const fr = request.system.some(block => block.text.includes('Reply in French'));
  const text = lastUserText(request.messages);
  const tools = new Set((request.tools ?? []).map(tool => tool.name));
  const removeMatch = REMOVE_PATTERNS.map(pattern => pattern.exec(text)).find(Boolean);
  const addMatch = removeMatch
    ? undefined
    : ADD_PATTERNS.map(pattern => pattern.exec(text)).find(Boolean);
  const change = removeMatch ?? addMatch;
  const results = lastResults(request.messages);

  if (!results) {
    if (OUT_OF_SCOPE.test(text))
      return {
        text: fr
          ? 'Je peux vous aider avec le catalogue de la bibliothèque et votre liste de lecture.'
          : 'I can help with the library catalog and your reading list.',
      };
    const isbn = ISBN.exec(text)?.[1] ?? /\bisbn\b\D{0,3}(\d[\d -]{5,20}[\dX])/i.exec(text)?.[1];
    if (isbn && /\b(draft|entry|fiche|prépare|catalog)\b/i.test(text))
      return tools.has(ToolName.enum.draftBook)
        ? { toolCalls: [{ name: ToolName.enum.draftBook, input: { isbn } }] }
        : {
            text: fr
              ? 'Préparer une fiche est réservé aux bibliothécaires.'
              : 'Drafting catalog entries is for librarians.',
          };
    if (removeMatch && MANY.test(removeMatch[1]!))
      return { toolCalls: [{ name: ToolName.enum.getReadingList, input: {} }] };
    if (change) {
      if (MANY.test(change[1]!))
        return {
          text: fr
            ? 'Je modifie un livre à la fois, quand vous le nommez.'
            : 'I change one book at a time, when you name it.',
        };
      return {
        toolCalls: [
          { name: ToolName.enum.searchBooks, input: { q: mockQuery(change[1]!), limit: 3 } },
        ],
      };
    }
    if (/\bgenres?\b/i.test(text))
      return { toolCalls: [{ name: ToolName.enum.listGenres, input: {} }] };
    return {
      toolCalls: [{ name: ToolName.enum.searchBooks, input: { q: mockQuery(text), limit: 5 } }],
    };
  }

  const [first] = results;
  if (first!.isError && (first!.value as { error?: string } | null)?.error === 'INVALID_ISBN')
    return {
      text: fr
        ? "Cet ISBN n'est pas valide. Pouvez-vous le saisir à nouveau, ou voulez-vous que je cherche par titre ?"
        : 'That ISBN is not valid. Could you type it again, or shall I search by title instead?',
    };
  if (first!.isError) {
    const message = (first!.value as { message?: string } | null)?.message ?? '';
    return {
      text: fr ? `Je n'ai pas pu le faire : ${message}` : `I could not do that: ${message}`,
    };
  }
  const value = first!.value;
  switch (first!.tool) {
    case ToolName.enum.searchBooks: {
      const books = (value as Array<{ id: number; title: string; author: string }>) ?? [];
      if (removeMatch && books.length > 0)
        return {
          toolCalls: [
            { name: ToolName.enum.removeFromReadingList, input: { bookId: books[0]!.id } },
          ],
        };
      if (addMatch && books.length > 0)
        return {
          toolCalls: [
            {
              name: ToolName.enum.addToReadingList,
              input: { bookId: books[0]!.id, state: readState(text) },
            },
          ],
        };
      if (books.length === 0)
        return {
          text: fr ? "Je n'ai trouvé aucun livre correspondant." : 'I found no matching books.',
        };
      return {
        text: fr
          ? `Voici ce que j'ai trouvé : ${listBooks(books, true)}.`
          : `Here is what I found: ${listBooks(books, false)}.`,
      };
    }
    case ToolName.enum.getReadingList: {
      const entries = (value as Array<{ book: { id: number; title: string } }>) ?? [];
      if (removeMatch && entries.length > 0)
        return {
          toolCalls: [
            {
              name: ToolName.enum.changeReadingList,
              input: {
                changes: entries
                  .slice(0, 10)
                  .map(entry => ({ action: 'remove', bookId: entry.book.id })),
              },
            },
          ],
        };
      return {
        text:
          entries.length === 0
            ? fr
              ? 'Votre liste de lecture est vide.'
              : 'Your reading list is empty.'
            : `${fr ? 'Dans votre liste' : 'On your list'}: ${entries.map(e => e.book.title).join(', ')}.`,
      };
    }
    case ToolName.enum.addToReadingList:
    case ToolName.enum.updateReadingState:
    case ToolName.enum.removeFromReadingList:
    case ToolName.enum.changeReadingList: {
      const summary = (value as { summary?: string } | null)?.summary ?? '';
      return {
        text: fr
          ? `J'ai préparé cette modification : ${summary}. Confirmez-la avec le bouton pour l'appliquer.`
          : `I have prepared this change: ${summary}. Please confirm it with the button to apply it.`,
      };
    }
    case ToolName.enum.getBook: {
      const book = value as { id: number; title: string; author: string; synopsis?: string };
      return { text: `${listBooks([book], fr)}: ${clip(book.synopsis ?? '', 200)}` };
    }
    case ToolName.enum.listGenres: {
      const genres = ((value as Array<{ name: string }>) ?? []).map(genre => genre.name);
      return { text: `${fr ? 'Genres' : 'Genres'}: ${genres.join(', ')}.` };
    }
    case ToolName.enum.draftBook:
      return {
        text: fr
          ? 'Le brouillon est prêt ; relisez-le dans le formulaire du livre avant de l’enregistrer.'
          : 'The draft is ready; review it in the book form before saving it.',
      };
    default:
      return { text: fr ? 'Voilà.' : 'Done looking.' };
  }
};
