import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../lib/apiError";
import { useNotificationStore } from "../stores/notificationStore";
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
    if (!focusJobId || !jobsQuery.data) return;
    document.getElementById(`job-${focusJobId}`)?.scrollIntoView({ behavior: "smooth" });
  }, [jobsQuery.data, searchParams]);

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setNotice("");
    importMutation.mutate(file);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold">Background jobs</h1>
      <p className="mb-8 text-sm text-slate-600">
        Track invoice generation and imports while they run in the background.
      </p>

      {user?.role === "admin" && (
        <form onSubmit={submitImport} className="mb-8 rounded-xl border bg-white p-5">
          <h2 className="mb-2 text-lg font-semibold">Import products from CSV</h2>
          <p className="mb-4 text-sm text-slate-600">
            Required columns: name, price, stock. Optional columns: description, image_url.
            Files may be up to 10 MB.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Product CSV file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="min-w-0 flex-1 text-sm"
            />
            <Button type="submit" disabled={!file || importMutation.isPending}>
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
        <div role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {getApiErrorMessage(jobsQuery.error, "Could not load background jobs.")}
          <button type="button" onClick={() => jobsQuery.refetch()} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      {jobsQuery.isPending && <p className="py-8 text-center text-slate-500">Loading jobs...</p>}
      {jobsQuery.data?.length === 0 && (
        <p className="rounded-xl border border-dashed py-12 text-center text-slate-500">
          No background jobs yet. Generate an invoice from an order or start a product import.
        </p>
      )}
      <ul className="space-y-4">
        {jobsQuery.data?.map((job) => (
          <li
            key={job.id}
            id={`job-${job.id}`}
            className="scroll-mt-24 rounded-xl border bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{jobTitle(job)}</h2>
                <p className="mt-1 text-sm text-slate-600">{job.message}</p>
                {job.created_at && (
                  <time className="mt-1 block text-xs text-slate-500" dateTime={job.created_at}>
                    Started {new Date(job.created_at).toLocaleString()}
                  </time>
                )}
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize">
                {job.status}
              </span>
            </div>
            {(job.status === "pending" || job.status === "running") && (
              <div className="mt-4">
                <progress
                  aria-label={`${jobTitle(job)} progress`}
                  max={100}
                  value={job.progress}
                  className="h-2 w-full accent-slate-900"
                />
                <p className="mt-1 text-right text-xs text-slate-500">{job.progress}%</p>
              </div>
            )}
            {job.status === "failed" && job.error && (
              <p role="alert" className="mt-3 text-sm text-red-700">{job.error}</p>
            )}
            {job.kind === "invoice" && job.status === "completed" && (
              <Button
                type="button"
                size="sm"
                className="mt-4"
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
