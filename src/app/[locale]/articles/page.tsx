import { fetchAllArticles } from "@/lib/payload";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import type { Metadata } from 'next';
import { buildMetadata } from '@/app/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return await buildMetadata({ 
    title: 'Articles',
    description: 'Browse our collection of articles',
    locale 
  });
}

export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  
  // Fetch all articles once instead of per locale
  const episodes = await fetchAllArticles();
  const articles = episodes.docs || [];

  if (articles.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Articles</h1>
        <p className="text-muted-foreground">No articles available yet.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Articles</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article: any) => {
          // Extract Post interface fields
          const slug = article.slug || 'untitled';
          const title = article.title || 'Untitled';
          const heroImage = article.heroImage || null;
          const meta = article.meta || null;
          const metaDescription = meta?.description || null;
          const publishedAt = article.publishedAt || null;
          
          // Get hero image URL and prefix with PAYLOAD_API_URL if it's a relative path
          const getImageUrl = (image: any): string | null => {
            const imageUrl = typeof image === 'string' 
              ? image 
              : image?.url || null;
            
            if (!imageUrl) return null;
            
            // If it's already a full URL, return as is
            if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
              return imageUrl;
            }
            
            // If it's a relative path, prefix with base URL (image URL already includes /api/media/*)
            const payloadApiUrl = process.env.PAYLOAD_API_URL || process.env.NEXT_PUBLIC_PAYLOAD_API_URL || '';
            if (payloadApiUrl && imageUrl.startsWith('/')) {
              // Remove /api from PAYLOAD_API_URL and prepend to image URL (which already has /api/media/*)
              return `${payloadApiUrl.split('/api')[0]}${imageUrl}`;
            }
            
            return imageUrl;
          };

          const heroImageUrl = getImageUrl(heroImage);

          return (
            <Link key={article.id} href={`/${locale}/articles/${slug}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer pt-0">
                {heroImageUrl && (
                  <div className="relative w-full h-48 overflow-hidden rounded-t-xl">
                    <img 
                      src={heroImageUrl} 
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="line-clamp-2">{title}</CardTitle>
                  {metaDescription && (
                    <CardDescription className="line-clamp-3">
                      {metaDescription}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {publishedAt && (
                    <p className="text-sm text-muted-foreground">
                      {new Date(publishedAt).toLocaleDateString(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

