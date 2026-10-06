import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SavedResumeLibrary from "@/components/resume/SavedResumeLibrary";
import "@/styles/globals.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <main className="mx-auto min-h-screen max-w-[1500px] bg-background px-5 py-8 text-foreground sm:px-8">
        <p className="mb-6 font-semibold tracking-tight">
          JobScope <span className="font-normal text-muted-foreground">/ Saved resumes</span>
        </p>
        <SavedResumeLibrary />
      </main>
    </StrictMode>,
  );
}
