// Looks up book metadata by ISBN server-side, trying Open Library first and
// falling back to Google Books, so the client never needs a third-party data
// API whitelisted in the CSP connect-src (only *.supabase.co is called from
// the browser, same reasoning as the download-cover function).
//
// Deploy via the Supabase Dashboard (Functions -> New function -> paste this file)
// or `supabase functions deploy lookup-isbn`. Requires no manual secrets for the
// base case. If Google Books' anonymous quota ever becomes a problem, a
// GOOGLE_BOOKS_API_KEY secret can be added later (see GOOGLE_BOOKS_KEY below)
// without changing the request/response shape.

const FETCH_TIMEOUT_MS = 8000;
const GOOGLE_BOOKS_KEY = Deno.env.get("GOOGLE_BOOKS_API_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, "").toUpperCase();
}

function isValidIsbn(isbn: string): boolean {
  return /^\d{9}[\dX]$/.test(isbn) || /^\d{13}$/.test(isbn);
}

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupOpenLibrary(isbn: string) {
  const data = await fetchJson(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
  );
  const book = data && data[`ISBN:${isbn}`];
  if (!book) return null;

  const authors = Array.isArray(book.authors) ? book.authors.map((a: any) => a.name).filter(Boolean) : [];
  const subjects = Array.isArray(book.subjects) ? book.subjects.map((s: any) => s.name).filter(Boolean) : [];
  const cover = book.cover && (book.cover.large || book.cover.medium || book.cover.small);
  const publishers = Array.isArray(book.publishers) ? book.publishers.map((p: any) => p.name).filter(Boolean) : [];

  return {
    title: book.title || "",
    author: authors.join(", "),
    genre: subjects.slice(0, 2).join(", "),
    cover: cover || "",
    extra: {
      publisher: publishers.join(", ") || null,
      published_date: book.publish_date || null,
      page_count: book.number_of_pages || null,
      description: null,
      language: null,
      subjects: subjects,
    },
  };
}

async function lookupGoogleBooks(isbn: string) {
  const key = GOOGLE_BOOKS_KEY ? `&key=${GOOGLE_BOOKS_KEY}` : "";
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key}`,
  );
  const item = data && Array.isArray(data.items) && data.items[0];
  const info = item && item.volumeInfo;
  if (!info) return null;

  const authors = Array.isArray(info.authors) ? info.authors : [];
  const categories = Array.isArray(info.categories) ? info.categories : [];
  let cover = info.imageLinks && (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail);
  if (cover) cover = cover.replace(/^http:/, "https:");
  const description = typeof info.description === "string" ? info.description : null;

  return {
    title: info.title || "",
    author: authors.join(", "),
    genre: categories.slice(0, 2).join(", "),
    cover: cover || "",
    extra: {
      publisher: info.publisher || null,
      published_date: info.publishedDate || null,
      page_count: info.pageCount || null,
      description: description,
      language: info.language || null,
      subjects: categories,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let isbnRaw: unknown;
  try {
    const body = await req.json();
    isbnRaw = body?.isbn;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (typeof isbnRaw !== "string" || !isbnRaw) return json({ error: "missing_isbn" }, 400);

  const isbn = normalizeIsbn(isbnRaw);
  if (!isValidIsbn(isbn)) return json({ error: "invalid_isbn" }, 400);

  let openLibraryFailed = false;
  let googleBooksFailed = false;

  let hit = null;
  let source = "";
  try {
    hit = await lookupOpenLibrary(isbn);
    if (hit) source = "openlibrary";
  } catch {
    openLibraryFailed = true;
  }

  if (!hit) {
    try {
      hit = await lookupGoogleBooks(isbn);
      if (hit) source = "googlebooks";
    } catch {
      googleBooksFailed = true;
    }
  }

  if (!hit) {
    if (openLibraryFailed && googleBooksFailed) return json({ error: "lookup_failed" }, 502);
    return json({ found: false, isbn }, 200);
  }

  return json({ found: true, isbn, source, ...hit }, 200);
});
