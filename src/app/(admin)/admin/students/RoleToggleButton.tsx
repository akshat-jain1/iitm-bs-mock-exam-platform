"use client"

import { useState } from "react"
import { updateUserRoleAction } from "./actions"
import { Button } from "@/components/ui/Button"

interface RoleToggleButtonProps {
  userId: string
  currentRole: "student" | "admin" | "tester"
  isCurrentUser: boolean
}

export function RoleToggleButton({ userId, currentRole, isCurrentUser }: RoleToggleButtonProps) {
  const [loadingRole, setLoadingRole] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRoleChange = async (targetRole: "student" | "admin" | "tester") => {
    if (isCurrentUser && currentRole === "admin" && targetRole !== "admin") {
      if (!confirm("Are you sure you want to revoke your own administrator privileges?")) {
        return
      }
    }

    setLoadingRole(targetRole)
    setError(null)
    try {
      await updateUserRoleAction(userId, targetRole)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role")
    } finally {
      setLoadingRole(null)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {currentRole === "student" && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingRole !== null}
              onClick={() => handleRoleChange("tester")}
              className="text-xs h-7 px-2.5 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900"
            >
              {loadingRole === "tester" ? "Updating..." : "Promote to Tester"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={loadingRole !== null}
              onClick={() => handleRoleChange("admin")}
              className="text-xs h-7 px-2.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loadingRole === "admin" ? "Updating..." : "Promote to Admin"}
            </Button>
          </>
        )}

        {currentRole === "tester" && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingRole !== null}
              onClick={() => handleRoleChange("student")}
              className="text-xs h-7 px-2.5 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-800 dark:hover:text-red-200"
            >
              {loadingRole === "student" ? "Updating..." : "Revoke Tester"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={loadingRole !== null}
              onClick={() => handleRoleChange("admin")}
              className="text-xs h-7 px-2.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loadingRole === "admin" ? "Updating..." : "Promote to Admin"}
            </Button>
          </>
        )}

        {currentRole === "admin" && (
          <Button
            variant="outline"
            size="sm"
            disabled={loadingRole !== null}
            onClick={() => handleRoleChange("student")}
            className="text-xs h-7 px-2.5 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 hover:text-red-800 dark:hover:text-red-200"
          >
            {loadingRole === "student" ? "Updating..." : "Revoke Admin"}
          </Button>
        )}
      </div>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">{error}</span>}
    </div>
  )
}
