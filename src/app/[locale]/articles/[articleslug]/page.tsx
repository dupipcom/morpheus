import { notFound } from "next/navigation";
import { fetchEpisodeBySlug, fetchEpisodes } from "@/lib/notion";
import type { Metadata } from 'next';
import { buildMetadata } from '@/app/metadata';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Image from 'next/image';
import { ArticleShareButton } from '@/components/articleShareButton';

export const dynamic = 'force-dynamic'

// Helper function to fetch profile data
async function getProfile(userName: string): Promise<any | null> {
  if (!userName) return null;
  
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/v1/profile/${userName}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.profile;
  } catch (error) {
    console.error(`Error fetching profile for ${userName}:`, error);
    return null;
  }
}

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
  
  // Get article metadata for sharing
  const metaTitle = (article as any)?.meta?.title;
  const title = metaTitle || (article as any)?.title || 'Article';
  const metaDescription = (article as any)?.meta?.description;
  const description = metaDescription || (article as any)?.description || undefined;
  
  // Construct article URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const articleUrl = `${baseUrl}/${locale}/articles/${articleslug}`;

  // Fetch profile data for all authors
  const authorProfiles = await Promise.all(
    (authors || []).map(async (author: any) => {
      const dupipUser = author?.dupipUser;
      if (!dupipUser) return { author, profile: null };
      
      const profile = await getProfile(dupipUser);
      return { author, profile };
    })
  );

  return (
    <>
      <header className="mb-8 max-w-xl m-auto">
        {/* Date info with share button */}
        {publishedAt && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            <time dateTime={publishedAt}>
              {new Date(publishedAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </time>
            <ArticleShareButton 
              url={articleUrl}
              title={title}
              description={description}
            />
          </div>
        )}

        {/* Author cards */}
        {authorProfiles.length > 0 && (
          <div className="space-y-4 mb-4">
            {authorProfiles.map(({ author, profile }, index: number) => {
              const authorName = typeof author === 'string' 
                ? author 
                : author?.name || 'Unknown Author';
              const dupipUser = author?.dupipUser;
              const profilePicture = profile?.profilePicture;
              const bio = profile?.bio;
              
              if (!dupipUser) {
                // Fallback for authors without dupipUser
                return (
                  <Card key={index} className="bg-muted p-0">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 justify-center">
                        <span className="font-medium">{authorName}</span>
                      </div>
                      {bio && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {bio}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              }
              
              return (
                <Card key={index} className="bg-muted p-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Profile Image */}
                      {profilePicture && (
                        <div className="flex-shrink-0">
                          <Link href={`/@${dupipUser}`}>
                            <div className="relative w-16 h-16 rounded-full overflow-hidden">
                              <Image
                                src={profilePicture}
                                alt={authorName}
                                fill
                                className="object-cover"
                              />
                            </div>
                          </Link>
                        </div>
                      )}
                      
                      {/* Author Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link 
                            href={`/@${dupipUser}`}
                            className="text-primary hover:underline font-medium"
                          >
                            @{authorName}
                          </Link>
                        </div>
                        
                        {/* Bio */}
                        {bio && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {bio}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}


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

