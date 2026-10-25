import React from "react";
import { getAdminResourcesAction, getAdminSubjectsAction } from "./actions";
import { AdminResourcesClient } from "./AdminResourcesClient";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const [resources, subjects] = await Promise.all([
    getAdminResourcesAction(),
    getAdminSubjectsAction(),
  ]);

  return <AdminResourcesClient initialResources={resources} subjects={subjects} />;
}
