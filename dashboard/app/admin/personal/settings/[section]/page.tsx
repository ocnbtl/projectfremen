import { isSettingsSection } from "../../../../../lib/settings/sections";
import { notFound } from "next/navigation";
import SettingsWorkspace from "../../../../../components/writing/SettingsWorkspace";
import {accountSettingsUrl} from "../../../../../lib/settings/account-host";

export default async function SettingsSection({params}: {params: Promise<{section: string}>}) {
  const {section} = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsWorkspace accountUrl={accountSettingsUrl()} section={section}/>;
}
