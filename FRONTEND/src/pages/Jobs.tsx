import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BriefcaseBusiness, CheckCircle2, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../lib/apiError";
import { useNotificationStore } from "../stores/notificationStore";
import { getAIUsage } from "../services/ai";
import {
  createProductImportJob,
  downloadInvoice,
  getBackgroundJobs,
} from "../services/jobs";
import type { BackgroundJob } from "../types";

function jobTitle(job: BackgroundJob): string {
  if (job.kind === "invoice") return `Invoice for order #${job.result?.order_id ?? ""}`;
  return "Product CSV import";
}

function isObsoleteDescriptionJob(job: BackgroundJob): boolean {
  return job.message === "Product description queued.";
}

function statusStyle(status: BackgroundJob["status"]) {
  if (status === "completed") return "bg-emerald-50 text-emerald-800";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "running") return "bg-amber-50 text-amber-900";
  return "bg-stone-100 text-slate-600";
}

export default function Jobs() {
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.add);
  const jobsQueryKey = ["background-jobs", user?.id] as const;
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const jobsQuery = useQuery({
    queryKey: jobsQueryKey,
    queryFn: getBackgroundJobs,
    refetchInterval: (query) =>
      query.state.data?.some(
        (job) =>
          !isObsoleteDescriptionJob(job) &&
          (job.status === "pending" || job.status === "running"),
      )
        ? 1500
        : false,
  });
  const visibleJobs = jobsQuery.data?.filter(
    (job) => !isObsoleteDescriptionJob(job),
  );
  const aiUsageQuery = useQuery({
    queryKey: ["ai-usage"],
    queryFn: getAIUsage,
    enabled: user?.role === "admin",
  });
  const importMutation = useMutation({
    mutationFn: createProductImportJob,
    onSuccess: async (job) => {
      setFile(null);
      setNotice("CSV import queued. Progress will update automatically.");
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });
      queryClient.setQueryData<BackgroundJob[]>(jobsQueryKey, (jobs = []) => [
        job,
        ...jobs.filter((existingJob) => existingJob.id !== job.id),
      ]);
    },
  });
  const downloadMutation = useMutation({
    mutationFn: ({ jobId, orderId }: { jobId: string; orderId: number }) =>
      downloadInvoice(jobId, orderId),
    onSuccess: (_result, { jobId, orderId }) => {
      addNotification({
        title: "Invoice downloaded",
        message: `The invoice for order #${orderId} has been downloaded.`,
        dedupeKey: `invoice-downloaded:${jobId}`,
      });
    },
  });

  useEffect(() => {
    const focusJobId = searchParams.get("job");
    if (!focusJobId || !visibleJobs) return;
    document.getElementById(`job-${focusJobId}`)?.scrollIntoView({ behavior: "smooth" });
  }, [visibleJobs, searchParams]);

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setNotice("");
    importMutation.mutate(file);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">STORE OPERATIONS</p>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-900">
            <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Background jobs</h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          Track invoice generation and imports while they run in the background.
        </p>
      </div>

      {user?.role === "admin" && (
        <section aria-labelledby="ai-usage-heading" className="mb-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="ai-usage-heading" className="font-semibold text-slate-950">AI usage today</h2>
                  <p className="text-xs text-slate-500">UTC daily request and estimated-token budgets</p>
            </div>
          </div>
          {aiUsageQuery.data ? (
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <p><span className="font-semibold">{aiUsageQuery.data.total_requests}</span> / {aiUsageQuery.data.daily_limit} provider attempts used</p>
              {Object.entries(aiUsageQuery.data.provider_requests).map(([provider, count]) => (
                <p key={provider} className="capitalize">{provider}: <span className="font-semibold">{count}</span></p>
              ))}
              <p className="text-slate-500">{aiUsageQuery.data.remaining_requests} provider attempts remaining</p>
              <p>
                <span className="font-semibold">
                  {aiUsageQuery.data.estimated_tokens_used.toLocaleString()}
                </span>
                {" / "}
                {aiUsageQuery.data.estimated_token_limit.toLocaleString()} estimated tokens reserved
              </p>
              <p className="text-slate-500">
                {aiUsageQuery.data.estimated_tokens_remaining.toLocaleString()} estimated tokens remaining
              </p>
            </div>
          ) : null}
          {aiUsageQuery.data && aiUsageQuery.data.details.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-stone-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Provider / model</th>
                    <th className="py-2 pr-3 font-medium">Feature</th>
                    <th className="py-2 pr-3 font-medium">Attempts</th>
                    <th className="py-2 pr-3 font-medium">Success / failed</th>
                    <th className="py-2 pr-3 font-medium">Cache hits</th>
                    <th className="py-2 font-medium">Estimated tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {aiUsageQuery.data.details.map((detail) => (
                    <tr
                      key={`${detail.provider}:${detail.model}:${detail.feature}`}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <span className="font-medium capitalize">{detail.provider}</span>
                        <span className="block text-slate-500">{detail.model}</span>
                      </td>
                      <td className="py-2 pr-3">{detail.feature.replaceAll("_", " ")}</td>
                      <td className="py-2 pr-3">{detail.attempts}</td>
                      <td className="py-2 pr-3">{detail.successes} / {detail.failures}</td>
                      <td className="py-2 pr-3">{detail.cache_hits}</td>
                      <td className="py-2">{detail.estimated_tokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aiUsageQuery.data && (
            <p className="mt-3 text-xs text-slate-500">
              Token figures are conservative estimates for budgeting, not provider billing totals. Failed attempts retain their full reservation; successful calls use provider-reported token usage when available.
            </p>
          )}
          {!aiUsageQuery.data && (aiUsageQuery.isError ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {getApiErrorMessage(aiUsageQuery.error, "Could not load AI usage.")}
              <button type="button" onClick={() => void aiUsageQuery.refetch()} className="ml-2 underline">
                Retry
              </button>
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Loading AI usage...</p>
          ))}
        </section>
      )}

      {user?.role === "admin" && (
        <form onSubmit={submitImport} className="mb-9 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Import products from CSV</h2>
              <p className="mt-1 text-sm text-slate-600">
                Add products to your catalogue in one batch.
              </p>
            </div>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Required columns: name, price, stock. Optional columns: description, image_url.
            Files may be up to 10 MB.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Product CSV file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-[#fafaf8] px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <Button type="submit" disabled={!file || importMutation.isPending} className="rounded-full">
              {importMutation.isPending ? "Queueing..." : "Start import"}
            </Button>
          </div>
          {importMutation.error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {getApiErrorMessage(importMutation.error, "Could not start the product import.")}
            </p>
          )}
          {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}
        </form>
      )}

      {jobsQuery.error && (
        <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {getApiErrorMessage(jobsQuery.error, "Could not load background jobs.")}
          <button type="button" onClick={() => jobsQuery.refetch()} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recent activity</h2>
          <p className="mt-1 text-sm text-slate-500">Job progress and completed work will show up here.</p>
        </div>
        {visibleJobs && visibleJobs.length > 0 && (
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-slate-600">
            {visibleJobs.length} {visibleJobs.length === 1 ? "job" : "jobs"}
          </span>
        )}
      </div>

      {jobsQuery.isPending && <p className="rounded-2xl border border-stone-200 bg-white py-12 text-center text-slate-500">Loading jobs...</p>}
      {visibleJobs?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-800" aria-hidden="true" />
          <p className="font-medium text-slate-900">You’re all caught up</p>
          <p className="mt-1 text-sm text-slate-500">
            No background jobs yet. Create an invoice or start a product import.
          </p>
        </div>
      )}
      <ul className="space-y-4">
        {visibleJobs?.map((job) => (
          <li
            key={job.id}
            id={`job-${job.id}`}
            className="scroll-mt-24 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-emerald-900">
                  {job.kind === "invoice"
                    ? <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
                    : job.kind === "product_import"
                      ? <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                      : <Activity className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div>
                <h2 className="font-semibold text-slate-950">{jobTitle(job)}</h2>
                <p className="mt-1 text-sm text-slate-600">{job.message}</p>
                {job.created_at && (
                  <time className="mt-2 block text-xs text-slate-500" dateTime={job.created_at}>
                    Started {new Date(job.created_at).toLocaleString()}
                  </time>
                )}
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusStyle(job.status)}`}>
                {job.status}
              </span>
            </div>
            {(job.status === "pending" || job.status === "running") && (
              <div className="mt-5 border-t border-stone-100 pt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                    <LoaderCircle className="h-4 w-4 animate-spin text-emerald-800" aria-hidden="true" />
                    {job.status === "pending" ? "Waiting to start" : "Processing"}
                  </span>
                  <span className="font-medium text-slate-700">{job.progress}%</span>
                </div>
                <progress
                  aria-label={`${jobTitle(job)} progress`}
                  max={100}
                  value={job.progress}
                  className="h-2 w-full accent-emerald-800"
                />
              </div>
            )}
            {job.status === "failed" && job.error && (
              <p role="alert" className="mt-3 text-sm text-red-700">{job.error}</p>
            )}
            {job.kind === "invoice" && job.status === "completed" && (
              <Button
                type="button"
                size="sm"
                className="mt-4 rounded-full"
                disabled={downloadMutation.isPending}
                onClick={() => {
                  if (job.result?.order_id) {
                    downloadMutation.mutate({
                      jobId: job.id,
                      orderId: job.result.order_id,
                    });
                  }
                }}
              >
                Download invoice PDF
              </Button>
            )}
            {job.kind === "product_import" && job.result && (
              <div className="mt-3 text-sm text-slate-600">
                Imported {job.result.imported ?? 0} of {job.result.processed ?? 0} rows.
                {(job.result.errors?.length ?? 0) > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-medium">Show rejected rows</summary>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {job.result.errors?.map((error) => <li key={error}>{error}</li>)}
                    </ul>
                    {job.result.errors_truncated && (
                      <p className="mt-2">Only the first 100 row errors are shown.</p>
                    )}
                  </details>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {downloadMutation.error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {getApiErrorMessage(downloadMutation.error, "Could not download the invoice.")}
        </p>
      )}
    </main>
  );
}
