import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BlogLocale } from '../locale';
import Image from './ImageBlock';
import { localizeUrl } from '../lib/helpers';
import { CardGrid, ECardGridVariant } from '@dreampipcom/oneiros';

// const PostsGrid = styled.div`
//   grid-template-columns: 1fr;

//   @media screen and (min-width: 768px) {
//     grid-template-columns: 1fr 1fr;
//   }
// `

export const BLOG_POSTS = [
  {
    id: 'molecule__cardgrid__card--01',
    className: '',
    title: 'This is a card example #01',
    link: 'https://dreampip.com',
    // images: [],
  },
];

function Posts({
  posts,
  intro,
  heading,
  id,
  headingLevel = 'h1',
  postTitleLevel = 'h2',
  readMoreText = 'See more >',
}) {
  const { locale: orig, pathname, isFallback } = useRouter()
  const locale = orig === "default" ? "en" : orig
  const localization = BlogLocale[locale] || BlogLocale["default"]
  console.log({ ECardGridVariant })
  const postsMap = posts.map((post, index) => {
    return {
      className: `molecule__cardgrid__post--${post.title}--${index}`,
      title: post?.title,
      images: [post?.image?.url],
      link: localizeUrl(`/post/${post.url}`, locale),
    }
  })
  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <section {...(id && { id })}>
      <div>
        <CardGrid cards={postsMap} theme="light" variant={ECardGridVariant.FULL_WIDTH_IMAGE} />
      </div>
    </section>
  );
}

export default Posts;