import { redirect } from 'next/navigation';
// /parties/[id]/edit → editing is inline on the detail page
export default async function PartyEditRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parties/${id}`);
}
