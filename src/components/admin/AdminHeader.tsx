"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

export interface AdminHeaderProps {
  onToggleSidebar?: () => void;
}

export function AdminHeader({ onToggleSidebar }: AdminHeaderProps = {}) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 sm:px-6 font-sans shrink-0">
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Open navigation menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <span className="lg:hidden font-bold text-slate-800 dark:text-slate-100 text-base">Platform Admin</span>
      </div>
      <div className="flex items-center space-x-3 sm:space-x-4">
        <ThemeToggle />
        <button className="rounded-full bg-white dark:bg-slate-900 p-1 text-slate-400 hover:text-slate-500 dark:hover:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span className="sr-only">View notifications</span>
          🔔
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50 shadow-xs font-medium text-xs sm:text-sm"
        >
          Sign Out
        </Button>
      </div>
    </header>
  );
}
