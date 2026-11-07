/** Shared `<head>` metadata for every route (title, description and OG tags). */
export function pageHead(title: string, description: string) {
  const t = `${title} — AngoStudy`;
  return {
    meta: [
      { title: t },
      { name: "description", content: description },
      { property: "og:title", content: t },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
