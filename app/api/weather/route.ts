import { NextResponse } from "next/server";
import { ghanaWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await ghanaWeather();
  return NextResponse.json(data);
}
