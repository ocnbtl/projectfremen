import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAdminSessionToken } from "../../../../lib/auth";

function sanitizePath(value: string, fallback: string) {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }

  if (value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const errorPath = sanitizePath(String(formData.get("errorPath") ?? ""), "/admin/login");
  const successPath = sanitizePath(String(formData.get("successPath") ?? ""), "/admin");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || password !== adminPassword) {
    return NextResponse.redirect(new URL(`${errorPath}?error=1`, request.url));
  }

  const jar = await cookies();
  const sessionToken = await buildAdminSessionToken(adminPassword);

  jar.set("admin_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return NextResponse.redirect(new URL(successPath, request.url));
}
