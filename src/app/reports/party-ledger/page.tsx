// /reports/party-ledger → redirect to /parties (select a party to view its ledger)
import { redirect } from 'next/navigation';
export default function PartyLedgerReportPage() { redirect('/parties'); }
