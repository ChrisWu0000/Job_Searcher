import {
  BriefcaseIcon,
  DatabaseIcon,
  FileTextIcon,
  ListChecksIcon,
  MoonIcon,
  RefreshCwIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";
import { type ComponentType, useEffect } from "react";
import InspectorPage from "@/components/inspector/InspectorPage";
import JobsPage from "@/components/jobs/JobsPage";
import QueuePage from "@/components/queue/QueuePage";
import ResumePage from "@/components/resume/ResumePage";
import SettingsPage from "@/components/settings/SettingsPage";
import DatabaseCounts from "@/components/shared/DatabaseCounts";
import { useColorScheme } from "@/components/shared/useColorScheme";
import { useContentMessages } from "@/components/shared/useContentMessages";
import SyncPage from "@/components/sync/SyncPage";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getProfile } from "@/lib/db/repo";
import { type NavTab, navTabs, useUiStore } from "@/stores/ui";

const navLabels: Record<NavTab, string> = {
  jobs: "Jobs",
  queue: "Queue",
  resume: "Resume",
  sync: "Sync",
  inspector: "Inspector",
  settings: "Settings",
};

const navIcons: Record<NavTab, ComponentType<{ className?: string }>> = {
  jobs: BriefcaseIcon,
  queue: ListChecksIcon,
  resume: FileTextIcon,
  sync: RefreshCwIcon,
  inspector: DatabaseIcon,
  settings: SettingsIcon,
};

const navPages: Record<NavTab, ComponentType> = {
  jobs: JobsPage,
  queue: QueuePage,
  resume: ResumePage,
  sync: SyncPage,
  inspector: InspectorPage,
  settings: SettingsPage,
};

function tabFromHash(hash: string): NavTab | undefined {
  const candidate = hash.replace(/^#\/?/, "");
  return navTabs.find((tab) => tab === candidate);
}

export default function App() {
  const activeTab = useUiStore((store) => store.activeTab);
  const setActiveTab = useUiStore((store) => store.setActiveTab);
  const { resolved, setScheme } = useColorScheme();
  useContentMessages();

  useEffect(() => {
    const applyHash = () => {
      const tab = tabFromHash(window.location.hash);
      if (tab) setActiveTab(tab);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, [setActiveTab]);

  useEffect(() => {
    void getProfile().catch(() => undefined);
  }, []);

  useEffect(() => {
    const target = `#/${activeTab}`;
    if (window.location.hash !== target) window.location.hash = target;
  }, [activeTab]);

  const ActivePage = navPages[activeTab];

  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b bg-background/95 px-6 py-3 backdrop-blur">
          <span className="font-semibold text-lg tracking-tight">WW++</span>
          <Separator orientation="vertical" className="h-6" />
          <nav className="flex items-center gap-1">
            {navTabs.map((tab) => {
              const Icon = navIcons[tab];
              return (
                <Button
                  key={tab}
                  variant={tab === activeTab ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setActiveTab(tab);
                  }}
                >
                  <Icon className="size-4" />
                  {navLabels[tab]}
                </Button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <DatabaseCounts />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Toggle dark mode"
              onClick={() => {
                setScheme(resolved === "dark" ? "light" : "dark");
              }}
            >
              {resolved === "dark" ? (
                <SunIcon className="size-4" />
              ) : (
                <MoonIcon className="size-4" />
              )}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
          <ActivePage />
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
