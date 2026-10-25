"use client";

import React, { useState } from "react";
import { StudentResourceItem, StudentSubjectItem } from "./actions";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface StudentResourcesClientProps {
  initialResources: StudentResourceItem[];
  subjects: StudentSubjectItem[];
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; badgeClass: string; actionLabel: string }
> = {
  youtube: {
    label: "YouTube Video",
    icon: "▶️",
    badgeClass: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    actionLabel: "Watch Video",
  },
  formula_sheet: {
    label: "Formula Sheet",
    icon: "📐",
    badgeClass: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    actionLabel: "View Formulas",
  },
  notes: {
    label: "Study Notes",
    icon: "📝",
    badgeClass: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    actionLabel: "View Notes",
  },
  pdf: {
    label: "PDF Document",
    icon: "📄",
    badgeClass: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    actionLabel: "Open PDF",
  },
  website: {
    label: "Reference Portal",
    icon: "🌐",
    badgeClass: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    actionLabel: "Visit Site",
  },
  other: {
    label: "Reference Material",
    icon: "📎",
    badgeClass: "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700",
    actionLabel: "Open Resource",
  },
};

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    // Match standard watch URL or short youtu.be URL or embed URL
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return `https://www.youtube-nocookie.com/embed/${match[2]}`;
    }
    // Match playlist
    if (url.includes("playlist?list=")) {
      const listId = url.split("playlist?list=")[1]?.split("&")[0];
      if (listId) {
        return `https://www.youtube-nocookie.com/embed/videoseries?list=${listId}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function StudentResourcesClient({ initialResources, subjects }: StudentResourcesClientProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [videoModal, setVideoModal] = useState<{ title: string; embedUrl: string; originalUrl: string } | null>(
    null
  );

  // Filter logic
  const filteredResources = initialResources.filter((res) => {
    if (selectedSubjectId !== "all" && res.subject_id !== selectedSubjectId) return false;
    if (selectedType !== "all" && res.resource_type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = res.title.toLowerCase().includes(q);
      const matchTopic = res.topic.toLowerCase().includes(q);
      const matchDesc = res.description.toLowerCase().includes(q);
      const matchSubj = res.subjects?.name.toLowerCase().includes(q) || false;
      return matchTitle || matchTopic || matchDesc || matchSubj;
    }
    return true;
  });

  const handleOpenResource = (res: StudentResourceItem) => {
    if (res.resource_type === "youtube") {
      const embedUrl = getYouTubeEmbedUrl(res.url);
      if (embedUrl) {
        setVideoModal({ title: res.title, embedUrl, originalUrl: res.url });
        return;
      }
    }

    // PDF / Notes / Formula sheet with storage or URL
    if (res.storage_path) {
      window.open(`/api/resources/${res.id}/download`, "_blank", "noopener,noreferrer");
      return;
    }

    if (res.url) {
      window.open(res.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Academic Resources</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Official study materials, video lectures, formula sheets, and reference notes curated by faculty.
        </p>
      </div>

      {/* Subject Filter Bar */}
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
          Select Subject
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedSubjectId("all")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedSubjectId === "all"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            All Subjects ({initialResources.length})
          </button>
          {subjects.map((s) => {
            const count = initialResources.filter((r) => r.subject_id === s.id).length;
            const isSelected = selectedSubjectId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSubjectId(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span>{s.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? "bg-blue-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Type Filter Bar */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search Box */}
          <div className="w-full md:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources by title, topic..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            />
          </div>

          {/* Type Pills */}
          <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
            <button
              type="button"
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                selectedType === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              All Types
            </button>
            {Object.entries(TYPE_CONFIG).map(([typeKey, cfg]) => (
              <button
                key={typeKey}
                type="button"
                onClick={() => setSelectedType(typeKey)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  selectedType === typeKey
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label.replace(" Video", "").replace(" Document", "")}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Resources Grid */}
      <section>
        {filteredResources.length === 0 ? (
          <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-12 text-center flex flex-col items-center">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No Resources Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              No learning resources matched your filter or search query. Try choosing another subject or clearing filters.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredResources.map((res) => {
              const meta = TYPE_CONFIG[res.resource_type] || TYPE_CONFIG.other;
              return (
                <Card
                  key={res.id}
                  className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                >
                  <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <Badge variant="outline" className={`text-[11px] font-semibold ${meta.badgeClass}`}>
                          {meta.icon} {meta.label}
                        </Badge>
                        <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {res.subjects?.code}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-bold text-slate-900 dark:text-slate-50 text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                        {res.title}
                      </h3>

                      {/* Topic Tag */}
                      {res.topic && (
                        <div className="mt-2">
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full inline-block">
                            Topic: {res.topic}
                          </span>
                        </div>
                      )}

                      {/* Description */}
                      {res.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-3 leading-relaxed">
                          {res.description}
                        </p>
                      )}
                    </div>

                    {/* Bottom Metadata & Action */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {res.subjects?.name}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => handleOpenResource(res)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-xs"
                      >
                        {meta.actionLabel} →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Embedded YouTube Video Modal */}
      {videoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="text-red-600 dark:text-red-400 font-bold">▶️</span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-50 line-clamp-1">{videoModal.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setVideoModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-video bg-black">
              <iframe
                src={videoModal.embedUrl}
                title={videoModal.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Playing in academic embed viewer
              </span>
              <div className="flex gap-2">
                <a
                  href={videoModal.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                >
                  Open in YouTube ↗
                </a>
                <Button size="sm" variant="outline" onClick={() => setVideoModal(null)} className="text-xs h-7">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
