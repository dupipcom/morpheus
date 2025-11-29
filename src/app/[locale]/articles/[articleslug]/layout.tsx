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

  // Get image URL and prefix with NEXT_PUBLIC_PAYLOAD_API_URL if it's a relative path
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
    const payloadApiUrl = process.env.NEXT_PUBLIC_PAYLOAD_API_URL || process.env.PAYLOAD_API_URL || '';
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

  // Custom converters to handle Media blocks as img tags
  // Map nodeType "block" nodes by parsing nodePreview and accessing fields.media.sizes.large.url
  const customConverters = ({ defaultConverters }: { defaultConverters: any }) => {
    // Helper function to render media block from parsed nodePreview
    const renderMediaBlock = (node: any) => {
      // Parse nodePreview to access the fields
      let parsedNode: any = null;
      try {
        // nodePreview might be a string that needs parsing, or already an object
        if (typeof node?.nodePreview === 'string') {
          parsedNode = JSON.parse(node.nodePreview);
        } else if (node?.nodePreview) {
          parsedNode = node.nodePreview;
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to parse nodePreview:', e, 'nodePreview:', node?.nodePreview);
        }
        return null;
      }

      if (!parsedNode) {
        if (process.env.NODE_ENV === 'development') {
          console.log('No parsedNode found. node:', { 
            nodeType: node?.nodeType, 
            type: node?.type, 
            hasNodePreview: !!node?.nodePreview,
            nodePreviewType: typeof node?.nodePreview 
          });
        }
        return null;
      }

      // Access fields.media.sizes.large.url from parsed nodePreview
      // Also check if fields are directly on the node
      const media = parsedNode?.fields?.media || node?.fields?.media || null;
      
      if (!media) {
        if (process.env.NODE_ENV === 'development') {
          console.log('No media found. parsedNode fields:', parsedNode?.fields ? Object.keys(parsedNode.fields) : 'none', 'node fields:', node?.fields ? Object.keys(node.fields) : 'none');
        }
        return null;
      }

      // Extract image URL from fields.media.sizes.large.url (primary path)
      const imageUrl = parsedNode?.fields?.media?.sizes?.large?.url || node?.fields?.media?.sizes?.large?.url || media?.sizes?.large?.url || media?.sizes?.medium?.url || media?.sizes?.small?.url || media?.url || null;
      
      if (!imageUrl) {
        return null;
      }

      const finalImageUrl = getImageUrl({ url: imageUrl });
      // Get caption from fields.caption or use alt text
      const caption = parsedNode?.fields?.caption || parsedNode?.fields?.altText || parsedNode?.fields?.alt || media?.alt || media?.altText || '';
      const altText = caption || 'Image';

      return (
        <figure className="my-4">
          <img 
            src={finalImageUrl || ''} 
            alt={altText}
            className="rounded-lg max-w-full"
          />
          {caption && (
            <figcaption className="text-sm text-muted-foreground mt-2 text-center italic">
              {caption}
            </figcaption>
          )}
        </figure>
      );
    };

    return {
      ...defaultConverters,
      // Handle nodes with nodeType "block" - parse nodePreview and map fields.media.sizes.large.url to img tags
      block: ({ node }: { node: any }) => {
        // Check if this is a block node (nodeType === 'block' or type === 'block')
        if ((node?.nodeType === 'block' || node?.type === 'block') && node?.nodePreview) {
          return renderMediaBlock(node);
        }
        
        // If not a media block, use default block converter
        if (defaultConverters?.block) {
          return defaultConverters.block({ node });
        }
        return null;
      },
      // Fallback: handle unknown nodes that might be block nodes with nodePreview
      unknown: ({ node }: { node: any }) => {
        // Check if this looks like a block node with nodePreview
        if ((node?.nodeType === 'block' || node?.type === 'block') && node?.nodePreview) {
          const result = renderMediaBlock(node);
          if (result) {
            return result;
          }
        }
        
        // Fall back to default unknown handler if it exists
        if (defaultConverters?.unknown) {
          return defaultConverters.unknown({ node });
        }
        
        // In development, log unknown nodes for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log('Unknown node:', {
            nodeType: node?.nodeType,
            type: node?.type,
            hasNodePreview: !!node?.nodePreview,
            nodeKeys: Object.keys(node || {}),
          });
        }
        
        return null;
      },
    };
  };

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
            converters={customConverters}
            className="text-base leading-relaxed [&_p]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-4 [&_li]:mb-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-bold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-muted [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4 [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-4 [&_img]:rounded-lg [&_img]:my-4 [&_img]:max-w-full [&_hr]:my-8 [&_hr]:border-t [&_hr]:border-muted"
          />
        </div>
      )}

      {children}
    </div>
  );
}

