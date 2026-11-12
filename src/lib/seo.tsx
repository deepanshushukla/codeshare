// React 19 hoists <title>/<meta>/<link> rendered anywhere in the tree into
// <head>, deduping by tag type -- so mounting this on a route swaps out
// index.html's default tags for that page without any extra library.
type PageSeoProps = {
  title: string;
  description: string;
  path: string;
  jsonLd: object;
};

export default function PageSeo({ title, description, path, jsonLd }: PageSeoProps) {
  const url = `https://codeshare.in${path}`;
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {/* JSON-LD has no head-vs-body requirement for crawlers, so this skips
          React 19's head-hoisting tags and renders inline where it's cheap
          to keep next to the data that produced it. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
