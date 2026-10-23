import { DesignerPage } from "@/components/admin/designer/designer-page";

export const dynamic = "force-dynamic";

export default function HomeDesign() {
  return <DesignerPage target={{ kind: "home" }} />;
}
