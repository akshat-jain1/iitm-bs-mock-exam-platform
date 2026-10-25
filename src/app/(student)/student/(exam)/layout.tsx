import React from "react";

export default function ExamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex-1 flex flex-col font-sans">
      {children}
    </main>
  );
}
