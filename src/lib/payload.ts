import "server-only";

import { PayloadSDK } from "@payloadcms/sdk";
import React from "react";

// Initialize Payload SDK with baseURL from environment variable
const sdk = new PayloadSDK({
  baseURL: process.env.PAYLOAD_API_URL || process.env.NEXT_PUBLIC_PAYLOAD_API_URL || '',
});

// Dupip Pages
export const fetchPages = React.cache((locale?: string) => {
  return sdk.find({
    collection: "pages",
    locale,
    where: {
      _status: {
        equals: "published",
      },
    },
  });
});

export const fetchPageBySlug = React.cache((slug: string, locale?: string) => {
  return sdk
    .find({
      collection: "pages",
      locale,
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 2, // Include nested layout and columns data
    })
    .then((res) => {
      const page = res.docs[0];
      // If page found, ensure layout data is properly parsed
      if (page && (page as any).layout) {
        // Parse layout structure if needed
        const layout = (page as any).layout;
        if (Array.isArray(layout) && layout.length > 0) {
          const firstLayout = layout[0];
          if (firstLayout.columns && Array.isArray(firstLayout.columns) && firstLayout.columns.length > 0) {
            // Ensure richText is accessible
            const firstColumn = firstLayout.columns[0];
            if (firstColumn.richText) {
              // Data is already structured correctly
              return page;
            }
          }
        }
      }
      return page;
    });
});

export const fetchPageBlocks = React.cache((pageId: string, locale?: string) => {
  // Fetch the page by ID to get its content/blocks
  return sdk
    .findByID({
      collection: "pages",
      id: pageId,
      locale,
    })
    .then((page) => {
      // Return content/blocks from the page document
      // Adjust this based on your Payload CMS schema structure
      return page?.content || page?.blocks || [];
    });
});


// Dupip Articles (Posts)
export const fetchArticles = React.cache((locale?: string) => {
  return sdk.find({
    collection: "posts",
    locale,
    where: {
      _status: {
        equals: "published",
      },
    },
  });
});

export const fetchEpisodeBySlug = React.cache((slug: string, locale?: string) => {
  return sdk
    .find({
      collection: "posts",
      locale,
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
    })
    .then((res) => res.docs[0]);
});

export const fetchEpisodeBlocks = React.cache((pageId: string, locale?: string) => {
  // Fetch the post by ID to get its content/blocks
  return sdk
    .findByID({
      collection: "posts",
      id: pageId,
      locale,
    })
    .then((post) => {
      // Return content/blocks from the post document
      // Adjust this based on your Payload CMS schema structure
      return post?.content || post?.blocks || [];
    });
});

// Fetch all pages with pagination handling (for sitemap)
export async function fetchAllPages() {
  // Make initial request to get first page and totalPages
  const firstResponse = await sdk.find({
    collection: "pages",
    where: {
      _status: {
        equals: "published",
      },
    },
    page: 1,
  });

  const totalPages = (firstResponse as any).totalPages || 1;
  const allDocs = [...(firstResponse.docs || [])];

  // If there are more pages, fetch them all in parallel
  if (totalPages > 1) {
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const remainingResponses = await Promise.all(
      remainingPages.map((page) =>
        sdk.find({
          collection: "pages",
          where: {
            _status: {
              equals: "published",
            },
          },
          page,
        })
      )
    );

    // Combine all docs from remaining pages
    remainingResponses.forEach((response) => {
      allDocs.push(...(response.docs || []));
    });
  }

  return { docs: allDocs };
}

// Fetch all articles with pagination handling (for sitemap)
export async function fetchAllArticles(locale?: string) {
  // Make initial request to get first page and totalPages
  const firstResponse = await sdk.find({
    collection: "posts",
    locale,
    where: {
      _status: {
        equals: "published",
      },
    },
    page: 1,
  });

  const totalPages = (firstResponse as any).totalPages || 1;
  const allDocs = [...(firstResponse.docs || [])];

  // If there are more pages, fetch them all in parallel
  if (totalPages > 1) {
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const remainingResponses = await Promise.all(
      remainingPages.map((page) =>
        sdk.find({
          collection: "posts",
          locale,
          where: {
            _status: {
              equals: "published",
            },
          },
          page,
        })
      )
    );

    // Combine all docs from remaining pages
    remainingResponses.forEach((response) => {
      allDocs.push(...(response.docs || []));
    });
  }

  return { docs: allDocs };
}