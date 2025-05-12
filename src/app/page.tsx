import Image from "next/image";
import Index from "./_index"
import { fetchPages } from "@/lib/notion";
import { Comfortaa } from 'next/font/google'
 

export default async function Home() {
  const pages = await fetchPages()
  return (
    <Index pages={pages} />
  );
}
