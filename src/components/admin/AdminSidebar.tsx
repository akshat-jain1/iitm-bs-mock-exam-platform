"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Exams', href: '/admin/exams' },
  { name: 'Class Schedule', href: '/admin/class-schedule' },
  { name: 'Question Bank', href: '/admin/question-bank' },
  { name: 'Feedback', href: '/admin/feedback' },
  { name: 'Users & Roles', href: '/admin/students' },
  { name: 'Results', href: '/admin/results' },
  { name: 'Resources', href: '/admin/resources' },
  { name: 'Settings', href: '/admin/settings' },
];

export interface AdminSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
  onClose?: () => void;
  className?: string;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.map((part) => part[0]).filter(Boolean);
    if (letters.length > 0) {
      return letters.slice(0, 2).join("").toUpperCase();
    }
  }

  if (email && email.trim()) {
    const localPart = email.trim().split("@")[0];
    const parts = localPart.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (localPart.length > 0) {
      return localPart[0].toUpperCase();
    }
    return email.trim()[0].toUpperCase();
  }

  return "U";
}

export function AdminSidebar({ userName, userEmail, user, onClose, className }: AdminSidebarProps = {}) {
  const pathname = usePathname();

  const resolvedName = (userName ?? user?.name)?.trim() || null;
  const resolvedEmail = (userEmail ?? user?.email)?.trim() || null;

  const displayName = resolvedName || resolvedEmail || "User";
  const initials = getInitials(resolvedName, resolvedEmail);

  return (
    <div className={className || "flex h-full w-64 flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-sans"}>
      <div className="flex h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Platform Admin</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 -mr-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close navigation drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3" aria-label="Admin Navigation">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => onClose?.()}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-50'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
        <div className="flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="ml-3 min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{displayName}</p>
            {resolvedEmail && resolvedEmail !== displayName && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{resolvedEmail}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
