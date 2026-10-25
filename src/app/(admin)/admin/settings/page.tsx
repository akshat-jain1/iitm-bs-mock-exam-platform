import React from "react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure global platform defaults and preferences.</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm self-start sm:self-auto">
          Save Changes
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5">
          <h3 className="text-lg font-medium leading-6 text-slate-900 dark:text-slate-50">General Information</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update the institution name and default academic year.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Institution Name</label>
            <input type="text" className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-9 px-3 border" defaultValue="Institute of Technology" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Default Timezone</label>
            <select className="mt-1 block w-full rounded-md border-slate-300 dark:border-slate-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-9 px-3 border bg-white dark:bg-slate-900">
              <option>Asia/Kolkata (IST)</option>
              <option>UTC</option>
              <option>America/New_York (EST)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 sm:rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-5">
          <h3 className="text-lg font-medium leading-6 text-slate-900 dark:text-slate-50">Examination Defaults</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set default behaviors for new examinations.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500" defaultChecked />
            </div>
            <div className="ml-3 text-sm">
              <label className="font-medium text-slate-700 dark:text-slate-200">Enable Autosave by Default</label>
              <p className="text-slate-500 dark:text-slate-400">Student answers will be periodically synchronized to the server.</p>
            </div>
          </div>
          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
            </div>
            <div className="ml-3 text-sm">
              <label className="font-medium text-slate-700 dark:text-slate-200">Auto-publish Results</label>
              <p className="text-slate-500 dark:text-slate-400">Automatically make results visible to students once evaluation completes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
