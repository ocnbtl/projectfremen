import MediaRoutePage from "../MediaRoutePage";

export const dynamic = "force-dynamic";

export default function MediaInUsePage() {
  return <MediaRoutePage mode="index" queueMode="in-use" />;
}
