"use client";

import React, { useState } from "react";
import {
  AdminResourceItem,
  SubjectItem,
  createResourceAction,
  updateResourceAction,
  deleteResourceAction,
  togglePublishResourceAction,
} from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface AdminResourcesClientProps {
  initialResources: AdminResourceItem[];
  subjects: SubjectItem[];
}

const RESOURCE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  youtube: { label: "YouTube Video", icon: "▶️", color: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" },
  pdf: { label: "PDF Document", icon: "📄", color: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  notes: { label: "Study Notes", icon: "📝", color: "bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800" },
  formula_sheet: { label: "Formula Sheet", icon: "📐", color: "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  website: { label: "Website", icon: "🌐", color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  other: { label: "Reference Material", icon: "📎", color: "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700" },
};

export function AdminResourcesClient({ initialResources, subjects }: AdminResourcesClientProps) {
  const [resources, setResources] = useState<AdminResourceItem[]>(initialResources);
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<AdminResourceItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State
  const [formSubjectId, setFormSubjectId] = useState<string>(subjects[0]?.id || "");
  const [formTitle, setFormTitle] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formType, setFormType] = useState<AdminResourceItem["resource_type"]>("youtube");
  const [formUrl, setFormUrl] = useState<string>("");
  const [formTopic, setFormTopic] = useState<string>("");
  const [formIsPublished, setFormIsPublished] = useState<boolean>(true);
  const [formFile, setFormFile] = useState<File | null>(null);

  const openCreateModal = () => {
    setEditingResource(null);
    setFormSubjectId(subjects[0]?.id || "");
    setFormTitle("");
    setFormDescription("");
    setFormType("youtube");
    setFormUrl("");
    setFormTopic("");
    setFormIsPublished(true);
    setFormFile(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (r: AdminResourceItem) => {
    setEditingResource(r);
    setFormSubjectId(r.subject_id);
    setFormTitle(r.title);
    setFormDescription(r.description);
    setFormType(r.resource_type);
    setFormUrl(r.url);
    setFormTopic(r.topic);
    setFormIsPublished(r.is_published);
    setFormFile(null);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    const formData = new FormData();
    formData.append("subject_id", formSubjectId);
    formData.append("title", formTitle);
    formData.append("description", formDescription);
    formData.append("resource_type", formType);
    formData.append("url", formUrl);
    formData.append("topic", formTopic);
    formData.append("is_published", formIsPublished ? "true" : "false");
    if (formFile) {
      formData.append("file", formFile);
    }

    if (editingResource) {
      const res = await updateResourceAction(editingResource.id, formData);
      setSubmitting(false);
      if (res.success) {
        setIsModalOpen(false);
        const subj = subjects.find((s) => s.id === formSubjectId);
        setResources((prev) =>
          prev.map((item) =>
            item.id === editingResource.id
              ? {
                  ...item,
                  subject_id: formSubjectId,
                  title: formTitle,
                  description: formDescription,
                  resource_type: formType,
                  url: formUrl || item.url,
                  topic: formTopic,
                  is_published: formIsPublished,
                  subjects: subj ? { id: subj.id, code: subj.code, name: subj.name } : item.subjects,
                }
              : item
          )
        );
      } else {
        setModalError(res.error || "Failed to update resource.");
      }
    } else {
      const res = await createResourceAction(formData);
      setSubmitting(false);
      if (res.success && res.id) {
        setIsModalOpen(false);
        const subj = subjects.find((s) => s.id === formSubjectId);
        const newResource: AdminResourceItem = {
          id: res.id,
          subject_id: formSubjectId,
          title: formTitle,
          description: formDescription,
          resource_type: formType,
          url: formUrl,
          storage_path: formFile ? `uploaded` : null,
          topic: formTopic,
          is_published: formIsPublished,
          created_at: new Date().toISOString(),
          subjects: subj ? { id: subj.id, code: subj.code, name: subj.name } : null,
        };
        setResources((prev) => [newResource, ...prev]);
      } else {
        setModalError(res.error || "Failed to create resource.");
      }
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;

    const res = await deleteResourceAction(id);
    if (res.success) {
      setResources((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert(res.error || "Failed to delete resource.");
    }
  };

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    const res = await togglePublishResourceAction(id, nextStatus);
    if (res.success) {
      setResources((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_published: nextStatus } : r))
      );
    } else {
      alert(res.error || "Failed to update publish state.");
    }
  };

  // Filtered resources
  const filteredResources = resources.filter((r) => {
    if (selectedSubject !== "all" && r.subject_id !== selectedSubject) return false;
    if (selectedType !== "all" && r.resource_type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchTopic = r.topic.toLowerCase().includes(q);
      const matchDesc = r.description.toLowerCase().includes(q);
      const matchSubj = r.subjects?.name.toLowerCase().includes(q) || false;
      return matchTitle || matchTopic || matchDesc || matchSubj;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Academic Resources
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create, publish, and organize study notes, lecture videos, formula sheets, and reference materials.
          </p>
        </div>
        <Button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white font-medium shrink-0">
          + Add Resource
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="searchFilterInput" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Search Resources
            </label>
            <input
              id="searchFilterInput"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, topic, keyword..."
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            />
          </div>

          <div>
            <label htmlFor="subjectFilterSelect" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Filter by Subject
            </label>
            <select
              id="subjectFilterSelect"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            >
              <option value="all">All Subjects ({subjects.length})</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="typeFilterSelect" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Filter by Resource Type
            </label>
            <select
              id="typeFilterSelect"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
            >
              <option value="all">All Types</option>
              <option value="youtube">YouTube Video</option>
              <option value="formula_sheet">Formula Sheet</option>
              <option value="notes">Study Notes</option>
              <option value="pdf">PDF Document</option>
              <option value="website">Website Link</option>
              <option value="other">Reference Material</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Resources Table */}
      <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3 text-left">
                  Resource
                </th>
                <th scope="col" className="px-5 py-3 text-left">
                  Subject
                </th>
                <th scope="col" className="px-5 py-3 text-left">
                  Type
                </th>
                <th scope="col" className="px-5 py-3 text-left">
                  Topic / Tag
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  Status
                </th>
                <th scope="col" className="px-5 py-3 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                    No resources match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredResources.map((res) => {
                  const typeMeta = RESOURCE_TYPE_LABELS[res.resource_type] || RESOURCE_TYPE_LABELS.other;
                  return (
                    <tr key={res.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-colors">
                      <td className="px-5 py-4 max-w-sm">
                        <div className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-1">{res.title}</div>
                        {res.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{res.description}</div>
                        )}
                        {res.url && (
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block truncate max-w-xs font-mono"
                          >
                            🔗 {res.url}
                          </a>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-medium text-slate-800 dark:text-slate-100 block text-xs">
                          {res.subjects?.name || "Subject"}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {res.subjects?.code}
                        </span>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <Badge variant="outline" className={`text-xs ${typeMeta.color}`}>
                          {typeMeta.icon} {typeMeta.label}
                        </Badge>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {res.topic ? (
                          <Badge variant="secondary" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                            {res.topic}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(res.id, res.is_published)}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                            res.is_published
                              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                          title="Click to toggle publish status"
                        >
                          {res.is_published ? "Published" : "Draft"}
                        </button>
                      </td>

                      <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(res)}
                          className="text-xs border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(res.id, res.title)}
                          className="text-xs border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal Dialog for Create / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-50">
                {editingResource ? "Edit Academic Resource" : "Add New Academic Resource"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-md">
                  {modalError}
                </div>
              )}

              {/* Subject */}
              <div>
                <label htmlFor="resourceSubjectSelect" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Subject *
                </label>
                <select
                  id="resourceSubjectSelect"
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="resourceTitleInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Resource Title *
                </label>
                <input
                  id="resourceTitleInput"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g. Calculus Derivative Rules Handbook"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="resourceDescriptionInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Description
                </label>
                <textarea
                  id="resourceDescriptionInput"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  placeholder="Brief summary of what this resource covers..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                />
              </div>

              {/* Resource Type & Topic */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="resourceTypeSelect" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Resource Type *
                  </label>
                  <select
                    id="resourceTypeSelect"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AdminResourceItem["resource_type"])}
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                  >
                    <option value="youtube">YouTube Video</option>
                    <option value="formula_sheet">Formula Sheet</option>
                    <option value="notes">Study Notes</option>
                    <option value="pdf">PDF Document</option>
                    <option value="website">Website</option>
                    <option value="other">Reference Material</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="resourceTopicInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Topic / Tag
                  </label>
                  <input
                    id="resourceTopicInput"
                    type="text"
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    placeholder="e.g. Derivatives, OOP"
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* URL */}
              <div>
                <label htmlFor="resourceUrlInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Resource URL
                </label>
                <input
                  id="resourceUrlInput"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://example.com/doc.pdf"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  For YouTube videos, paste the watch link or embed URL.
                </span>
              </div>

              {/* File Upload (Optional) */}
              <div>
                <label htmlFor="resourceFileInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Upload PDF / File (Optional)
                </label>
                <input
                  id="resourceFileInput"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-950 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Uploaded files are stored in the secure academic resources storage.
                </span>
              </div>

              {/* Published Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_published_checkbox"
                  checked={formIsPublished}
                  onChange={(e) => setFormIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                />
                <label htmlFor="is_published_checkbox" className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Publish immediately (visible to students)
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  {submitting ? "Saving..." : editingResource ? "Save Changes" : "Create Resource"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
