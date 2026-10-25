import React from "react";
import { getAdminClassSchedulesAction, getAdminSubjectsAction } from "./actions";
import { ClassScheduleManagementClient } from "./ClassScheduleManagementClient";

export const dynamic = "force-dynamic";

export default async function AdminClassSchedulePage() {
  const [schedulesRes, subjects] = await Promise.all([
    getAdminClassSchedulesAction(),
    getAdminSubjectsAction(),
  ]);

  return (
    <ClassScheduleManagementClient
      initialSchedules={schedulesRes.data}
      subjects={subjects}
    />
  );
}
