import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type ResumeView, useUiStore } from "@/stores/ui";
import ExperienceBank from "./ExperienceBank";
import SavedResumeLibrary from "./SavedResumeLibrary";
import TailoredTab from "./TailoredTab";
import TemplateEditor from "./TemplateEditor";

export default function ResumePage() {
  const resumeView = useUiStore((store) => store.resumeView);
  const setResumeView = useUiStore((store) => store.setResumeView);
  const selectJob = useUiStore((store) => store.selectJob);
  const setActiveTab = useUiStore((store) => store.setActiveTab);

  return (
    <Tabs
      value={resumeView}
      onValueChange={(next) => {
        setResumeView(next as ResumeView);
      }}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="saved">Saved PDFs</TabsTrigger>
        <TabsTrigger value="bank">Experience bank</TabsTrigger>
        <TabsTrigger value="template">Template</TabsTrigger>
        <TabsTrigger value="tailored">Tailored</TabsTrigger>
      </TabsList>

      <TabsContent value="saved">
        <SavedResumeLibrary
          onOpenJob={(id) => {
            selectJob(id);
            setActiveTab("jobs");
          }}
        />
      </TabsContent>
      <TabsContent value="bank">
        <ExperienceBank />
      </TabsContent>
      <TabsContent value="template">
        <TemplateEditor />
      </TabsContent>
      <TabsContent value="tailored">
        <TailoredTab />
      </TabsContent>
    </Tabs>
  );
}
