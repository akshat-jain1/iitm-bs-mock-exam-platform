import React from "react";
import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/auth/cached-auth";
import { getStudentResourcesAction, getStudentSubjectsAction } from "./actions";
import { StudentResourcesClient } from "./StudentResourcesClient";

export const dynamic = "force-dynamic";

export default async function StudentResourcesPage() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const [resources, subjects] = await Promise.all([
    getStudentResourcesAction(),
    getStudentSubjectsAction(),
  ]);

  return <StudentResourcesClient initialResources={resources} subjects={subjects} />;
}
