import React from 'react';
import { Template } from '../templates';
export default function Page404() {
  return <article className="content-page !bg-primary-dark h-full">
    <section className="wrap bg-gray">
      <h1>404: We couldn't tune to this frequency.</h1>
      <h2>How are you, by the way?</h2>
    </section>
  </article>;
}

Page404.getLayout = function getLayout(page) {
  return (
    <Template>
      {page}
    </Template>
  )
}