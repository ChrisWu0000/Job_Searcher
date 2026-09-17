import { CheckIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type SavedResume, savedResumeManifestSchema, savedResumeUrl } from "@/lib/resume/saved";
import { cn } from "@/lib/utils";

export default function SavedResumeLibrary({ onOpenJob }: { onOpenJob?: (id: string) => void }) {
  const [resumes, setResumes] = useState<SavedResume[]>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [failedPreviewId, setFailedPreviewId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("./resumes/manifest.json", { signal: controller.signal });
        if (!response.ok) throw new Error("Saved resume files are not available in this build.");
        setResumes(savedResumeManifestSchema.parse(await response.json()));
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Could not load saved resumes.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const visible = (resumes ?? []).filter((resume) =>
    `${resume.company} ${resume.title} ${resume.jobId}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  const selected = visible.find((resume) => resume.jobId === selectedId) ?? visible[0];

  return (
    <section className="space-y-5" aria-label="Saved resumes">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">Your application resumes</h1>
          <p className="text-muted-foreground text-sm">
            Individually tailored to your saved jobs. Preview the finished page, then download your
            PDF.
          </p>
        </div>
        {resumes ? <Badge variant="secondary">{resumes.length} saved resumes</Badge> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border p-6 text-sm">
          {error}
        </p>
      ) : null}
      {!resumes && !error ? <p role="status">Loading saved resumes…</p> : null}
      {resumes ? (
        <div className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-24">
            <div className="relative">
              <SearchIcon className="absolute top-3 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Search saved resumes"
                placeholder="Company, role, or job ID"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {visible.length} of {resumes.length} resumes
            </p>
            <div className="max-h-[65vh] space-y-1 overflow-y-auto">
              {visible.map((resume) => (
                <button
                  key={resume.jobId}
                  type="button"
                  aria-pressed={selected?.jobId === resume.jobId}
                  onClick={() => setSelectedId(resume.jobId)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                    selected?.jobId === resume.jobId
                      ? "border-primary/40 bg-accent"
                      : "border-transparent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-medium text-sm">
                    {resume.company}
                    <CheckIcon className="size-3.5 shrink-0 text-emerald-600" />
                  </span>
                  <span className="mt-1 block text-muted-foreground text-xs leading-relaxed">
                    {resume.title}
                  </span>
                  <span className="mt-2 block text-muted-foreground text-xs">
                    #{resume.jobId} · PDF + LaTeX
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {selected ? (
            <article className="min-w-0 overflow-hidden rounded-xl border bg-card">
              <div className="space-y-4 border-b p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-lg">{selected.company}</h2>
                    <p className="text-muted-foreground text-sm">
                      {selected.title} · #{selected.jobId}
                    </p>
                  </div>
                  <Badge variant="outline">
                    <FileTextIcon className="mr-1 size-3" />
                    Final PDF
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {selected.tailoringNote}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <a href={savedResumeUrl(selected, "pdf")} download>
                      <DownloadIcon />
                      Download PDF
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={savedResumeUrl(selected, "pdf")} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon />
                      Open PDF
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={savedResumeUrl(selected, "tex")} download>
                      LaTeX source
                    </a>
                  </Button>
                  {onOpenJob ? (
                    <Button size="sm" variant="ghost" onClick={() => onOpenJob(selected.jobId)}>
                      View job
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="bg-muted/60 p-3 sm:p-6">
                {failedPreviewId === selected.jobId ? (
                  <p role="alert" className="p-6 text-center text-sm">
                    Preview unavailable. Use Open PDF to view the saved document.
                  </p>
                ) : (
                  <img
                    key={selected.jobId}
                    src={savedResumeUrl(selected, "png")}
                    alt={`Finished resume for ${selected.company}, ${selected.title}`}
                    onError={() => setFailedPreviewId(selected.jobId)}
                    className="mx-auto h-auto w-full max-w-[850px] bg-white shadow-sm"
                    width={1275}
                    height={1650}
                  />
                )}
              </div>
            </article>
          ) : (
            <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              {resumes.length ? "No resumes match your search." : "No saved resumes yet."}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
