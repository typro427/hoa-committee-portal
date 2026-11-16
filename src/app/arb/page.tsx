import { arbCommittee } from "@/server/arb";
import { submitArbRequest } from "@/server/arb-actions";
import { ArbRequestForm } from "@/views/arb-form";

export const metadata = { title: "Submit an Architectural Request" };

export default async function ArbPublicPage() {
  const committee = await arbCommittee();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">Submit an architectural request</h1>
        <p className="mt-1 text-slate-600">
          Planning to build, add on, fence, re-roof, paint, or otherwise change the outside of your home? Submit your plans
          here for review by the {committee?.name ?? "Architectural Review Board"} before work begins.
        </p>
      </div>
      {committee ? (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold">Have these ready if you can:</p>
            <ul className="ml-5 mt-1 list-disc">
              <li>Plat plan (survey / site plan)</li>
              <li>Elevation drawings showing each side</li>
              <li>Utility locations (water, gas, electric; overhead or buried)</li>
            </ul>
            <p className="mt-2">Missing something? Submit anyway and add it later. After construction you&apos;ll upload the building permit.</p>
          </div>
          <ArbRequestForm action={submitArbRequest} />
        </>
      ) : (
        <p className="rounded-xl border bg-white p-6 text-center text-slate-600">Online architectural requests aren&apos;t available right now. Please contact the HOA office.</p>
      )}
    </div>
  );
}
