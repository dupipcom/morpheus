import React from "react";
import { fetchEpisodes, fetchEpisodeBySlug } from "@/lib/notion";
import { RichText } from '@payloadcms/richtext-lexical/react';
import ArticleCardGrid from '@/components/articleCardGrid';

import type { StaticImageData } from 'next/image'
import NextImage from 'next/image'

// A base64 encoded image to use as a placeholder while the image is loading
const placeholderBlur =
  'data:image/png;base64,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'

const ImageMedia: React.FC<any> = (props) => {
  const {
    alt: altFromProps,
    fill,
    pictureClassName,
    imgClassName,
    priority,
    resource,
    size: sizeFromProps,
    src: srcFromProps,
    loading: loadingFromProps,
  } = props

  let width: number | undefined
  let height: number | undefined
  let alt = altFromProps
  let src: StaticImageData | string = srcFromProps || ''

  if (!src && resource && typeof resource === 'object') {
    const { alt: altFromResource, height: fullHeight, url, width: fullWidth } = resource

    width = fullWidth!
    height = fullHeight!
    alt = altFromResource || ''

    const cacheTag = resource.updatedAt

    src = process.env.NEXT_PUBLIC_PAYLOAD_API_URL + url

  const loading = loadingFromProps || (!priority ? 'lazy' : undefined)

  return (
    <picture className={pictureClassName}>
      <NextImage
        className={imgClassName}
        alt={alt || ''}
        fill={fill}
        height={!fill ? height : undefined}
        placeholder="blur"
        blurDataURL={placeholderBlur}
        priority={priority}
        quality={100}
        loading={loading}
        src={src}
        width={!fill ? width : undefined}
      />
    </picture>
  )
  }
}


export default async function ArticleLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string; articleslug: string }>;
  children: React.ReactNode;
}) {
  const { locale, articleslug } = await params;

  const article = await fetchEpisodeBySlug(articleslug, locale);
  const allPosts = await fetchEpisodes(locale) || [];
  const relatedPosts = allPosts.docs.filter((post: any) => post.id !== article.id).slice(0, 3);

  if (!article) {
    return <>{children}</>;
  }

  // Extract Post interface fields
  const title = (article as any)?.title || 'Untitled';
  const heroImage = (article as any)?.heroImage || null;
  const content = (article as any)?.content || null;
  const meta = (article as any)?.meta || null;

  const jsxConverters = (props) => {
    return {
    ...props.defaultConverters,
    heading: ({ node }) => {
        return node.children.map((heading) => <span className={`${node.tag === "h2" ? "text-2xl md:text-4xl" : node.tag === "h3" ? "text-xl md:text-2xl" : node.tag === "h4" ? "text-lg md:text-xl" : node.tag === "h5" ? "text-base md:text-lg" : "text-sm md:text-base"} mb-8 block leading-10`}>{heading.text}</span>)
    },
    text: ({ node }) => {
        return <span className="inline text-md md:text-lg leading-6 md:leading-8">{node.text}</span>
    },
    blocks: {
      // Each key should match your block's slug
      mediaBlock: (props) => {
        return <div className="mb-8 px-4 md:px-8">
          <img src={process.env.NEXT_PAYLOAD_URL + props.node.fields.media.sizes.large.url}/>
          {props.node.fields.media.caption && <RichText data={props.node.fields.media.caption} className="text-xs text-muted-foreground bg-muted p-4 rounded-lg"/>}
        </div>
        },
      },
    }
  }

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
    <div className="container mx-auto px-4 py-8 max-w-[1200px]">
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
      {children}

{hasContent && (
        <div className="article-content prose prose-lg max-w-none mb-8 m-auto max-w-xl">
          <RichText 
            data={content} 
            converters={jsxConverters}  
            className=" text-base leading-relaxed [&_p]:mb-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4 [&_li]:mb-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-bold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4 [&_img]:rounded-lg [&_img]:my-4 [&_img]:max-w-full [&_hr]:my-8 [&_hr]:border-t [&_hr]:border-muted"
          />
        </div>
      )}

      {children}

      <ArticleCardGrid 
        posts={relatedPosts} 
        locale={locale} 
        title="Related Posts"
      />
</div>
  );
}
