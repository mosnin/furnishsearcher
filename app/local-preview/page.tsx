import { notFound } from "next/navigation";
import { localPreviewEnabled } from "@/lib/local-preview";
import { LocalPreviewEntry } from "./preview-entry";

export default function LocalPreviewPage() {
  if (!localPreviewEnabled(process.env)) notFound();
  return (
    <LocalPreviewEntry expectedUserId={process.env.LOCAL_PREVIEW_USER_ID!} />
  );
}
