import React from "react";
import Link from 'next/link';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

// Helper function to get time ago string
function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return 'just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`
  }
  
  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`
}

interface ArticleCardGridProps {
  posts: any[];
  locale: string;
  title?: string;
  limit?: number;
}

// Helper function to get image URL
function getImageUrl(image: any): string | null {
  if (!image) return null;
  
  // Handle different image structures
  const imageUrl = typeof image === 'string' 
    ? image 
    : image?.sizes?.large?.url || image?.url || null;
  
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
}

export default function ArticleCardGrid({ 
  posts, 
  locale, 
  title = "Related Posts",
  limit 
}: ArticleCardGridProps) {
  // Apply limit if provided
  const displayPosts = limit ? posts.slice(0, limit) : posts;

  if (!displayPosts || displayPosts.length === 0) {
    return null;
  }

  return (
    <div className="article-related-posts">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayPosts.map((post: any) => {
          const heroImageUrl = getImageUrl(post.heroImage);
          
          return (
            <Link key={post.id} href={`/${locale}/articles/${post.slug}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer pt-0">
                {heroImageUrl && (
                  <div className="relative w-full h-48 overflow-hidden rounded-t-xl">
                    <img 
                      className="w-full h-full object-cover" 
                      src={heroImageUrl}
                      alt={post.title}
                    />
                  </div>
                )}
              <CardHeader>
                <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                {post.description && (
                  <CardDescription className="line-clamp-3">{post.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {post.populatedAuthors && post.populatedAuthors.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {post.populatedAuthors.map((author: any, index: number) => (
                      <React.Fragment key={index}>
                        <a className="text-primary hover:underline" href={`/@${author.dupipUser}`}>@{author.name}</a>
                        {index < post.populatedAuthors.length - 1 && ', '}
                      </React.Fragment>
                    ))}
                  </p>
                )}
                {post.publishedAt && (
                  <p className="text-sm text-muted-foreground">
                    {getTimeAgo(new Date(post.publishedAt))} • {format(new Date(post.publishedAt), 'MMM d, yyyy')}
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

