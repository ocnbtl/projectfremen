import { notFound } from "next/navigation";
import SettingsWorkspace from "../../../../../components/writing/SettingsWorkspace";

export default async function SettingsSection({params}: {params: Promise<{section: string}>}) {
  const {section} = await params;
  if (section !== "writing" && section !== "appearance" && section !== "calendar-map") notFound();
  return <SettingsWorkspace section={section}/>;
}
