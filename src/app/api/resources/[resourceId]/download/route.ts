import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain; charset=utf-8",
};

function detectExtensionFromBytes(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5).startsWith("%PDF")) {
    return ".pdf";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return ".docx";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return ".doc";
  }
  return null;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;
  if (!resourceId) {
    return new NextResponse("Resource ID is required", { status: 400, headers: NO_STORE_HEADERS });
  }

  // 1. Authenticate user
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (authError || !claims?.sub) {
    return new NextResponse("Unauthorized: Please sign in to access academic resources.", {
      status: 401,
      headers: NO_STORE_HEADERS,
    });
  }

  const user = {
    id: claims.sub as string,
    email: claims.email as string | undefined,
    user_role: claims.user_role as string | undefined,
  };

  // 2. Fetch user role (fast-path from JWT claim, fallback to DB query)
  let userRole = user.user_role;
  if (!userRole) {
    const { data: userProfile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = userProfile?.role;
  }

  if (!userRole || (userRole !== "student" && userRole !== "admin")) {
    return new NextResponse("Forbidden: Access restricted to students and staff.", {
      status: 403,
      headers: NO_STORE_HEADERS,
    });
  }

  // 3. Fetch resource metadata using service client
  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) {
    return new NextResponse("Server configuration error", { status: 500, headers: NO_STORE_HEADERS });
  }

  const { data: resource, error: resError } = await serviceClient
    .from("resources")
    .select("id, title, storage_path, url, is_published, resource_type")
    .eq("id", resourceId)
    .single();

  if (resError || !resource) {
    return new NextResponse("Resource not found", { status: 404, headers: NO_STORE_HEADERS });
  }

  // If student, enforce that resource is published (return 404 to avoid leaking existence)
  if (userRole === "student" && !resource.is_published) {
    return new NextResponse("Resource not found", { status: 404, headers: NO_STORE_HEADERS });
  }

  // 4. If it's a stored file in the private storage bucket
  if (resource.storage_path) {
    // Validate storage path against directory traversal
    if (
      resource.storage_path.includes("..") ||
      resource.storage_path.startsWith("/") ||
      !/^[a-zA-Z0-9_\-\/.]+$/.test(resource.storage_path)
    ) {
      return new NextResponse("Invalid storage path", { status: 400, headers: NO_STORE_HEADERS });
    }

    const { data: fileBlob, error: downloadError } = await serviceClient.storage
      .from("academic_resources")
      .download(resource.storage_path);

    if (downloadError || !fileBlob) {
      console.error("Error downloading resource from storage:", downloadError);
      return new NextResponse("File not found in storage", { status: 404, headers: NO_STORE_HEADERS });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    // Resolve extension from storage path or content
    const lastDot = resource.storage_path.lastIndexOf(".");
    const pathExt = lastDot !== -1 ? resource.storage_path.slice(lastDot).toLowerCase() : "";
    const detectedExt = detectExtensionFromBytes(buffer);
    const resolvedExt = pathExt in MIME_MAP ? pathExt : detectedExt || pathExt;

    // Content type
    const contentType = MIME_MAP[resolvedExt] || fileBlob.type || "application/octet-stream";

    // Sanitize title for filename
    let cleanTitle = (resource.title || "resource")
      .replace(/[\x00-\x1F\x7F\r\n]/g, "")
      .replace(/[/\\]/g, "_")
      .replace(/"/g, "'")
      .trim();

    if (!cleanTitle) cleanTitle = "resource";

    // Ensure filename has the correct resolved extension without duplication
    let finalFilename: string;
    if (resolvedExt && cleanTitle.toLowerCase().endsWith(resolvedExt)) {
      finalFilename = cleanTitle;
    } else if (resolvedExt) {
      finalFilename = `${cleanTitle}${resolvedExt}`;
    } else {
      finalFilename = cleanTitle;
    }

    const safeAsciiFilename = finalFilename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, '\\"');
    const safeUtf8Filename = encodeURIComponent(finalFilename);

    const dispositionType =
      request.nextUrl.searchParams.get("download") === "true" ? "attachment" : "inline";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${dispositionType}; filename="${safeAsciiFilename}"; filename*=UTF-8''${safeUtf8Filename}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // 5. If it's an external URL, redirect securely
  if (resource.url) {
    return NextResponse.redirect(resource.url);
  }

  return new NextResponse("No file or URL associated with this resource.", { status: 404, headers: NO_STORE_HEADERS });
}
