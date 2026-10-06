import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type InspectorView, useUiStore } from "@/stores/ui";
import EventLog from "./EventLog";
import TableBrowser from "./TableBrowser";

export default function InspectorPage() {
  const view = useUiStore((store) => store.inspectorView);
  const setView = useUiStore((store) => store.setInspectorView);
  const target = useUiStore((store) => store.inspectorTarget);
  const setInspectorTable = useUiStore((store) => store.setInspectorTable);
  const setInspectorRecordId = useUiStore((store) => store.setInspectorRecordId);
  const clearInspectorTarget = useUiStore((store) => store.clearInspectorTarget);

  useEffect(() => {
    if (!target) return;
    setView("tables");
    setInspectorTable(target.table);
    setInspectorRecordId(target.id);
    clearInspectorTarget();
  }, [target, setView, setInspectorTable, setInspectorRecordId, clearInspectorTarget]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inspector</CardTitle>
        <CardDescription>
          Every table, every engine event, and every model round-trip in one generic browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={view}
          onValueChange={(next) => {
            setView(next as InspectorView);
          }}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>
          <TabsContent value="tables">
            <TableBrowser />
          </TabsContent>
          <TabsContent value="events">
            <EventLog />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
