import Image from "next/image";
import Template from "./_template"
import { fetchPages } from "@/lib/notion";
import { Comfortaa } from 'next/font/google'
 

export default async function Home() {
  const pages = await fetchPages()
  return (
    <Template pages={pages} />
  );
}
