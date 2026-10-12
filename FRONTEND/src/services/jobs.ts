import api from "./api";
import type { BackgroundJob } from "../types";

export const getBackgroundJobs = async (): Promise<BackgroundJob[]> => {
  const { data } = await api.get<BackgroundJob[]>("/jobs/");
  return data;
};

export const createInvoiceJob = async (orderId: number): Promise<BackgroundJob> => {
  const { data } = await api.post<BackgroundJob>(`/jobs/invoices/${orderId}`);
  return data;
};

export const createProductImportJob = async (file: File): Promise<BackgroundJob> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<BackgroundJob>("/jobs/imports/products", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};

export const downloadInvoice = async (
  jobId: string,
  orderId: number,
): Promise<void> => {
  const { data } = await api.get<Blob>(`/jobs/${jobId}/download`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `invoice-order-${orderId}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
