"use server";

import { createClient } from "@/lib/supabase/server";
import { getServiceClientOrNull } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/auth/cached-auth";

export interface AdminResourceItem {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  resource_type: "youtube" | "pdf" | "website" | "formula_sheet" | "notes" | "other";
  url: string;
  storage_path: string | null;
  topic: string;
  is_published: boolean;
  created_at: string;
  subjects: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
}

export async function getAdminResourcesAction(): Promise<AdminResourceItem[]> {
  await verifyAdmin();

  // Use service role for fast admin retrieval
  const queryClient = getServiceClientOrNull() || (await createClient());

  const { data, error } = await queryClient
    .from("resources")
    .select(`
      id,
      subject_id,
      title,
      description,
      resource_type,
      url,
      storage_path,
      topic,
      is_published,
      created_at,
      subjects!inner ( id, code, name )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching admin resources:", error);
    return [];
  }

  interface ResourceJoin {
    id: string;
    subject_id: string;
    title: string;
    description: string;
    resource_type: AdminResourceItem["resource_type"];
    url: string;
    storage_path: string | null;
    topic: string;
    is_published: boolean;
    created_at: string;
    subjects: { id: string; code: string; name: string } | { id: string; code: string; name: string }[];
  }

  return ((data as unknown as ResourceJoin[]) || []).map((r) => {
    const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
    return {
      id: r.id,
      subject_id: r.subject_id,
      title: r.title,
      description: r.description || "",
      resource_type: r.resource_type,
      url: r.url || "",
      storage_path: r.storage_path,
      topic: r.topic || "",
      is_published: r.is_published,
      created_at: r.created_at,
      subjects: s ? { id: s.id, code: s.code, name: s.name } : null,
    };
  });
}

export async function getAdminSubjectsAction(): Promise<SubjectItem[]> {
  await verifyAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("Error fetching subjects:", error);
    return [];
  }

  return data;
}

const MAX_RESOURCE_SIZE = 20 * 1024 * 1024; // 20MB

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt"] as const;

function validateResourceFile(file: File): { valid: true } | { valid: false; error: string } {
  if (file.size === 0) {
    return { valid: false, error: "Uploaded file is empty. Please select a valid document." };
  }
  if (file.size > MAX_RESOURCE_SIZE) {
    return { valid: false, error: "File exceeds 20MB size limit." };
  }

  const name = file.name || "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) {
    return {
      valid: false,
      error: "Uploaded file has no extension. Allowed formats: .pdf, .docx, .doc, .txt",
    };
  }

  const ext = name.slice(lastDot).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      valid: false,
      error: `Unsupported file format '${ext}'. Allowed formats: .pdf, .docx, .doc, .txt`,
    };
  }

  return { valid: true };
}

async function validateResourceContent(file: File): Promise<{ valid: true } | { valid: false; error: string }> {
  const name = file.name || "";
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();

  const slice = await file.slice(0, Math.min(512, file.size)).arrayBuffer();
  const header = Buffer.from(slice);

  if (ext === ".pdf") {
    if (header.length < 5 || !header.toString("ascii", 0, 5).startsWith("%PDF")) {
      return { valid: false, error: "Malformed PDF file: missing PDF header signature (%PDF)." };
    }
  } else if (ext === ".docx") {
    // DOCX is a ZIP container starting with PK\x03\x04
    if (header.length < 4 || header[0] !== 0x50 || header[1] !== 0x4B || header[2] !== 0x03 || header[3] !== 0x04) {
      return { valid: false, error: "Malformed DOCX file: missing document package signature." };
    }
  } else if (ext === ".doc") {
    // Legacy DOC is OLE CFBF starting with \xD0\xCF\x11\xE0
    if (header.length < 4 || header[0] !== 0xD0 || header[1] !== 0xCF || header[2] !== 0x11 || header[3] !== 0xE0) {
      return { valid: false, error: "Malformed DOC file: missing document structure signature." };
    }
  } else if (ext === ".txt") {
    // Plain text should not contain null bytes
    if (header.includes(0x00)) {
      return { valid: false, error: "Malformed text file: binary data detected in text file." };
    }
  }

  return { valid: true };
}

function generateSafeStoragePath(subjectId: string, originalName: string): string {
  if (!/^[0-9a-fA-F-]{36}$/.test(subjectId)) {
    throw new Error("Invalid subject ID format.");
  }
  const basename = originalName.split(/[/\\]/).pop() || "resource";
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.+/g, ".");
  return `${subjectId}/${Date.now()}_${sanitized}`;
}

export async function createResourceAction(formData: FormData) {
  let user;
  try {
    const auth = await verifyAdmin();
    user = auth.user;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const subjectId = formData.get("subject_id") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const resourceType = formData.get("resource_type") as AdminResourceItem["resource_type"];
  const url = (formData.get("url") as string)?.trim() || "";
  const topic = (formData.get("topic") as string)?.trim() || "";
  const isPublished = formData.get("is_published") === "true";
  const file = formData.get("file") as File | null;

  if (!subjectId || !title || !resourceType) {
    return { success: false, error: "Subject, title, and resource type are required." };
  }

  if (!/^[0-9a-fA-F-]{36}$/.test(subjectId)) {
    return { success: false, error: "Invalid Subject ID." };
  }

  let storagePath: string | null = null;
  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) return { success: false, error: "Storage service configuration missing." };

  // Handle file upload if present
  if (file && file.size > 0) {
    const fileValidation = validateResourceFile(file);
    if (!fileValidation.valid) {
      return { success: false, error: fileValidation.error };
    }

    const contentValidation = await validateResourceContent(file);
    if (!contentValidation.valid) {
      return { success: false, error: contentValidation.error };
    }

    const filePath = generateSafeStoragePath(subjectId, file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from("academic_resources")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading resource file:", uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    storagePath = filePath;
  } else if (file && file.size === 0) {
    return { success: false, error: "Uploaded file is empty. Please select a valid document." };
  }

  if (!storagePath && !url) {
    return { success: false, error: "Either a document file or an external URL must be provided." };
  }

  const { data: newResource, error: insertError } = await serviceClient
    .from("resources")
    .insert({
      subject_id: subjectId,
      title,
      description,
      resource_type: resourceType,
      url,
      storage_path: storagePath,
      topic,
      is_published: isPublished,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Error inserting resource:", insertError);
    if (storagePath) {
      try {
        await serviceClient.storage.from("academic_resources").remove([storagePath]);
      } catch (cleanErr) {
        console.error("Failed to clean up storage object after DB insert failure:", cleanErr);
      }
    }
    return { success: false, error: insertError.message };
  }

  if (storagePath && !url) {
    await serviceClient
      .from("resources")
      .update({ url: `/api/resources/${newResource.id}/download` })
      .eq("id", newResource.id);
  }

  revalidatePath("/admin/resources");
  revalidatePath("/student/resources");
  return { success: true, id: newResource.id };
}

export async function updateResourceAction(id: string, formData: FormData) {
  try {
    await verifyAdmin();
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unauthorized" };
  }

  const subjectId = formData.get("subject_id") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const resourceType = formData.get("resource_type") as AdminResourceItem["resource_type"];
  let url = (formData.get("url") as string)?.trim() || "";
  const topic = (formData.get("topic") as string)?.trim() || "";
  const isPublished = formData.get("is_published") === "true";
  const file = formData.get("file") as File | null;

  if (!subjectId || !title || !resourceType) {
    return { success: false, error: "Subject, title, and resource type are required." };
  }

  if (!/^[0-9a-fA-F-]{36}$/.test(subjectId)) {
    return { success: false, error: "Invalid Subject ID." };
  }

  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) return { success: false, error: "Storage service configuration missing." };

  const { data: existingResource, error: fetchErr } = await serviceClient
    .from("resources")
    .select("id, storage_path, url")
    .eq("id", id)
    .single();

  if (fetchErr || !existingResource) {
    return { success: false, error: "Resource not found." };
  }

  let newStoragePath: string | null = null;

  if (file && file.size > 0) {
    const fileValidation = validateResourceFile(file);
    if (!fileValidation.valid) {
      return { success: false, error: fileValidation.error };
    }

    const contentValidation = await validateResourceContent(file);
    if (!contentValidation.valid) {
      return { success: false, error: contentValidation.error };
    }

    const filePath = generateSafeStoragePath(subjectId, file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from("academic_resources")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    newStoragePath = filePath;
  } else if (file && file.size === 0) {
    return { success: false, error: "Uploaded file is empty. Please select a valid document." };
  }

  const finalStoragePath = newStoragePath ?? existingResource.storage_path;
  if (!url) {
    if (finalStoragePath) {
      url = `/api/resources/${id}/download`;
    } else {
      url = existingResource.url;
    }
  }

  const updatePayload: Record<string, unknown> = {
    subject_id: subjectId,
    title,
    description,
    resource_type: resourceType,
    url,
    topic,
    is_published: isPublished,
    updated_at: new Date().toISOString(),
  };

  if (newStoragePath) {
    updatePayload.storage_path = newStoragePath;
  }

  const { error: updateError } = await serviceClient
    .from("resources")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    console.error("Error updating resource:", updateError);
    if (newStoragePath) {
      try {
        await serviceClient.storage.from("academic_resources").remove([newStoragePath]);
      } catch (cleanErr) {
        console.error("Failed to clean up newly uploaded file:", cleanErr);
      }
    }
    return { success: false, error: updateError.message };
  }

  if (newStoragePath && existingResource.storage_path && existingResource.storage_path !== newStoragePath) {
    try {
      await serviceClient.storage.from("academic_resources").remove([existingResource.storage_path]);
    } catch (oldCleanErr) {
      console.warn("Notice: Failed to clean up replaced file:", oldCleanErr);
    }
  }

  revalidatePath("/admin/resources");
  revalidatePath("/student/resources");
  return { success: true };
}

export async function deleteResourceAction(id: string) {
  await verifyAdmin();

  const serviceClient = getServiceClientOrNull();
  if (!serviceClient) return { success: false, error: "Storage service configuration missing." };

  const { data: res } = await serviceClient
    .from("resources")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (res?.storage_path && !res.storage_path.includes("..") && !res.storage_path.startsWith("/")) {
    await serviceClient.storage.from("academic_resources").remove([res.storage_path]);
  }

  const { error: deleteError } = await serviceClient.from("resources").delete().eq("id", id);

  if (deleteError) {
    console.error("Error deleting resource:", deleteError);
    return { success: false, error: deleteError.message };
  }

  revalidatePath("/admin/resources");
  revalidatePath("/student/resources");
  return { success: true };
}


export async function togglePublishResourceAction(id: string, isPublished: boolean) {
  await verifyAdmin();

  const serviceClient = getServiceClientOrNull() || (await createClient());

  const { error } = await serviceClient
    .from("resources")
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/resources");
  revalidatePath("/student/resources");
  return { success: true };
}
