import { ActionForm, SubmitButton } from "@/components/action-form";
import { ScopeInput } from "@/components/common";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, dateToISO } from "@/lib/format";
import { saveMeeting } from "@/server/meeting-actions";

type MeetingLike = {
  id: string; committeeId: string; title: string; meetingType: string; meetingDate: Date; startTime: string | null;
  endTime: string | null; location: string | null; description: string | null; notes: string | null; status: string;
};

export function MeetingForm({ scope, meeting, committees, defaultCommitteeId }: { scope: "portal" | "admin"; meeting?: MeetingLike; committees?: { id: string; name: string }[]; defaultCommitteeId?: string }) {
  return (
    <ActionForm action={saveMeeting} className="grid gap-4 sm:grid-cols-2">
      <ScopeInput scope={scope} />
      {meeting && <input type="hidden" name="id" value={meeting.id} />}
      {committees && !meeting && (
        <Field label="Committee" htmlFor="committeeId" className="sm:col-span-2">
          <Select id="committeeId" name="committeeId" required defaultValue={defaultCommitteeId ?? ""}>
            <option value="">Choose a committee…</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Meeting title" htmlFor="title" className="sm:col-span-2">
        <Input id="title" name="title" required maxLength={200} defaultValue={meeting?.title} placeholder="e.g. Monthly Committee Meeting" />
      </Field>
      <Field label="Meeting type" htmlFor="meetingType">
        <Select id="meetingType" name="meetingType" defaultValue={meeting?.meetingType ?? "REGULAR"}><Options labels={MEETING_TYPE_LABELS} /></Select>
      </Field>
      <Field label="Date" htmlFor="meetingDate">
        <Input id="meetingDate" name="meetingDate" type="date" required defaultValue={meeting ? dateToISO(meeting.meetingDate) : ""} />
      </Field>
      <Field label="Start time" htmlFor="startTime">
        <Input id="startTime" name="startTime" type="time" defaultValue={meeting?.startTime ?? ""} />
      </Field>
      <Field label="End time" htmlFor="endTime">
        <Input id="endTime" name="endTime" type="time" defaultValue={meeting?.endTime ?? ""} />
      </Field>
      <Field label="Location" htmlFor="location" className="sm:col-span-2">
        <Input id="location" name="location" maxLength={300} defaultValue={meeting?.location ?? ""} placeholder="Clubhouse meeting room, Zoom link, etc." />
      </Field>
      {meeting && (
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={meeting.status}><Options labels={MEETING_STATUS_LABELS} /></Select>
        </Field>
      )}
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={3} defaultValue={meeting?.description ?? ""} />
      </Field>
      <Field label="Additional notes" htmlFor="notes" className="sm:col-span-2">
        <Textarea id="notes" name="notes" rows={3} defaultValue={meeting?.notes ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>{meeting ? "Save Changes" : "Create Meeting"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
