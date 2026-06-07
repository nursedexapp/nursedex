import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/helpers";
import { uploadBlogImage } from "@/lib/blog/images";

export const runtime = "nodejs";

/**
 * Admin-only blog image upload. The Tiptap editor and the cover image
 * field POST a single file as multipart/form-data and receive the
 * permanent public URL back. Writes are gated here and again by the
 * admin-only storage RLS on the blog-images bucket.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const result = await uploadBlogImage(file);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
