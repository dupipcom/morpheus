import React from "react";
import { fetchEpisodeBySlug } from "@/lib/notion";
import { RichText } from '@payloadcms/richtext-lexical/react';

export default async function ArticleLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string; articleslug: string }>;
  children: React.ReactNode;
}) {
  const { locale, articleslug } = await params;

  const article = await fetchEpisodeBySlug(articleslug, locale);

  if (!article) {
    return <>{children}</>;
  }

  // Extract Post interface fields
  const title = (article as any)?.title || 'Untitled';
  const heroImage = (article as any)?.heroImage || null;
  const content = (article as any)?.content || null;
  const meta = (article as any)?.meta || null;

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

  // Get meta description for display
  const metaDescription = meta?.description || null;

  const hasContent = content && content.root && content.root.children && content.root.children.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {heroImageUrl && (
        <div className="relative w-full h-64 md:h-96 mb-8 overflow-hidden rounded-xl">
          <img 
            src={heroImageUrl} 
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      {title && (
        <div className="article-header-title mb-4">
          <h1 className="text-4xl md:text-5xl font-bold">{title}</h1>
        </div>
      )}

      {metaDescription && (
        <div className="article-header-description text-xl text-muted-foreground mb-4">
          {typeof metaDescription === 'string' ? (
            <p>{metaDescription}</p>
          ) : (
            <RichText data={metaDescription} className="text-[16px] md:text-[20px] leading-relaxed" />
          )}
        </div>
      )}

{hasContent && (
        <div className="article-content prose prose-lg max-w-none mb-8">
          <RichText 
            data={content} 
            className="text-base leading-relaxed [&_p]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4 [&_li]:mb-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-bold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4 [&_img]:rounded-lg [&_img]:my-4 [&_img]:max-w-full [&_hr]:my-8 [&_hr]:border-t [&_hr]:border-muted"
          />
        </div>
      )}

      {children}
    </div>
  );
}

