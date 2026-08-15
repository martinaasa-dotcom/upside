import {
  buildNoteReport,
  noteReportText,
  type NoteReportInput,
} from "@/lib/note-report";

type NoteInput = Omit<NoteReportInput, "kind">;

export function buildMorningEmailText(input: NoteInput): string {
  return noteReportText(buildNoteReport({ ...input, kind: "morning" }));
}

export function buildCloseEmailText(input: NoteInput): string {
  return noteReportText(buildNoteReport({ ...input, kind: "close" }));
}

export function buildSundayEmailText(input: NoteInput): string {
  return noteReportText(buildNoteReport({ ...input, kind: "sunday" }));
}
