import "server-only";

import { Client } from "@notionhq/client";
import React from "react";
import {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Dupip Pages
export const fetchPages = React.cache(() => {
  return notion.databases.query({
    database_id: process.env.NOTION_PAGE_DATABASE!,
    filter: {
      property: "Status",
      select: {
        equals: "Published",
      },
    },
  });
});

export const fetchPageBySlug = React.cache((slug: string) => {
  return notion.databases
    .query({
      database_id: process.env.NOTION_PAGE_DATABASE!,
      filter: {
        property: "Slug",
        rich_text: {
          equals: slug,
        },
      },
    })
    .then((res) => res.results[0] as PageObjectResponse | undefined);
});

export const fetchPageBlocks = React.cache((pageId: string) => {
  return notion.blocks.children
    .list({ block_id: pageId })
    .then((res) => res.results as BlockObjectResponse[]);
});


// Dupip Episodes
export const fetchEpisodes = React.cache(() => {
  return notion.databases.query({
    database_id: process.env.NOTION_EPISODE_DATABASE!,
    filter: {
      property: "Status",
      select: {
        equals: "Published",
      },
    },
  });
});

export const fetchEpisodeBySlug = React.cache((slug: string) => {
  return notion.databases
    .query({
      database_id: process.env.NOTION_EPISODE_DATABASE!,
      filter: {
        property: "Slug",
        rich_text: {
          equals: slug,
        },
      },
    })
    .then((res) => res.results[0] as PageObjectResponse | undefined);
});

export const fetchEpisodeBlocks = React.cache((pageId: string) => {
  return notion.blocks.children
    .list({ block_id: pageId })
    .then((res) => res.results as BlockObjectResponse[]);
});