import { notFound } from "next/navigation";
import { fetchEpisodeBySlug, fetchEpisodes } from "@/lib/notion";
import type { Metadata } from 'next';
import { buildMetadata } from '@/app/metadata';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const locales = ['ar', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'eu', 'fi', 'fr', 'gl', 'he', 'hi', 'hu', 'it', 'ja', 'ko', 'ms', 'nl', 'pa', 'pl', 'pt', 'ro', 'ru', 'sv', 'tr', 'zh'];

  const params = [];
  for (const locale of locales) {
    try {
      const episodes = await fetchEpisodes(locale);
      for (const article of episodes.docs || []) {
        const slug = (article as any).slug || (article as any).slug?.value;
        if (slug) {
          params.push({
            locale,
            articleslug: slug,
          });
        }
      }
    } catch (error) {
      console.error(`Error generating static params for locale ${locale}:`, error);
    }
  }
  return params;
}

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ locale: string; articleslug: string }> 
}): Promise<Metadata> {
  const { locale, articleslug } = await params;
  
  try {
    const article = await fetchEpisodeBySlug(articleslug, locale);
    if (!article) {
      return await buildMetadata({ 
        title: 'Article Not Found',
        locale 
      });
    }

    // Use meta fields for SEO, fallback to direct fields
    const metaTitle = (article as any)?.meta?.title;
    const title = metaTitle || (article as any)?.title || 'Article';
    const metaDescription = (article as any)?.meta?.description;
    const description = metaDescription || undefined;
    
    // Use meta.image, fallback to heroImage
    const metaImage = (article as any)?.meta?.image;
    const heroImage = (article as any)?.heroImage;
    const image = metaImage || heroImage;
    const imageUrl = typeof image === 'string' ? image : (image as any)?.url;

    return await buildMetadata({ 
      title,
      description: typeof description === 'string' ? description : undefined,
      image: imageUrl,
      type: 'article',
      locale 
    });
  } catch (e) {
    return await buildMetadata({ 
      title: 'Article',
      locale 
    });
  }
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; articleslug: string }>;
}) {
  const { locale, articleslug } = await params;

  const article = await fetchEpisodeBySlug(articleslug, locale);

  if (!article) {
    notFound();
    return;
  }

  // Extract Post interface fields for metadata display
  const publishedAt = (article as any)?.publishedAt || null;
  const authors = (article as any)?.populatedAuthors || (article as any)?.authors || [];
  const categories = (article as any)?.categories || [];
  const relatedPosts = (article as any)?.relatedPosts || [];

  return (
    <>
      <header className="mb-8">
        {/* Author and date info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
          {authors && Array.isArray(authors) && authors.length > 0 && (
            <div className="flex items-center gap-2">
              <span>By</span>
              {authors.map((author: any, index: number) => {
                const authorName = typeof author === 'string' 
                  ? author 
                  : author?.name || 'Unknown Author';
                return (
                  <span key={index}>
                     <a className="text-primary hover:underline" href={`/@${author.dupipUser}`}>@{author.name}</a>
                    {index < authors.length - 1 && ', '}
                  </span>
                );
              })}
            </div>
          )}

          {publishedAt && (
            <>
              {authors && authors.length > 0 && <span>•</span>}
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </time>
            </>
          )}
        </div>

        {/* Categories */}
        {categories && Array.isArray(categories) && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map((category: any, index: number) => {
              const categoryName = typeof category === 'string' 
                ? category 
                : category?.title || category?.name || 'Category';
              return (
                <span 
                  key={index}
                  className="px-3 py-1 text-xs font-medium bg-muted rounded-full"
                >
                  {categoryName}
                </span>
              );
            })}
          </div>
        )}
      </header>

    </>
  );
}

