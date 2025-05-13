import type { Metadata } from "next"
import { Comfortaa } from "next/font/google"
import "@dreampipcom/oneiros/styles"
import "./globals.css"

const comfortaa = Comfortaa({
  variable: "--font-comforta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DreamPip",
  description: "Fintech for compassion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <body
        className={`${comfortaa.variable} antialiased `}
      >
        {children}
        <footer>
          <div className="" style={{ display: "flex", justifyContent: "center"}}>
            <small className="text-[12px] text-[#563769] m-8" >
              © 1992—Present Angelo Reale
            </small>
          </div>
        </footer>
      </body>
    </html>
  );
}
