import { fetchAllArticles } from "@/lib/payload";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await fetchAllArticles();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching articles:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

