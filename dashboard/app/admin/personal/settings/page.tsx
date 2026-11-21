import SettingsWorkspace from "../../../../components/writing/SettingsWorkspace";

export default async function SettingsHome({searchParams}: {searchParams: Promise<{skill?: string}>}) {
  // Existing skill tokens link to this address from saved writing.
  return <SettingsWorkspace section={(await searchParams).skill ? "writing" : "home"}/>;
}
