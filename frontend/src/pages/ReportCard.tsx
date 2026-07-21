import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const Spinner = () => (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const ReportCard = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [html, setHtml] = useState("");
  const [error, setError] = useState(jobId ? "" : "Report card not found.");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!jobId) return () => controller.abort();

    axios.get(`/api/students/report-card/download/${jobId}`, { signal: controller.signal, responseType: "text" })
      .then((response) => setHtml(response.data))
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError("Failed to load report card.");
      });

    return () => controller.abort();
  }, [jobId]);

  const download = async () => {
    if (!jobId || downloading) return;
    setDownloading(true);
    try {
      const response = await axios.get(`/api/students/report-card/download/${jobId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Report-Card-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Report card downloaded.");
    } catch {
      toast.error("Failed to download report card.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="main-content flex min-h-0 flex-1 flex-col bg-[#f8f9fa] p-3 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          Back
        </button>
        <h1 className="text-sm font-semibold text-[#202124] sm:text-base">Report Card</h1>
        <button type="button" onClick={download} disabled={downloading || !html} className="flex min-w-24 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {downloading && <Spinner />}
          {downloading ? "Downloading..." : "Download"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <div className="flex h-full min-h-64 items-center justify-center p-6 text-sm font-medium text-red-600">{error}</div>
        ) : html ? (
          <iframe title="Student report card" srcDoc={html} sandbox="" className="h-full min-h-[70dvh] w-full border-0" />
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center gap-3 text-sm text-slate-500"><Spinner /> Loading report card...</div>
        )}
      </div>
    </main>
  );
};

export default ReportCard;
