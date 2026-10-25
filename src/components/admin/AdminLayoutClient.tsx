"use client";

import React, { useState, useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminHeader } from "./AdminHeader";

interface AdminLayoutClientProps {
  userName?: string | null;
  userEmail?: string | null;
  children: React.ReactNode;
}

export function AdminLayoutClient({ userName, userEmail, children }: AdminLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex h-screen bg-white dark:bg-slate-900 overflow-hidden selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-200">
      {/* Desktop Sidebar (visible on lg and wider) */}
      <div className="hidden lg:flex h-full shrink-0">
        <AdminSidebar userName={userName} userEmail={userEmail} />
      </div>

      {/* Mobile Drawer (visible on mobile / tablet when opened) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <AdminSidebar
              userName={userName}
              userEmail={userEmail}
              onClose={() => setMobileMenuOpen(false)}
              className="flex h-full w-full flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-sans"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <AdminHeader onToggleSidebar={() => setMobileMenuOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
