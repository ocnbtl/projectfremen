import SettingsWorkspace from "../../../../components/writing/SettingsWorkspace";
import {accountSettingsUrl} from "../../../../lib/settings/account-host";

export default async function SettingsHome({searchParams}: {searchParams: Promise<{skill?: string}>}) {
  // Existing skill tokens link to this address from saved writing.
  return <SettingsWorkspace accountUrl={accountSettingsUrl()} section={(await searchParams).skill ? "writing" : "home"}/>;
}
