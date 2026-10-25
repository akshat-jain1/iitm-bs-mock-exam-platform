import { isQuestionAssetPath } from "@/lib/question-images";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";

const RESTRICTIVE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length === 0) {
    return new NextResponse("Asset path missing", { status: 400, headers: RESTRICTIVE_NO_STORE_HEADERS });
  }

  const storagePath = path.join("/");

  // Path traversal guard
  if (!isQuestionAssetPath(storagePath)) {
    return new NextResponse("Invalid asset path", { status: 400, headers: RESTRICTIVE_NO_STORE_HEADERS });
  }

  // 1. Authenticate user (support both cookies and Bearer tokens)
  const supabase = await createClient();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  
  const {
    data: claimsData,
    error: authError,
  } = token 
    ? await supabase.auth.getClaims(token)
    : await supabase.auth.getClaims();

  const claims = claimsData?.claims;
  if (authError || !claims?.sub) {
    return new NextResponse("Unauthorized: Authentication required to view exam assets.", {
      status: 401,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
    });
  }

  const user = {
    id: claims.sub as string,
    email: claims.email as string | undefined,
    user_role: claims.user_role as string | undefined,
  };

  // Use service client for internal role and authorization verification
  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) {
    return new NextResponse("Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set.", {
      status: 500,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
    });
  }

  // 2. Fetch user role (fast-path from JWT custom claim, fallback to DB query)
  let userRole = user.user_role;
  if (!userRole) {
    const { data: profile } = await serviceClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = profile?.role;
  }

  // 3. Authorization check
  if (userRole === "admin") {
    // Admin has full authorization to preview question assets for authoring
  } else if (userRole === "student") {
    // Student must be an authorized Scaler account
    const { isAllowedScalerEmail } = await import("@/lib/auth/config");
    if (!isAllowedScalerEmail(user.email)) {
      return new NextResponse("Forbidden: Access restricted to official Scaler accounts.", {
        status: 403,
        headers: RESTRICTIVE_NO_STORE_HEADERS,
      });
    }

    let isAuthorized = false;

    // 1. Check active HMAC-signed exam session cookies first
    const secret = process.env.EXAM_SESSION_SECRET;
    if (secret) {
      const allCookies = request.cookies.getAll();
      const sessionCookies = allCookies.filter((c) => c.name.startsWith("exam_session_"));
      for (const cookie of sessionCookies) {
        try {
          const { payload, signature } = JSON.parse(cookie.value);
          const { createHmac } = await import("crypto");
          const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
          if (signature !== expectedSig) continue;

          const sessionData = JSON.parse(payload);
          if (sessionData.studentId !== user.id || !sessionData.assessmentId) continue;

          // Check if this storagePath belongs to the authorized assessment papers
          const { isAssetInAssessmentPapers } = await import("@/lib/exam/paper-cache");
          const allowed = await isAssetInAssessmentPapers(
            sessionData.assessmentId,
            storagePath,
            serviceClient
          );
          if (allowed) {
            isAuthorized = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // 2. Non-hot-path DB fallback: verify via check_exam_asset_access RPC (e.g. for past attempts or review)
    if (!isAuthorized) {
      const { data: rpcAuth, error: rpcError } = await serviceClient.rpc(
        "check_exam_asset_access",
        {
          p_user_id: user.id,
          p_user_role: userRole,
          p_storage_path: storagePath,
        }
      );
      if (!rpcError && rpcAuth) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new NextResponse("Forbidden: Access to this exam asset is restricted.", {
        status: 403,
        headers: RESTRICTIVE_NO_STORE_HEADERS,
      });
    }
  } else if (userRole === "tester") {
    // Authorized tester: can ONLY access question images and reference assets
    // for TEST assessments they are permitted to access.
    // Strictly blocked from accessing PRODUCTION exam assets.
    let isAuthorized = false;

    // 1. Check active HMAC-signed exam session cookies first
    const secret = process.env.EXAM_SESSION_SECRET;
    if (secret) {
      const allCookies = request.cookies.getAll();
      const sessionCookies = allCookies.filter((c) => c.name.startsWith("exam_session_"));
      for (const cookie of sessionCookies) {
        try {
          const { payload, signature } = JSON.parse(cookie.value);
          const { createHmac } = await import("crypto");
          const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
          if (signature !== expectedSig) continue;

          const sessionData = JSON.parse(payload);
          if (sessionData.studentId !== user.id || !sessionData.assessmentId) continue;

          // Strictly verify this assessment is a TEST assignment
          const { data: eventData } = await serviceClient
            .from("assessment_events")
            .select("assignment_type, test_access_mode")
            .eq("id", sessionData.assessmentId)
            .single();

          if (eventData?.assignment_type !== "TEST") {
            continue; // Testers cannot access PRODUCTION exam assets
          }

          // Verify tester access policy on this TEST assessment
          let permitted = false;
          if (eventData.test_access_mode === "TESTER_ONLY") {
            permitted = true;
          } else {
            const { count } = await serviceClient
              .from("student_enrollments")
              .select("id", { count: "exact", head: true })
              .eq("student_id", user.id)
              .eq("is_active", true);
            permitted = (count !== null && count > 0) || sessionData.isTest === true;
          }

          if (!permitted) continue;

          // Check if this storagePath belongs to the authorized assessment papers
          const { isAssetInAssessmentPapers } = await import("@/lib/exam/paper-cache");
          const allowed = await isAssetInAssessmentPapers(
            sessionData.assessmentId,
            storagePath,
            serviceClient
          );
          if (allowed) {
            isAuthorized = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // 2. Fallback: check if the asset belongs to a TEST assignment where tester has attempts
    if (!isAuthorized) {
      const { data: testerAttempts } = await serviceClient
        .from("attempts")
        .select(`
          assessment_subjects!inner (
            assessment_event_id,
            assessment_events!inner (
              id,
              assignment_type
            )
          )
        `)
        .eq("student_id", user.id)
        .eq("assessment_subjects.assessment_events.assignment_type", "TEST");

      if (testerAttempts && testerAttempts.length > 0) {
        const { isAssetInAssessmentPapers } = await import("@/lib/exam/paper-cache");
        const eventIds = Array.from(
          new Set(
            testerAttempts.map(
              (a) =>
                (a.assessment_subjects as unknown as { assessment_event_id: string }).assessment_event_id
            )
          )
        );

        for (const eventId of eventIds) {
          const allowed = await isAssetInAssessmentPapers(eventId, storagePath, serviceClient);
          if (allowed) {
            isAuthorized = true;
            break;
          }
        }
      }
    }

    // 3. Fallback: check active TEST assignments permitted for testers
    if (!isAuthorized) {
      const { data: testEvents } = await serviceClient
        .from("assessment_events")
        .select("id, test_access_mode")
        .eq("assignment_type", "TEST")
        .in("status", ["Live", "Scheduled", "Draft"]);

      if (testEvents && testEvents.length > 0) {
        const { isAssetInAssessmentPapers } = await import("@/lib/exam/paper-cache");
        for (const event of testEvents) {
          let permitted = false;
          if (event.test_access_mode === "TESTER_ONLY") {
            permitted = true;
          } else {
            const { count } = await serviceClient
              .from("student_enrollments")
              .select("id", { count: "exact", head: true })
              .eq("student_id", user.id)
              .eq("is_active", true);
            permitted = count !== null && count > 0;
          }

          if (permitted) {
            const allowed = await isAssetInAssessmentPapers(event.id, storagePath, serviceClient);
            if (allowed) {
              isAuthorized = true;
              break;
            }
          }
        }
      }
    }

    if (!isAuthorized) {
      return new NextResponse("Forbidden: Access to this exam asset is restricted.", {
        status: 403,
        headers: RESTRICTIVE_NO_STORE_HEADERS,
      });
    }
  } else {
    return new NextResponse("Forbidden: Invalid user role.", {
      status: 403,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
    });
  }

  // 4. Download asset bytes from private question_assets storage
  const { data: blob, error: downloadError } = await serviceClient.storage
    .from("question_assets")
    .download(storagePath);

  if (downloadError || !blob) {
    return new NextResponse("Asset not found", {
      status: 404,
      headers: RESTRICTIVE_NO_STORE_HEADERS,
    });
  }

  const contentType = storagePath.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
