import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { downloadFile } from "../utils/downloadFile.js";
import { ErrorState, ProfileSkeleton } from "../components/AsyncState.js";
import { Spinner } from "../components/ui/Spinner.js";

const ReportCard = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [html, setHtml] = useState("");
  const [error, setError] = useState(jobId ? "" : "Report card not found.");
  const [downloading, setDownloading] = useState<"pdf" | "html" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!jobId) return () => controller.abort();

    axios.get(`/api/students/report-card/download/${jobId}`, { signal: controller.signal, responseType: "text" })
      .then((response) => setHtml(response.data.includes('name="viewport"') ? response.data : response.data.replace("</head>", '<meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box;overflow-wrap:anywhere}@media(max-width:600px){body{padding:0!important}.container{width:100%;padding:20px 14px!important;border:0!important;border-radius:0!important;box-shadow:none!important}.info-grid{grid-template-columns:1fr!important;gap:10px!important}table{display:block;overflow-x:auto;white-space:nowrap}.container>div[style*="display: flex"]{flex-wrap:wrap;gap:32px}}</style></head>')))
      .catch((requestError) => {
        if (!axios.isCancel(requestError)) setError("Failed to load report card.");
      });

    return () => controller.abort();
  }, [jobId]);

  const download = async (format: "pdf" | "html") => {
    if (!jobId || downloading) return;
    setDownloading(format);
    try {
      const result = await downloadFile(
        `/api/students/report-card/download/${jobId}${format === "pdf" ? "/pdf" : ""}`,
        `Report-Card-${new Date().toISOString().slice(0, 10)}.${format}`,
        format === "pdf" ? "application/pdf" : "text/html",
      );
      toast.success(result === "started" ? `Downloading ${format.toUpperCase()} to Downloads.` : `${format.toUpperCase()} report card downloaded.`);
    } catch {
      toast.error("Failed to download report card.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <main className="main-content flex min-h-0 flex-1 flex-col bg-[#f8f9fa] p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
          Back
        </button>
        <h1 className="text-sm font-semibold text-[#202124] sm:text-base">Report Card</h1>
        <div className="flex gap-2">
          {(["pdf", "html"] as const).map((format) => (
            <button key={format} type="button" onClick={() => download(format)} disabled={downloading !== null || !html} className="flex min-w-20 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
              {downloading === format && <Spinner />}
              {downloading === format ? "Saving..." : format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {error ? (
          <ErrorState message={error} />
        ) : html ? (
          <iframe title="Student report card" srcDoc={html} sandbox="" className="h-full min-h-[70dvh] w-full border-0" />
        ) : (
          <ProfileSkeleton label="Loading report card" />
        )}
      </div>
    </main>
  );
};

export default ReportCard;
