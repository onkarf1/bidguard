import { DealView } from "@/components/DealView";

export default function DealPage({ params }: { params: { address: string } }) {
  return <DealView address={params.address} />;
}
