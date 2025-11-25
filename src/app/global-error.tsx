"use client";

import NextError from "next/error";
import { Providers } from '@/components/providers';
import { defaultLocale } from './constants';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {

  return (
    <html>
      <body>
        <Providers locale={defaultLocale}>
          {/* `NextError` is the default Next.js error page component. Its type
          definition requires a `statusCode` prop. However, since the App Router
          does not expose status codes for errors, we simply pass 0 to render a
          generic error message. */}
          <NextError statusCode={0} />
        </Providers>
      </body>
    </html>
  );
}