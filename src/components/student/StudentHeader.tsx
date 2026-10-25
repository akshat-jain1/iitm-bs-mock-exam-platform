"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeProvider";

interface StudentHeaderProps {
  isTester?: boolean;
  userEmail?: string | null;
}

const navItems = [
  { name: "Dashboard", href: "/student", exact: true },
  { name: "Exams", href: "/student/exams", exact: false },
  { name: "Classes", href: "/student/classes", exact: false },
  { name: "Practice", href: "/student/practice", exact: false },
  { name: "Results", href: "/student/results", exact: false },
  { name: "Resources", href: "/student/resources", exact: false },
  { name: "Feedback", href: "/student/feedback", exact: false },
  { name: "Profile", href: "/student/profile", exact: false },
];

export function StudentHeader({ userEmail, isTester = false }: StudentHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on Escape key press
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isItemActive = (item: typeof navItems[0]) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname?.startsWith(item.href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Main Nav */}
          <div className="flex items-center space-x-6 lg:space-x-8 min-w-0">
            <Link href="/student" className="flex items-center space-x-2 shrink-0">
              <span className="font-bold text-slate-900 dark:text-slate-50 tracking-tight text-lg">
                {isTester ? "Tester Portal" : "Student Portal"}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1" aria-label="Student Navigation">
              {navItems.map((item) => {
                const active = isItemActive(item);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-2.5 lg:px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold shadow-xs"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action / Profile */}
          <div className="hidden md:flex items-center space-x-3 lg:space-x-4 shrink-0">
            <ThemeToggle />
            {userEmail && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200/80 dark:border-slate-700/80 max-w-[200px] truncate" title={userEmail}>
                {userEmail}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout} className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              Sign Out
            </Button>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center space-x-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown & backdrop */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 top-16 bg-slate-900/20 backdrop-blur-xs z-30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-40 md:hidden border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 pt-2 pb-5 space-y-1.5 shadow-lg animate-in slide-in-from-top-2 duration-150">
            {navItems.map((item) => {
              const active = isItemActive(item);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    active
                      ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col space-y-2">
              {userEmail && (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2 py-1 truncate" title={userEmail}>
                  {userEmail}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout} className="w-full justify-center">
                Sign Out
              </Button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
