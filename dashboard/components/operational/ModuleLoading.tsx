import AppTopNav from "../admin-shell/AppTopNav";
import LogoLoader from "./LogoLoader";

export default function ModuleLoading() {
  return <>
    <AppTopNav showCommandSearch={false} />
    <main aria-busy="true"><LogoLoader viewport /></main>
  </>;
}
