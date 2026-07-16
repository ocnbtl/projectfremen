import NotesRoutePage from "../NotesRoutePage";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({
  params
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  return <NotesRoutePage mode="detail" noteId={noteId} />;
}
